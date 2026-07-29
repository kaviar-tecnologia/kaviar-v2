import { Pool, PoolClient } from 'pg';
import { applyBasisPoints, PLATFORM_FEE_RATE_BPS, MANAGER_COMMISSION_RATE_BPS } from '../finance/territory/monetary';

export const COMPETENCE_TIMEZONE = 'America/Sao_Paulo';

/**
 * Computes reference month from a Date using America/Sao_Paulo timezone.
 * No service should call new Date() to derive competence — use this function
 * with the persisted recognizedAt.
 */
export function referenceMonthFromDate(date: Date, timezone: string = COMPETENCE_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
}

export interface FeeSplit {
  fee_amount_cents: bigint;
  matrix_share_cents: bigint;
  manager_share_cents: bigint;
}

export interface FeeSplitSnapshot {
  id: bigint;
  alreadyProcessed: boolean;
  rideId: string;
  feeAmountCents: bigint;
  matrixShareCents: bigint;
  managerShareCents: bigint;
  referenceMonth: string;
  territoryId: string | null;
  managerId: string | null;
  managerAssignmentId: string | null;
  recognizedAt: Date;
  platformFeeRateBps: number;
  managerCommissionRateBps: number;
  feeCollectedCents: bigint;
  feePendingCents: bigint;
  collectionStatus: string;
}

export interface RecordSplitParams {
  rideId: string;
  driverId: string;
  finalPriceCents: bigint;
  territoryId: string | null;
  managerId: string | null;
  managerAssignmentId: string | null;
  recognizedAt: Date;
  referenceMonth: string;
  platformFeeRateBps: number;
  managerCommissionRateBps: number;
  feeCollectedCents: bigint;
  feePendingCents: bigint;
  collectionStatus: 'collected' | 'pending' | 'partial';
}

export class FeeSplitService {
  constructor(private pool: Pool) {}

  calculateSplit(finalPriceCents: bigint): FeeSplit {
    const fee = applyBasisPoints(finalPriceCents, PLATFORM_FEE_RATE_BPS);
    const manager = applyBasisPoints(fee, MANAGER_COMMISSION_RATE_BPS);
    const matrix = fee - manager;
    return { fee_amount_cents: fee, matrix_share_cents: matrix, manager_share_cents: manager };
  }

  /**
   * Check if a split already exists for this ride. Returns persisted snapshot or null.
   * Must be called inside a transaction (uses client).
   */
  async getExistingSnapshot(client: PoolClient, rideId: string): Promise<FeeSplitSnapshot | null> {
    const { rows } = await client.query(
      `SELECT id, ride_id, fee_amount_cents, matrix_share_cents, manager_share_cents,
              reference_month, territory_id, manager_id, manager_assignment_id,
              recognized_at, platform_fee_rate_bps, manager_commission_rate_bps,
              fee_collected_cents, fee_pending_cents, collection_status
       FROM ride_fee_splits WHERE ride_id = $1`,
      [rideId]
    );
    if (rows.length === 0) return null;
    return this.mapSnapshot(rows[0], true);
  }

  /**
   * Records a fee split inside the caller's transaction.
   * Validates invariants before INSERT.
   * On idempotency conflict, returns the persisted snapshot.
   */
  async recordSplitInClient(client: PoolClient, params: RecordSplitParams): Promise<FeeSplitSnapshot> {
    // Validate invariants
    const split = this.calculateSplit(params.finalPriceCents);
    if (params.feeCollectedCents < 0n) throw new Error('INVARIANT: feeCollectedCents must be >= 0');
    if (params.feePendingCents < 0n) throw new Error('INVARIANT: feePendingCents must be >= 0');
    if (params.feeCollectedCents + params.feePendingCents !== split.fee_amount_cents) {
      throw new Error(`INVARIANT: feeCollected(${params.feeCollectedCents}) + feePending(${params.feePendingCents}) != feeAmount(${split.fee_amount_cents})`);
    }
    if (params.platformFeeRateBps < 0 || params.platformFeeRateBps > 10000) throw new Error('INVARIANT: platformFeeRateBps out of range');
    if (params.managerCommissionRateBps < 0 || params.managerCommissionRateBps > 10000) throw new Error('INVARIANT: managerCommissionRateBps out of range');

    // Validate collectionStatus consistency
    if (params.collectionStatus === 'collected' && (params.feePendingCents !== 0n || params.feeCollectedCents !== split.fee_amount_cents)) {
      throw new Error('INVARIANT: collected status requires pending=0 and collected=total');
    }
    if (params.collectionStatus === 'pending' && params.feeCollectedCents !== 0n) {
      throw new Error('INVARIANT: pending status requires collected=0');
    }
    if (params.collectionStatus === 'partial' && (params.feeCollectedCents <= 0n || params.feePendingCents <= 0n)) {
      throw new Error('INVARIANT: partial status requires collected>0 and pending>0');
    }

    const key = `ride_fee_split:${params.rideId}`;

    // Check idempotency
    const existing = await this.getExistingSnapshot(client, params.rideId);
    if (existing) return existing;

    const { rows } = await client.query(
      `INSERT INTO ride_fee_splits (
         ride_id, driver_id, final_price_cents,
         fee_percent, fee_amount_cents, fee_collected_cents, fee_pending_cents,
         matrix_share_percent, matrix_share_cents,
         manager_share_percent, manager_share_cents,
         territory_id, manager_id, manager_assignment_id,
         reference_month, collection_status,
         recognized_at, recognized_at_source,
         platform_fee_rate_bps, manager_commission_rate_bps,
         idempotency_key
       ) VALUES (
         $1, $2, $3,
         18.00, $4, $5, $6,
         60.00, $7,
         40.00, $8,
         $9, $10, $11,
         $12, $13,
         $14, 'DB_SETTLEMENT_CLOCK',
         $15, $16,
         $17
       ) RETURNING id, ride_id, fee_amount_cents, matrix_share_cents, manager_share_cents,
                   reference_month, territory_id, manager_id, manager_assignment_id,
                   recognized_at, platform_fee_rate_bps, manager_commission_rate_bps,
                   fee_collected_cents, fee_pending_cents, collection_status`,
      [
        params.rideId, params.driverId, params.finalPriceCents.toString(),
        split.fee_amount_cents.toString(), params.feeCollectedCents.toString(), params.feePendingCents.toString(),
        split.matrix_share_cents.toString(),
        split.manager_share_cents.toString(),
        params.territoryId, params.managerId, params.managerAssignmentId,
        params.referenceMonth, params.collectionStatus,
        params.recognizedAt,
        params.platformFeeRateBps, params.managerCommissionRateBps,
        key,
      ]
    );

    return this.mapSnapshot(rows[0], false);
  }

