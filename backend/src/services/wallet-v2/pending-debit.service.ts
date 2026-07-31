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
   * All validations happen BEFORE debit. Any error causes full rollback.
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

        // Advisory lock per ride
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`wallet-settlement:${rideId}`]
        );

        // Lock pending_debit row
        const { rows: lockedRows } = await client.query(
          `SELECT id, ride_id, driver_id, fee_pending_cents, fee_collected_cents, fee_amount_cents, status
           FROM pending_debits WHERE id = $1 AND driver_id = $2 FOR UPDATE`,
          [p.id, driverId]
        );

        if (!lockedRows[0]) {
          await client.query('ROLLBACK');
          continue; // Row disappeared — try next pending
        }

        const lockedRow = lockedRows[0];
        if (lockedRow.status !== 'pending') {
          await client.query('ROLLBACK');
          continue; // Already resolved
        }

        const lockedFee = BigInt(lockedRow.fee_pending_cents);
        if (lockedFee !== feePending) {
          await client.query('ROLLBACK');
          throw new Error(`PENDING_DEBIT_ECONOMIC_MISMATCH: expected ${feePending}, found ${lockedFee}`);
        }

        // Lock and validate ride_fee_splits BEFORE debit
        const { rows: splitRows } = await client.query(
          `SELECT ride_id, driver_id, territory_id, manager_id, manager_assignment_id,
                  fee_amount_cents, fee_collected_cents, fee_pending_cents,
                  manager_commission_rate_bps, reference_month, collection_status
           FROM ride_fee_splits WHERE ride_id = $1 FOR UPDATE`,
          [rideId]
        );

        if (splitRows.length !== 1) {
          await client.query('ROLLBACK');
          throw Object.assign(
            new Error(`Expected exactly 1 split for ride ${rideId}, found ${splitRows.length}`),
            { code: 'PENDING_DEBIT_SPLIT_MISSING' }
          );
        }

        const split = splitRows[0];

        // Validate split consistency with pending_debit
        if (split.driver_id !== driverId) {
          await client.query('ROLLBACK');
          throw Object.assign(new Error('Split driver mismatch'), { code: 'PENDING_DEBIT_SPLIT_MISMATCH' });
        }
        if (BigInt(split.fee_pending_cents) !== feePending) {
          await client.query('ROLLBACK');
          throw Object.assign(new Error('Split fee_pending mismatch'), { code: 'PENDING_DEBIT_SPLIT_MISMATCH' });
        }
        if (BigInt(split.fee_collected_cents) + BigInt(split.fee_pending_cents) !== BigInt(split.fee_amount_cents)) {
          await client.query('ROLLBACK');
          throw Object.assign(new Error('Split collected+pending != total'), { code: 'PENDING_DEBIT_SPLIT_MISMATCH' });
        }
        if (!['pending', 'partial'].includes(split.collection_status)) {
          await client.query('ROLLBACK');
          throw Object.assign(new Error(`Split status '${split.collection_status}' not resolvable`), { code: 'PENDING_DEBIT_SPLIT_MISMATCH' });
        }

        // All validations passed — execute debit
        const input: PendingDebitExecutionInput = { driverId, pendingDebitId, rideId, feePendingCents: feePending };
        await executor.resolvePendingInClient(client, input);

        // Update pending_debits
        await client.query(
          "UPDATE pending_debits SET status = 'resolved', fee_collected_cents = fee_amount_cents, fee_pending_cents = 0, resolved_at = NOW() WHERE id = $1",
          [p.id]
        );

        // Mark split as collected (requires exactly 1 row)
        await feeSplitService.markCollectedInClient(client, rideId);

        // Incremental territorial recognition using persisted snapshot
        if (split.territory_id) {
          const previouslyCollected = BigInt(split.fee_collected_cents);
          const totalNowCollected = BigInt(split.fee_amount_cents);
          const incrementalPlatformFee = totalNowCollected - previouslyCollected;

          if (incrementalPlatformFee > 0n) {
            const rateBps = split.manager_commission_rate_bps;
            const targetManagerShare = applyBasisPoints(totalNowCollected, rateBps);
            const previousManagerShare = applyBasisPoints(previouslyCollected, rateBps);
            const incrementalManagerShare = targetManagerShare - previousManagerShare;

            await territoryLedgerService.recordCollectedFeeInClient(
              client,
              split.territory_id,
              split.manager_id,
              split.manager_assignment_id,
              incrementalPlatformFee,
              incrementalManagerShare,
              rideId,
              split.reference_month,
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
        if (err?.code === 'PENDING_DEBIT_SPLIT_MISSING' || err?.code === 'PENDING_DEBIT_SPLIT_MISMATCH') { throw err; }

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
