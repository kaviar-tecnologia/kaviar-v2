/**
 * Annual Incentive Ledger Service
 *
 * Internal, append-only ledger for annual incentive (Gratificação Anual) events.
 * Disabled by default via ANNUAL_INCENTIVE_WRITE_ENABLED feature flag.
 *
 * Two write forms:
 * - appendEvent(input): autonomous, manages its own transaction
 * - appendEventInClient(client, input): uses caller's transaction
 *
 * Idempotency guarantees:
 * - Same idempotencyKey + same data → returns existing, created: false
 * - Same idempotencyKey + different data → throws IDEMPOTENCY_CONFLICT
 * - Same source (source_type + source_event_id + event_type) + same data → returns existing
 * - Same source + different data → throws SOURCE_CONFLICT
 */

import { Pool, PoolClient } from 'pg';
import {
  AppendEventInput,
  AppendEventResult,
  AnnualIncentiveLedgerEvent,
  ListDriverEventsOptions,
  ANNUAL_INCENTIVE_EVENT_TYPES,
  ANNUAL_INCENTIVE_SOURCE_TYPES,
  ANNUAL_INCENTIVE_ERRORS,
} from './annual-incentive-ledger.types';

const MAX_LIST_LIMIT = 200;
const DEFAULT_LIST_LIMIT = 50;

type Queryable = Pick<PoolClient, 'query'>;

export class AnnualIncentiveLedgerService {
  constructor(private pool: Pool) {}

  // ═══════════════════════════════════════════════════════════════════
  // WRITE — Autonomous (manages own transaction)
  // ═══════════════════════════════════════════════════════════════════

