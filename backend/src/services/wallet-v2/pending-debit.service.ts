import { Pool, PoolClient } from 'pg';
import { PendingDebitExecutor, PendingDebitExecutionInput } from '../finance/annual-incentive-shadow.service';

export class PendingDebitService {
  constructor(private pool: Pool) {}

  async create(params: { rideId: string; driverId: string; finalPriceCents: bigint; feeAmountCents: bigint; reservedCents: bigint; feeCollectedCents?: bigint }): Promise<{ id: bigint; already_processed: boolean }> {
    const key = `pending_debit:${params.rideId}`;
    const existing = await this.pool.query('SELECT id FROM pending_debits WHERE idempotency_key = $1', [key]);
    if (existing.rows[0]) return { id: BigInt(existing.rows[0].id), already_processed: true };

    const collected = params.feeCollectedCents ?? BigInt(0);
    const pending = params.feeAmountCents - collected;

    const r = await this.pool.query(
      `INSERT INTO pending_debits (ride_id, driver_id, final_price_cents, fee_percent_snapshot, fee_amount_cents, fee_collected_cents, fee_pending_cents, reserved_amount_cents, reason, status, idempotency_key)
       VALUES ($1,$2,$3,18.00,$4,$5,$6,$7,'platform_fee','pending',$8) RETURNING id`,
      [params.rideId, params.driverId, params.finalPriceCents.toString(), params.feeAmountCents.toString(), collected.toString(), pending.toString(), params.reservedCents.toString(), key]
    );
    return { id: BigInt(r.rows[0].id), already_processed: false };
  }

  async resolveOnRecharge(
    driverId: string,
    executor: PendingDebitExecutor,
    feeSplitService: any,
    territoryLedgerService: any,
  ): Promise<number> {
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

        // Lock the pending_debit row and validate
        const locked = await client.query(
          `SELECT id, ride_id, driver_id, fee_pending_cents, fee_collected_cents, fee_amount_cents, status
           FROM pending_debits WHERE id = $1 AND driver_id = $2 FOR UPDATE`,
          [p.id, driverId]
        );

        if (!locked.rows[0]) {
          await client.query('ROLLBACK');
          break;
        }

        const lockedRow = locked.rows[0];

        // Validate status is still pending
        if (lockedRow.status !== 'pending') {
          await client.query('ROLLBACK');
          continue; // Already resolved by concurrent process
        }

        // Validate economic consistency
        const lockedFee = BigInt(lockedRow.fee_pending_cents);
        if (lockedFee !== feePending) {
          await client.query('ROLLBACK');
          throw new Error(`PENDING_DEBIT_ECONOMIC_MISMATCH: expected ${feePending}, found ${lockedFee}`);
        }

        // Execute the pending resolve through the executor (wallet debit + optional incentive)
        const input: PendingDebitExecutionInput = {
          driverId,
          pendingDebitId,
          rideId,
          feePendingCents: feePending,
        };

        await executor.resolvePendingInClient(client, input);

        // Update pending_debits status within the same transaction
        await client.query(
          "UPDATE pending_debits SET status = 'resolved', fee_collected_cents = fee_amount_cents, fee_pending_cents = 0, resolved_at = NOW() WHERE id = $1",
          [p.id]
        );

        await client.query('COMMIT');

        // Post-commit effects (NOT atomic with the resolution)
        try {
          await feeSplitService.markCollected(rideId);
        } catch { /* post-commit, non-fatal */ }

        try {
          const split = await this.pool.query('SELECT territory_id, manager_id, manager_share_cents, reference_month FROM ride_fee_splits WHERE ride_id = $1', [rideId]);
          if (split.rows[0]?.territory_id) {
            await territoryLedgerService.recordFeeShare(split.rows[0].territory_id, split.rows[0].manager_id, BigInt(split.rows[0].manager_share_cents), rideId, split.rows[0].reference_month);
          }
        } catch { /* post-commit, non-fatal */ }

        resolved++;
      } catch (err: any) {
        try { await client.query('ROLLBACK'); } catch { /* ignore rollback error */ }

        // On insufficient balance, stop processing
        if (err?.message?.includes('INSUFFICIENT_BALANCE')) {
          await this.pool.query('UPDATE pending_debits SET attempts = attempts + 1 WHERE id = $1', [p.id]);
          break;
        }

        // On shadow configuration error, stop
        if (err?.message?.includes('SHADOW_CONFIGURATION_INVALID')) {
          throw err;
        }

        // Other errors: increment attempts and break
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