  /**
   * Marks a split as fully collected. Used by pending debit resolution.
   */
  async markCollectedInClient(client: PoolClient, rideId: string): Promise<void> {
    await client.query(
      `UPDATE ride_fee_splits
       SET fee_collected_cents = fee_amount_cents, fee_pending_cents = 0,
           collection_status = 'collected'
       WHERE ride_id = $1 AND collection_status IN ('pending', 'partial')`,
      [rideId]
    );
  }

  // Legacy method kept for backward compatibility during transition
  async recordSplit(params: {
    rideId: string; driverId: string; finalPriceCents: bigint;
    territoryId?: string; managerId?: string; collected: boolean;
  }): Promise<{ id: bigint; already_processed: boolean } & FeeSplit> {
    const key = `ride_fee_split:${params.rideId}`;
    const existing = await this.pool.query(
      `SELECT id, fee_amount_cents, matrix_share_cents, manager_share_cents
       FROM ride_fee_splits WHERE idempotency_key = $1`, [key]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      return {
        fee_amount_cents: BigInt(row.fee_amount_cents),
        matrix_share_cents: BigInt(row.matrix_share_cents),
        manager_share_cents: BigInt(row.manager_share_cents),
        id: BigInt(row.id), already_processed: true,
      };
    }
    const split = this.calculateSplit(params.finalPriceCents);
    const collectedCents = params.collected ? split.fee_amount_cents : 0n;
    const pendingCents = params.collected ? 0n : split.fee_amount_cents;
    const status = params.collected ? 'collected' : 'pending';
    const month = referenceMonthFromDate(new Date());
    const r = await this.pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_percent, fee_amount_cents, fee_collected_cents, fee_pending_cents, matrix_share_percent, matrix_share_cents, manager_share_percent, manager_share_cents, territory_id, manager_id, reference_month, collection_status, recognized_at, recognized_at_source, platform_fee_rate_bps, manager_commission_rate_bps, idempotency_key)
       VALUES ($1,$2,$3,18.00,$4,$5,$6,60.00,$7,40.00,$8,$9,$10,$11,$12,clock_timestamp(),'DB_SETTLEMENT_CLOCK',1800,4000,$13) RETURNING id`,
      [params.rideId, params.driverId, params.finalPriceCents.toString(), split.fee_amount_cents.toString(), collectedCents.toString(), pendingCents.toString(), split.matrix_share_cents.toString(), split.manager_share_cents.toString(), params.territoryId || null, params.managerId || null, month, status, key]
    );
    return { ...split, id: BigInt(r.rows[0].id), already_processed: false };
  }

  async markCollected(rideId: string): Promise<void> {
    await this.pool.query(
      `UPDATE ride_fee_splits SET fee_collected_cents = fee_amount_cents, fee_pending_cents = 0, collection_status = 'collected' WHERE ride_id = $1 AND collection_status IN ('pending', 'partial')`,
      [rideId]
    );
  }

  private mapSnapshot(row: any, alreadyProcessed: boolean): FeeSplitSnapshot {
    return {
      id: BigInt(row.id),
      alreadyProcessed,
      rideId: row.ride_id,
      feeAmountCents: BigInt(row.fee_amount_cents),
      matrixShareCents: BigInt(row.matrix_share_cents),
      managerShareCents: BigInt(row.manager_share_cents),
      referenceMonth: row.reference_month,
      territoryId: row.territory_id,
      managerId: row.manager_id,
      managerAssignmentId: row.manager_assignment_id,
      recognizedAt: new Date(row.recognized_at),
      platformFeeRateBps: row.platform_fee_rate_bps,
      managerCommissionRateBps: row.manager_commission_rate_bps,
      feeCollectedCents: BigInt(row.fee_collected_cents),
      feePendingCents: BigInt(row.fee_pending_cents),
      collectionStatus: row.collection_status,
    };
  }
}