  async appendEvent(input: AppendEventInput): Promise<AppendEventResult> {
    this.assertWriteEnabled();
    this.validateInput(input);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.appendEventCore(client, input);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // WRITE — Transactional (uses caller's client, no COMMIT/ROLLBACK)
  // ═══════════════════════════════════════════════════════════════════

  async appendEventInClient(
    client: PoolClient,
    input: AppendEventInput,
    /** @internal skip validation if already done by appendEvent */
    _validated = false,
  ): Promise<AppendEventResult> {
    if (!_validated) {
      this.assertWriteEnabled();
      this.validateInput(input);
    }

    return this.appendEventCore(client, input);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Core insertion logic (shared by both forms)
  // ═══════════════════════════════════════════════════════════════════

  private async appendEventCore(client: Queryable, input: AppendEventInput): Promise<AppendEventResult> {
    // 1. Check idempotency by key
    const existingByKey = await this.findByIdempotencyKeyInClient(client, input.idempotencyKey);
    if (existingByKey) {
      this.assertIdempotencyMatch(existingByKey, input);
      return { event: existingByKey, created: false };
    }

    // 2. Attempt insert with SAVEPOINT to handle constraint violations
    //    without aborting the entire transaction
    const savepointName = `sp_ail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await client.query(`SAVEPOINT ${savepointName}`);

    try {
      const event = await this.insertEvent(client, input);
      await client.query(`RELEASE SAVEPOINT ${savepointName}`);
      return { event, created: true };
    } catch (err: any) {
      // Roll back to savepoint (undoes the failed INSERT, keeps transaction alive)
      await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      await client.query(`RELEASE SAVEPOINT ${savepointName}`);

      // 3. Handle unique constraint violations
      if (err?.code === '23505') {
        return this.handleUniqueViolation(client, err, input);
      }
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // READ
  // ═══════════════════════════════════════════════════════════════════

  async findById(id: string): Promise<AnnualIncentiveLedgerEvent | null> {
    const r = await this.pool.query(
      'SELECT * FROM annual_incentive_ledger WHERE id = $1',
      [id]
    );
    return r.rows[0] ? this.mapRow(r.rows[0]) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<AnnualIncentiveLedgerEvent | null> {
    const r = await this.pool.query(
      'SELECT * FROM annual_incentive_ledger WHERE idempotency_key = $1',
      [idempotencyKey]
    );
    return r.rows[0] ? this.mapRow(r.rows[0]) : null;
  }

  async listDriverEvents(
    driverId: string,
    options: ListDriverEventsOptions = {},
  ): Promise<AnnualIncentiveLedgerEvent[]> {
    const limit = Math.min(options.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const conditions: string[] = ['driver_id = $1'];
    const params: any[] = [driverId];
    let paramIdx = 2;

    if (options.programYear != null) {
      conditions.push(`program_year = $${paramIdx++}`);
      params.push(options.programYear);
    }
    if (options.eventType) {
      conditions.push(`event_type = $${paramIdx++}`);
      params.push(options.eventType);
    }
    if (options.occurredFrom) {
      conditions.push(`occurred_at >= $${paramIdx++}`);
      params.push(options.occurredFrom.toISOString());
    }
    if (options.occurredTo) {
      conditions.push(`occurred_at <= $${paramIdx++}`);
      params.push(options.occurredTo.toISOString());
    }
    if (options.afterId) {
      conditions.push(`(occurred_at, id) < (SELECT occurred_at, id FROM annual_incentive_ledger WHERE id = $${paramIdx++})`);
      params.push(options.afterId);
    }

    params.push(limit);
    const limitParam = `$${paramIdx}`;

    const sql = `
      SELECT * FROM annual_incentive_ledger
      WHERE ${conditions.join(' AND ')}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${limitParam}
    `;

    const r = await this.pool.query(sql, params);
    return r.rows.map((row: any) => this.mapRow(row));
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Validation
  // ═══════════════════════════════════════════════════════════════════

  private assertWriteEnabled(): void {
    const flag = process.env.ANNUAL_INCENTIVE_WRITE_ENABLED;
    if (flag !== 'true') {
      throw new Error(ANNUAL_INCENTIVE_ERRORS.WRITE_DISABLED);
    }
  }

  private validateInput(input: AppendEventInput): void {
    // Event type
    if (!ANNUAL_INCENTIVE_EVENT_TYPES.includes(input.eventType)) {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_INPUT}: invalid eventType "${input.eventType}"`);
    }

    // Source type
    if (!ANNUAL_INCENTIVE_SOURCE_TYPES.includes(input.sourceType)) {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_INPUT}: invalid sourceType "${input.sourceType}"`);
    }

    // Amount: must be a safe integer (bigint), not zero
    this.assertSafeBigInt(input.amountCents, 'amountCents');
    if (input.amountCents === BigInt(0)) {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_AMOUNT}: amountCents cannot be zero`);
    }

    // Base amount: if provided, must be non-negative safe bigint
    if (input.baseAmountCents != null) {
      this.assertSafeBigInt(input.baseAmountCents, 'baseAmountCents');
      if (input.baseAmountCents < BigInt(0)) {
        throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_AMOUNT}: baseAmountCents cannot be negative`);
      }
    }

    // Rate basis points: if provided, must be non-negative integer
    if (input.rateBasisPoints != null) {
      if (!Number.isFinite(input.rateBasisPoints) || !Number.isInteger(input.rateBasisPoints)) {
        throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_AMOUNT}: rateBasisPoints must be a finite integer`);
      }
      if (input.rateBasisPoints < 0) {
        throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_AMOUNT}: rateBasisPoints cannot be negative`);
      }
    }

    // Strings
    if (!input.idempotencyKey || input.idempotencyKey.replace(/\s/g, '').length === 0) {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_INPUT}: idempotencyKey is required and cannot be whitespace`);
    }
    if (!input.policyVersion || input.policyVersion.replace(/\s/g, '').length === 0) {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_INPUT}: policyVersion is required`);
    }
    if (!input.driverId) {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_INPUT}: driverId is required`);
    }

    // Occurred at
    if (!(input.occurredAt instanceof Date) || isNaN(input.occurredAt.getTime())) {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_INPUT}: occurredAt must be a valid Date`);
    }

    // Metadata must be a plain object
    if (input.metadata == null || typeof input.metadata !== 'object' || Array.isArray(input.metadata)) {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_INPUT}: metadata must be a plain object`);
    }
  }

  private assertSafeBigInt(value: bigint, field: string): void {
    // BigInt type in TypeScript already rejects NaN, Infinity, and fractions.
    // But if the caller somehow passes a coerced value, we double-check:
    if (typeof value !== 'bigint') {
      throw new Error(`${ANNUAL_INCENTIVE_ERRORS.INVALID_AMOUNT}: ${field} must be a bigint`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Insert
  // ═══════════════════════════════════════════════════════════════════

  private async insertEvent(client: Queryable, input: AppendEventInput): Promise<AnnualIncentiveLedgerEvent> {
    const r = await client.query(
      `INSERT INTO annual_incentive_ledger
        (driver_id, program_year, event_type, amount_cents, base_amount_cents,
         rate_basis_points, policy_version, source_type, source_id, source_event_id,
         request_id, correlation_id, reversal_of_id, idempotency_key, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        input.driverId,
        input.programYear,
        input.eventType,
        input.amountCents.toString(),
        input.baseAmountCents?.toString() ?? null,
        input.rateBasisPoints,
        input.policyVersion,
        input.sourceType,
        input.sourceId,
        input.sourceEventId,
        input.requestId,
        input.correlationId,
        input.reversalOfId,
        input.idempotencyKey,
        JSON.stringify(input.metadata),
        input.occurredAt.toISOString(),
      ]
    );
    return this.mapRow(r.rows[0]);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Idempotency / Conflict resolution
  // ═══════════════════════════════════════════════════════════════════

  private async findByIdempotencyKeyInClient(
    client: Queryable,
    key: string,
  ): Promise<AnnualIncentiveLedgerEvent | null> {
    const r = await client.query(
      'SELECT * FROM annual_incentive_ledger WHERE idempotency_key = $1',
      [key]
    );
    return r.rows[0] ? this.mapRow(r.rows[0]) : null;
  }

  private async handleUniqueViolation(
    client: Queryable,
    err: any,
    input: AppendEventInput,
  ): Promise<AppendEventResult> {
    const constraintName: string = err.constraint || '';

    // Case A: idempotency_key conflict (race condition — another request inserted first)
    if (constraintName.includes('idempotency_key')) {
      const existing = await this.findByIdempotencyKeyInClient(client, input.idempotencyKey);
      if (existing) {
        this.assertIdempotencyMatch(existing, input);
        return { event: existing, created: false };
      }
      throw err; // Should not happen
    }

    // Case B: source event unique conflict
    if (constraintName.includes('source_event_unique')) {
      const existing = await this.findBySourceEvent(client, input.sourceType, input.sourceEventId!, input.eventType);
      if (existing) {
        this.assertSourceMatch(existing, input);
        return { event: existing, created: false };
      }
      throw err; // Should not happen
    }

    // Unknown constraint violation — do not swallow
    throw err;
  }

  private async findBySourceEvent(
    client: Queryable,
    sourceType: string,
    sourceEventId: string,
    eventType: string,
  ): Promise<AnnualIncentiveLedgerEvent | null> {
    const r = await client.query(
      `SELECT * FROM annual_incentive_ledger
       WHERE source_type = $1 AND source_event_id = $2 AND event_type = $3`,
      [sourceType, sourceEventId, eventType]
    );
    return r.rows[0] ? this.mapRow(r.rows[0]) : null;
  }

  private assertIdempotencyMatch(existing: AnnualIncentiveLedgerEvent, input: AppendEventInput): void {
    const mismatches: string[] = [];

    if (existing.driverId !== input.driverId) mismatches.push('driverId');
    if (existing.programYear !== input.programYear) mismatches.push('programYear');
    if (existing.eventType !== input.eventType) mismatches.push('eventType');
    if (existing.amountCents !== input.amountCents) mismatches.push('amountCents');
    if (existing.baseAmountCents !== input.baseAmountCents) mismatches.push('baseAmountCents');
    if (existing.rateBasisPoints !== input.rateBasisPoints) mismatches.push('rateBasisPoints');
    if (existing.policyVersion !== input.policyVersion) mismatches.push('policyVersion');
    if (existing.sourceType !== input.sourceType) mismatches.push('sourceType');
    if (existing.sourceId !== input.sourceId) mismatches.push('sourceId');
    if (existing.sourceEventId !== input.sourceEventId) mismatches.push('sourceEventId');
    if (existing.requestId !== input.requestId) mismatches.push('requestId');
    if (existing.correlationId !== input.correlationId) mismatches.push('correlationId');
    if (existing.reversalOfId !== input.reversalOfId) mismatches.push('reversalOfId');
    if (existing.occurredAt.getTime() !== input.occurredAt.getTime()) mismatches.push('occurredAt');
    if (!this.jsonEqual(existing.metadata, input.metadata)) mismatches.push('metadata');

    if (mismatches.length > 0) {
      throw new Error(
        `${ANNUAL_INCENTIVE_ERRORS.IDEMPOTENCY_CONFLICT}: fields differ: ${mismatches.join(', ')}`
      );
    }
  }

  private assertSourceMatch(existing: AnnualIncentiveLedgerEvent, input: AppendEventInput): void {
    const mismatches: string[] = [];

    if (existing.driverId !== input.driverId) mismatches.push('driverId');
    if (existing.amountCents !== input.amountCents) mismatches.push('amountCents');
    if (existing.baseAmountCents !== input.baseAmountCents) mismatches.push('baseAmountCents');
    if (existing.rateBasisPoints !== input.rateBasisPoints) mismatches.push('rateBasisPoints');
    if (existing.policyVersion !== input.policyVersion) mismatches.push('policyVersion');
    if (existing.programYear !== input.programYear) mismatches.push('programYear');
    if (existing.occurredAt.getTime() !== input.occurredAt.getTime()) mismatches.push('occurredAt');
    if (!this.jsonEqual(existing.metadata, input.metadata)) mismatches.push('metadata');

    if (mismatches.length > 0) {
      throw new Error(
        `${ANNUAL_INCENTIVE_ERRORS.SOURCE_CONFLICT}: fields differ: ${mismatches.join(', ')}`
      );
    }
  }

  private jsonEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Row mapping
  // ═══════════════════════════════════════════════════════════════════

  private mapRow(row: any): AnnualIncentiveLedgerEvent {
    return {
      id: row.id,
      driverId: row.driver_id,
      programYear: row.program_year,
      eventType: row.event_type,
      amountCents: BigInt(row.amount_cents),
      baseAmountCents: row.base_amount_cents != null ? BigInt(row.base_amount_cents) : null,
      rateBasisPoints: row.rate_basis_points,
      policyVersion: row.policy_version,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceEventId: row.source_event_id,
      requestId: row.request_id,
      correlationId: row.correlation_id,
      reversalOfId: row.reversal_of_id,
      idempotencyKey: row.idempotency_key,
      metadata: row.metadata ?? {},
      occurredAt: new Date(row.occurred_at),
      createdAt: new Date(row.created_at),
    };
  }
}
