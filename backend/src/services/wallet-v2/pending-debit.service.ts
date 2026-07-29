import { Pool, PoolClient } from 'pg';
import { PendingDebitExecutor, PendingDebitExecutionInput } from '../finance/annual-incentive-shadow.service';
import { assertSettlementActive } from './settlement-gate';
import { applyBasisPoints } from '../finance/territory/monetary';
import { TerritoryLedgerService } from './territory-ledger.service';
import { FeeSplitService } from './fee-split.service';

export class PendingDebitService {
  constructor(private pool: Pool) {}

  async create(params: { rideId: string; driverId: string; finalPriceCents: bigint; feeAmountCents: bigint; reservedCents: bigint; feeCollectedCents?: bigint }): Promise<{ id: bigint; already_processed: boolean }> {
    const key = `pending_debit:${params.rideId}`;
    const existing = await this.pool.query('SELECT id FROM pending_debits WHERE idempotency_key = $1', [key]);
    if (existing.rows[0]) return { id: BigInt(existing.rows[0].id), already_processed: true };

    const collected = params.feeCollectedCents ?? 0n;
    const pending = params.feeAmountCents - collected;

    const r = await this.pool.query(
      `INSERT INTO pending_debits (ride_id, driver_id, final_price_cents, fee_percent_snapshot, fee_amount_cents, fee_collected_cents, fee_pending_cents, reserved_amount_cents, reason, status, idempotency_key)
       VALUES ($1,$2,$3,18.00,$4,$5,$6,$7,'platform_fee','pending',$8) RETURNING id`,
      [params.rideId, params.driverId, params.finalPriceCents.toString(), params.feeAmountCents.toString(), collected.toString(), pending.toString(), params.reservedCents.toString(), key]
    );
    return { id: BigInt(r.rows[0].id), already_processed: false };
  }

  /** Creates pending debit inside caller's transaction */
  async createInClient(client: PoolClient, params: { rideId: string; driverId: string; finalPriceCents: bigint; feeAmountCents: bigint; reservedCents: bigint; feeCollectedCents?: bigint }): Promise<{ id: bigint; already_processed: boolean }> {
    const key = `pending_debit:${params.rideId}`;
    const existing = await client.query('SELECT id FROM pending_debits WHERE idempotency_key = $1', [key]);
    if (existing.rows[0]) return { id: BigInt(existing.rows[0].id), already_processed: true };

    const collected = params.feeCollectedCents ?? 0n;
    const pending = params.feeAmountCents - collected;

    const r = await client.query(
      `INSERT INTO pending_debits (ride_id, driver_id, final_price_cents, fee_percent_snapshot, fee_amount_cents, fee_collected_cents, fee_pending_cents, reserved_amount_cents, reason, status, idempotency_key)
       VALUES ($1,$2,$3,18.00,$4,$5,$6,$7,'platform_fee','pending',$8) RETURNING id`,
      [params.rideId, params.driverId, params.finalPriceCents.toString(), params.feeAmountCents.toString(), collected.toString(), pending.toString(), params.reservedCents.toString(), key]
    );
    return { id: BigInt(r.rows[0].id), already_processed: false };
  }

  /**
   * Resolves pending debits on recharge — fully atomic.
   * All financial writes (debit, split update, territory ledger) happen
   * in the same transaction. No post-commit effects.
   */
  async resolveOnRecharge(
    driverId: string,
    executor: PendingDebitExecutor,
    feeSplitService: FeeSplitService,
    territoryLedgerService: TerritoryLedgerService,
  ): Promise<number> {
    assertSettlementActive();
    const pendings = await this.pool.query(
      "SELECT id, ride_id, fee_pending_cents, driver_id FROM pending_debits WHERE driver_id = $1 AND status = 'pending' ORDER BY created_at ASC",
      [driverId]
    );

    let resolved = 0;
    for (const p of pendings.rows) {
      const feePending = BigInt(p.fee_pending_cents);
      const pendingDebitId = p.id.toString();
      const rideId = p.ride_id;

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Advisory lock per ride (same as settlement)
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`wallet-settlement:${rideId}`]
        );

        // Lock the pending_debit row and validate
        const locked = await client.query(
          `SELECT id, ride_id, driver_id, fee_pending_cents, fee_collected_cents, fee_amount_cents, status
           FROM pending_debits WHERE id = $1 AND driver_id = $2 FOR UPDATE`,
          [p.id, driverId]
        );

        if (!locked.rows[0]) { await client.query('ROLLBACK'); break; }
        const lockedRow = locked.rows[0];
        if (lockedRow.status !== 'pending') { await client.query('ROLLBACK'); continue; }

        const lockedFee = BigInt(lockedRow.fee_pending_cents);
        if (lockedFee !== feePending) {
          await client.query('ROLLBACK');
          throw new Error(`PENDING_DEBIT_ECONOMIC_MISMATCH: expected ${feePending}, found ${lockedFee}`);
        }

        // Execute wallet debit (+ optional annual incentive)
        const input: PendingDebitExecutionInput = { driverId, pendingDebitId, rideId, feePendingCents: feePending };
        await executor.resolvePendingInClient(client, input);

        // Update pending_debits within the same transaction
        await client.query(
          "UPDATE pending_debits SET status = 'resolved', fee_collected_cents = fee_amount_cents, fee_pending_cents = 0, resolved_at = NOW() WHERE id = $1",
          [p.id]
        );

        // Load persisted snapshot from ride_fee_splits (NEVER recalculate)
        const { rows: [splitRow] } = await client.query(
          `SELECT territory_id, manager_id, manager_assignment_id,
                  fee_amount_cents, fee_collected_cents, manager_commission_rate_bps, reference_month
           FROM ride_fee_splits WHERE ride_id = $1`,
          [rideId]
        );

        // Mark split as fully collected
        await feeSplitService.markCollectedInClient(client, rideId);

        // Incremental territorial recognition using persisted snapshot
        if (splitRow?.territory_id) {
          const previouslyCollected = BigInt(splitRow.fee_collected_cents);
          const totalNowCollected = BigInt(splitRow.fee_amount_cents);
          const incrementalPlatformFee = totalNowCollected - previouslyCollected;

          if (incrementalPlatformFee > 0n) {
            const targetManagerShare = applyBasisPoints(totalNowCollected, splitRow.manager_commission_rate_bps);
            const previousManagerShare = applyBasisPoints(previouslyCollected, splitRow.manager_commission_rate_bps);
            const incrementalManagerShare = targetManagerShare - previousManagerShare;

            await territoryLedgerService.recordCollectedFeeInClient(
              client,
              splitRow.territory_id,
              splitRow.manager_id,
              splitRow.manager_assignment_id,
              incrementalPlatformFee,
              incrementalManagerShare,
              rideId,
              splitRow.reference_month,
              `resolve:${pendingDebitId}`,
            );
          }
        }

        await client.query('COMMIT');
        resolved++;
      } catch (err: any) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }

        if (err?.message?.includes('INSUFFICIENT_BALANCE')) {
          await this.pool.query('UPDATE pending_debits SET attempts = attempts + 1 WHERE id = $1', [p.id]);
          break;
        }
        if (err?.message?.includes('SHADOW_CONFIGURATION_INVALID')) { throw err; }

        await this.pool.query('UPDATE pending_debits SET attempts = attempts + 1 WHERE id = $1', [p.id]);
        break;
      } finally {
        client.release();
      }
    }
    return resolved;
  }

  async getDriverPendings(driverId: string): Promise<any[]> {
    const r = await this.pool.query("SELECT * FROM pending_debits WHERE driver_id = $1 AND status = 'pending' ORDER BY created_at", [driverId]);
    return r.rows;
  }
}
