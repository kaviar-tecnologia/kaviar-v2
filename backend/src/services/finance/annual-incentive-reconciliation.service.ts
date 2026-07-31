/**
 * Annual Incentive Reconciliation Service — Etapa 2C.4A
 * Read-only reconciler for shadow mode.
 *
 * Rebuilds expected state from wallet_ledger, compares with
 * annual_incentive_ledger, and reports all divergences.
 */

import { Pool, PoolClient } from 'pg';
import { assertSafeFinanceDatabase } from '../../lib/assert-safe-finance-db';
import { getProgramYearBrazil } from './annual-incentive-program-year';
import {
  ReconciliationItem,
  ReversalItem,
  ReconciliationTotals,
  ReconciliationGroups,
  ReconciliationGroup,
  ReconciliationFilters,
  ReconciliationConfiguration,
  ReconciliationReport,
  ReconciliationStatus,
  ShadowState,
  RATE_BASIS_POINTS,
  BASIS_POINTS_DENOMINATOR,
  POLICY_VERSION,
  REPORT_VERSION,
} from './annual-incentive-reconciliation.types';

export {
  ReconciliationItem,
  ReversalItem,
  ReconciliationTotals,
  ReconciliationGroups,
  ReconciliationGroup,
  ReconciliationFilters,
  ReconciliationConfiguration,
  ReconciliationReport,
  ReconciliationStatus,
  ShadowState,
};

// ─── Flag Evaluation ────────────────────────────────────────────────────────

export function evaluateShadowState(shadowFlag: string | undefined, writeFlag: string | undefined): ShadowState {
  const shadow = shadowFlag === 'true';
  const write = writeFlag === 'true';
  if (!shadow && !write) return 'SHADOW_DISABLED_EXPECTED_LEDGER_EMPTY';
  if (!shadow && write) return 'SHADOW_DISABLED_WRITE_AVAILABLE';
  if (shadow && write) return 'SHADOW_ACTIVE';
  return 'INVALID_SHADOW_CONFIGURATION';
}

// ─── Raw DB Row Types ───────────────────────────────────────────────────────

interface WalletEventRow {
  id: string;
  driver_id: string;
  entry_type: string;
  balance_delta_cents: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: Date;
}

interface PendingDebitRow {
  id: string;
  ride_id: string;
}

interface AccrualRow {
  id: string;
  driver_id: string;
  program_year: number;
  event_type: string;
  amount_cents: string;
  base_amount_cents: string | null;
  rate_basis_points: number | null;
  policy_version: string;
  source_type: string;
  source_id: string | null;
  source_event_id: string | null;
  correlation_id: string | null;
  reversal_of_id: string | null;
  idempotency_key: string;
  occurred_at: Date;
  created_at: Date;
}

interface FeatureFlagRow {
  key: string;
  enabled: boolean;
}

// ─── Service Class ──────────────────────────────────────────────────────────

export class AnnualIncentiveReconciliationService {
  constructor(private pool: Pool) {}

  async run(filters: ReconciliationFilters = {}): Promise<ReconciliationReport> {
    // 1. Validate database safety BEFORE any connection
    assertSafeFinanceDatabase();

    // 2. Read flags
    const client = await this.pool.connect();
    let configuration: ReconciliationConfiguration;
    let items: ReconciliationItem[];
    let reversals: ReversalItem[];
    let orphans: ReconciliationItem[];

    try {
      // BEGIN READ ONLY — no mutations possible
      await client.query('BEGIN READ ONLY');

      // 3. Read feature flags
      configuration = await this.readConfiguration(client);

      // 4. Load wallet events (source of economic truth)
      const walletEvents = await this.loadWalletEvents(client, filters);

      // 5. Resolve pending_debit references
      const pendingMap = await this.loadPendingDebits(client, walletEvents);

      // 6. Load actual accruals from annual_incentive_ledger
      const walletEventIds = walletEvents.map(e => e.id);
      const accrualsBySourceEventId = await this.loadActualAccruals(client, filters, walletEventIds);

      // 7. Replay and reconcile
      const result = this.replayAndReconcile(
        walletEvents, pendingMap, accrualsBySourceEventId, filters, configuration
      );
      items = result.items;
      reversals = result.reversals;
      orphans = result.orphans;

      // 8. Detect orphan accruals (accruals without matching wallet event)
      const additionalOrphans = this.detectOrphanAccruals(
        accrualsBySourceEventId, walletEvents
      );
      orphans = [...orphans, ...additionalOrphans];

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 9. Compute totals and groups
    const totals = this.computeTotals(items, reversals, orphans, configuration);
    const groups = this.computeGroups(items, reversals);

    return {
      reportVersion: REPORT_VERSION,
      generatedAt: new Date(),
      configuration,
      filters,
      totals,
      groups,
      items,
      reversals,
      orphans,
    };
  }

  // ─── Read Configuration ─────────────────────────────────────────────────

  private async readConfiguration(client: PoolClient): Promise<ReconciliationConfiguration> {
    const r = await client.query<FeatureFlagRow>(
      `SELECT key, enabled FROM feature_flags WHERE key IN ($1, $2)`,
      ['ANNUAL_INCENTIVE_SHADOW_ENABLED', 'ANNUAL_INCENTIVE_WRITE_ENABLED']
    );

    let shadowRaw: string | undefined;
    let writeRaw: string | undefined;

    for (const row of r.rows) {
      if (row.key === 'ANNUAL_INCENTIVE_SHADOW_ENABLED') {
        shadowRaw = row.enabled ? 'true' : 'false';
      }
      if (row.key === 'ANNUAL_INCENTIVE_WRITE_ENABLED') {
        writeRaw = row.enabled ? 'true' : 'false';
      }
    }

    const shadowState = evaluateShadowState(shadowRaw, writeRaw);

    return {
      shadowState,
      shadowEnabled: shadowRaw === 'true',
      writeEnabled: writeRaw === 'true',
      databaseSafe: true,
    };
  }

  // ─── Load Wallet Events ─────────────────────────────────────────────────

  private async loadWalletEvents(
    client: PoolClient,
    filters: ReconciliationFilters
  ): Promise<WalletEventRow[]> {
    const conditions: string[] = [
      `(
        (entry_type = 'fee_debit' AND reference_type = 'ride')
        OR
        (entry_type = 'pending_resolve' AND reference_type = 'pending_debit')
      )`
    ];
    const params: (string | Date)[] = [];
    let paramIdx = 0;

    if (filters.driverId) {
      paramIdx++;
      conditions.push(`driver_id = $${paramIdx}`);
      params.push(filters.driverId);
    }

    // Note: We do NOT filter by date here for 'from'/'to'/'programYear'
    // because we need the full history to compute cumulative base correctly.
    // Filtering happens AFTER replay.

    // But if rideId is specified, we can limit which rides we load.
    // We still need to load ALL events for those rides (no date filtering).
    if (filters.rideId) {
      // For rideId filter, we need events where reference_id = rideId (fee_debit)
      // OR where the pending_debit links to this rideId (loaded later via pendingMap)
      // So we load all and filter after resolving pending references
    }

    const query = `
      SELECT id::text, driver_id, entry_type, balance_delta_cents::text,
             reference_type, reference_id, created_at
      FROM wallet_ledger
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at ASC, id ASC
    `;

    const r = await client.query<WalletEventRow>(query, params);
    return r.rows;
  }

  // ─── Load Pending Debits ────────────────────────────────────────────────

  private async loadPendingDebits(
    client: PoolClient,
    walletEvents: WalletEventRow[]
  ): Promise<Map<string, PendingDebitRow>> {
    // Collect all pending_debit IDs from pending_resolve events
    const pendingDebitIds: string[] = [];
    for (const ev of walletEvents) {
      if (ev.entry_type === 'pending_resolve' && ev.reference_id) {
        pendingDebitIds.push(ev.reference_id);
      }
    }

    if (pendingDebitIds.length === 0) {
      return new Map();
    }

    const uniqueIds = [...new Set(pendingDebitIds)];
    const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(',');
    const r = await client.query<PendingDebitRow>(
      `SELECT id::text, ride_id FROM pending_debits WHERE id::text IN (${placeholders})`,
      uniqueIds
    );

    const map = new Map<string, PendingDebitRow>();
    for (const row of r.rows) {
      map.set(row.id, row);
    }
    return map;
  }

  // ─── Load Actual Accruals ───────────────────────────────────────────────

  private async loadActualAccruals(
    client: PoolClient,
    filters: ReconciliationFilters,
    walletEventIds?: string[]
  ): Promise<Map<string, AccrualRow[]>> {
    // Load accruals matching either:
    // 1. source_event_id in wallet events (for matching + DRIVER_MISMATCH detection)
    // 2. driver_id matches filter (for orphan detection)
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (walletEventIds && walletEventIds.length > 0 && filters.driverId) {
      const placeholders = walletEventIds.map((_, i) => `$${i + 1}`).join(',');
      const driverParam = walletEventIds.length + 1;
      conditions.push(`(source_event_id IN (${placeholders}) OR driver_id = $${driverParam})`);
      params.push(...walletEventIds, filters.driverId);
    } else if (walletEventIds && walletEventIds.length > 0) {
      const placeholders = walletEventIds.map((_, i) => `$${i + 1}`).join(',');
      conditions.push(`source_event_id IN (${placeholders})`);
      params.push(...walletEventIds);
    } else if (filters.driverId) {
      conditions.push(`driver_id = $1`);
      params.push(filters.driverId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await client.query<AccrualRow>(
      `SELECT id, driver_id, program_year, event_type, amount_cents::text,
              base_amount_cents::text, rate_basis_points, policy_version,
              source_type, source_id, source_event_id, correlation_id,
              reversal_of_id, idempotency_key, occurred_at, created_at
       FROM annual_incentive_ledger
       ${whereClause}
       ORDER BY created_at ASC`,
      params
    );

    // Group by source_event_id for efficient lookup
    const map = new Map<string, AccrualRow[]>();
    for (const row of r.rows) {
      const key = row.source_event_id ?? `__no_source_event__${row.id}`;
      const existing = map.get(key) ?? [];
      existing.push(row);
      map.set(key, existing);
    }
    return map;
  }

  // ─── Replay and Reconcile ───────────────────────────────────────────────

  private replayAndReconcile(
    walletEvents: WalletEventRow[],
    pendingMap: Map<string, PendingDebitRow>,
    accrualsBySourceEventId: Map<string, AccrualRow[]>,
    filters: ReconciliationFilters,
    configuration: ReconciliationConfiguration,
  ): { items: ReconciliationItem[]; reversals: ReversalItem[]; orphans: ReconciliationItem[] } {
    const items: ReconciliationItem[] = [];
    const reversals: ReversalItem[] = [];
    const orphans: ReconciliationItem[] = [];

    // Group wallet events by rideId for cumulative replay
    const eventsByRide = new Map<string, WalletEventRow[]>();
    const unresolvedEvents: WalletEventRow[] = [];

    for (const ev of walletEvents) {
      let rideId: string | null = null;

      if (ev.entry_type === 'fee_debit' && ev.reference_type === 'ride') {
        rideId = ev.reference_id;
      } else if (ev.entry_type === 'pending_resolve' && ev.reference_type === 'pending_debit') {
        const pd = ev.reference_id ? pendingMap.get(ev.reference_id) : undefined;
        if (pd) {
          rideId = pd.ride_id;
        } else {
          // Unresolved pending reference — skip if rideId filter is active
          if (filters.rideId) continue;

          const item: ReconciliationItem = {
            driverId: ev.driver_id,
            rideId: '',
            walletLedgerEntryId: ev.id,
            walletEntryType: ev.entry_type,
            walletCreatedAt: ev.created_at,
            programYear: getProgramYearBrazil(ev.created_at),
            consumedFeeAmountCents: this.absAmount(ev.balance_delta_cents),
            cumulativeBaseCents: 0n,
            expectedIncrementCents: 0n,
            expectedIdempotencyKey: `annual_incentive:accrual:wallet_ledger:${ev.id}`,
            actualAnnualIncentiveEventId: null,
            actualAmountCents: null,
            actualBaseAmountCents: null,
            actualRateBasisPoints: null,
            actualPolicyVersion: null,
            actualProgramYear: null,
            actualOccurredAt: null,
            statuses: ['UNRESOLVED_PENDING_REFERENCE'],
          };
          items.push(item);
          continue;
        }
      }

      if (!rideId) continue;

      // Filter by rideId if specified
      if (filters.rideId && rideId !== filters.rideId) continue;

      const group = eventsByRide.get(rideId) ?? [];
      group.push(ev);
      eventsByRide.set(rideId, group);
    }

    // Replay each ride's events in order
    for (const [rideId, events] of eventsByRide) {
      let cumulativeBase = 0n;
      let previousTargetEntitlement = 0n;

      // Sort by created_at ASC, id ASC
      events.sort((a, b) => {
        const timeDiff = a.created_at.getTime() - b.created_at.getTime();
        if (timeDiff !== 0) return timeDiff;
        return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
      });

      for (const ev of events) {
        const consumedAmount = this.absAmount(ev.balance_delta_cents);
        cumulativeBase += consumedAmount;

        const targetEntitlement = (cumulativeBase * RATE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;
        const expectedIncrement = targetEntitlement - previousTargetEntitlement;
        previousTargetEntitlement = targetEntitlement;

        const programYear = getProgramYearBrazil(ev.created_at);
        const walletLedgerId = ev.id;
        const expectedIdempotencyKey = `annual_incentive:accrual:wallet_ledger:${walletLedgerId}`;

        // Determine source type and source id for expected event
        let expectedSourceType: string;
        let expectedSourceId: string;
        if (ev.entry_type === 'fee_debit') {
          expectedSourceType = 'FEE_DEBIT';
          expectedSourceId = rideId;
        } else {
          expectedSourceType = 'PENDING_RESOLVE';
          expectedSourceId = rideId;
        }

        // Apply post-replay filter: only include in results if passes filters
        const includeInResults = this.passesPostReplayFilter(ev, programYear, filters);

        if (!includeInResults) continue;

        // Build the reconciliation item
        const item: ReconciliationItem = {
          driverId: ev.driver_id,
          rideId,
          walletLedgerEntryId: walletLedgerId,
          walletEntryType: ev.entry_type,
          walletCreatedAt: ev.created_at,
          programYear,
          consumedFeeAmountCents: consumedAmount,
          cumulativeBaseCents: cumulativeBase,
          expectedIncrementCents: expectedIncrement,
          expectedIdempotencyKey,
          actualAnnualIncentiveEventId: null,
          actualAmountCents: null,
          actualBaseAmountCents: null,
          actualRateBasisPoints: null,
          actualPolicyVersion: null,
          actualProgramYear: null,
          actualOccurredAt: null,
          statuses: [],
        };

        if (expectedIncrement === 0n) {
          item.statuses.push('EXPECTED_ZERO_INCREMENT');
          // Check if an accrual exists for this zero-increment event
          const candidates = accrualsBySourceEventId.get(walletLedgerId) ?? [];
          const accruals = candidates.filter(c => c.event_type === 'ACCRUAL');
          if (accruals.length > 0) {
            item.statuses.push('ACCRUAL_EXISTS_FOR_ZERO_INCREMENT');
            item.statuses.push('UNEXPECTED_ACCRUAL');
            const actual = accruals[0];
            item.actualAnnualIncentiveEventId = actual.id;
            item.actualAmountCents = BigInt(actual.amount_cents);
            item.actualBaseAmountCents = actual.base_amount_cents ? BigInt(actual.base_amount_cents) : null;
            item.actualRateBasisPoints = actual.rate_basis_points;
            item.actualPolicyVersion = actual.policy_version;
            item.actualProgramYear = actual.program_year;
            item.actualOccurredAt = actual.occurred_at;
          }
          items.push(item);
          continue;
        }

        // Expected increment > 0: find matching accrual
        this.matchAccrual(
          item, walletLedgerId, expectedSourceType, expectedSourceId,
          expectedIncrement, expectedIdempotencyKey, programYear, ev,
          accrualsBySourceEventId, configuration, rideId
        );

        items.push(item);
      }
    }

    // Process reversals from the accrual map
    for (const [sourceEventId, rows] of accrualsBySourceEventId) {
      for (const row of rows) {
        if (row.event_type !== 'REVERSAL') continue;

        // Apply driver filter
        if (filters.driverId && row.driver_id !== filters.driverId) continue;

        const reversalItem: ReversalItem = {
          eventId: row.id,
          driverId: row.driver_id,
          programYear: row.program_year,
          amountCents: BigInt(row.amount_cents),
          reversalOfId: row.reversal_of_id,
          sourceId: row.source_id,
          statuses: ['REVERSAL_PRESENT_REVIEW_REQUIRED'],
          issues: [],
        };

        // Validate reversal
        this.validateReversal(reversalItem, row, accrualsBySourceEventId);

        reversals.push(reversalItem);
      }
    }

    return { items, reversals, orphans };
  }

  // ─── Match Accrual (Two-step) ───────────────────────────────────────────

  private matchAccrual(
    item: ReconciliationItem,
    walletLedgerId: string,
    expectedSourceType: string,
    expectedSourceId: string,
    expectedIncrement: bigint,
    expectedIdempotencyKey: string,
    programYear: number,
    ev: WalletEventRow,
    accrualsBySourceEventId: Map<string, AccrualRow[]>,
    configuration: ReconciliationConfiguration,
    rideId: string,
  ): void {
    // Step A: Find candidate by source_event_id + event_type = ACCRUAL
    const candidates = accrualsBySourceEventId.get(walletLedgerId) ?? [];
    const accruals = candidates.filter(c => c.event_type === 'ACCRUAL');

    // Check for duplicates
    if (accruals.length > 1) {
      item.statuses.push('DUPLICATE_SOURCE');
    }

    if (accruals.length === 0) {
      // No accrual found
      if (configuration.shadowState === 'SHADOW_ACTIVE') {
        item.statuses.push('MISSING_ACCRUAL');
      } else {
        item.statuses.push('MISSING_ACCRUAL');
      }
      return;
    }

    const actual = accruals[0];
    item.actualAnnualIncentiveEventId = actual.id;
    item.actualAmountCents = BigInt(actual.amount_cents);
    item.actualBaseAmountCents = actual.base_amount_cents ? BigInt(actual.base_amount_cents) : null;
    item.actualRateBasisPoints = actual.rate_basis_points;
    item.actualPolicyVersion = actual.policy_version;
    item.actualProgramYear = actual.program_year;
    item.actualOccurredAt = actual.occurred_at;

    // Step B: Compare fields
    let isMatch = true;

    if (actual.source_type !== expectedSourceType) {
      item.statuses.push('SOURCE_TYPE_MISMATCH');
      isMatch = false;
    }

    if (actual.source_id !== expectedSourceId) {
      item.statuses.push('SOURCE_ID_MISMATCH');
      isMatch = false;
    }

    if (actual.driver_id !== ev.driver_id) {
      item.statuses.push('DRIVER_MISMATCH');
      isMatch = false;
    }

    if (BigInt(actual.amount_cents) !== expectedIncrement) {
      item.statuses.push('AMOUNT_MISMATCH');
      isMatch = false;
    }

    const expectedBase = this.absAmount(ev.balance_delta_cents);
    if (actual.base_amount_cents !== null && BigInt(actual.base_amount_cents) !== expectedBase) {
      item.statuses.push('BASE_AMOUNT_MISMATCH');
      isMatch = false;
    }

    if (actual.rate_basis_points !== Number(RATE_BASIS_POINTS)) {
      item.statuses.push('RATE_MISMATCH');
      isMatch = false;
    }

    if (actual.policy_version !== POLICY_VERSION) {
      item.statuses.push('POLICY_VERSION_MISMATCH');
      isMatch = false;
    }

    if (actual.program_year !== programYear) {
      item.statuses.push('PROGRAM_YEAR_MISMATCH');
      isMatch = false;
    }

    if (actual.occurred_at.getTime() !== ev.created_at.getTime()) {
      item.statuses.push('OCCURRED_AT_MISMATCH');
      isMatch = false;
    }

    if (actual.idempotency_key !== expectedIdempotencyKey) {
      item.statuses.push('IDEMPOTENCY_KEY_MISMATCH');
      isMatch = false;
    }

    const expectedCorrelation = `ride:${rideId}`;
    if (actual.correlation_id !== expectedCorrelation) {
      item.statuses.push('CORRELATION_ID_MISMATCH');
      isMatch = false;
    }

    if (isMatch) {
      item.statuses.push('MATCH');
    }
  }

  // ─── Validate Reversal ──────────────────────────────────────────────────

  private validateReversal(
    reversalItem: ReversalItem,
    row: AccrualRow,
    accrualsBySourceEventId: Map<string, AccrualRow[]>,
  ): void {
    // 1. reversal_of_id absent
    if (!row.reversal_of_id) {
      reversalItem.issues.push('REVERSAL_OF_ID_ABSENT');
      return;
    }

    // Find the original event
    let original: AccrualRow | undefined;
    for (const [, rows] of accrualsBySourceEventId) {
      for (const r of rows) {
        if (r.id === row.reversal_of_id) {
          original = r;
          break;
        }
      }
      if (original) break;
    }

    // 2. Original inexistent
    if (!original) {
      reversalItem.issues.push('ORIGINAL_NOT_FOUND');
      return;
    }

    // 3. Original is not ACCRUAL
    if (original.event_type !== 'ACCRUAL') {
      reversalItem.issues.push('ORIGINAL_NOT_ACCRUAL');
    }

    // 4. Driver different
    if (row.driver_id !== original.driver_id) {
      reversalItem.issues.push('DRIVER_MISMATCH');
    }

    // 5. Ride different (source_id)
    if (row.source_id !== original.source_id) {
      reversalItem.issues.push('SOURCE_ID_MISMATCH');
    }

    // 6. Individual reversal above original
    const reversalAbs = this.absBigint(BigInt(row.amount_cents));
    const originalAbs = this.absBigint(BigInt(original.amount_cents));
    if (reversalAbs > originalAbs) {
      reversalItem.issues.push('REVERSAL_EXCEEDS_ORIGINAL');
    }

    // 7. Sum of reversals above original
    // Find all reversals for this original
    let totalReversals = 0n;
    for (const [, rows] of accrualsBySourceEventId) {
      for (const r of rows) {
        if (r.event_type === 'REVERSAL' && r.reversal_of_id === original.id) {
          totalReversals += this.absBigint(BigInt(r.amount_cents));
        }
      }
    }
    if (totalReversals > originalAbs) {
      reversalItem.issues.push('TOTAL_REVERSALS_EXCEED_ORIGINAL');
    }
  }

  // ─── Detect Orphan Accruals ─────────────────────────────────────────────

  private detectOrphanAccruals(
    accrualsBySourceEventId: Map<string, AccrualRow[]>,
    walletEvents: WalletEventRow[],
  ): ReconciliationItem[] {
    const walletEventIds = new Set(walletEvents.map(e => e.id));
    const orphans: ReconciliationItem[] = [];

    for (const [sourceEventId, rows] of accrualsBySourceEventId) {
      if (sourceEventId.startsWith('__no_source_event__')) {
        // Events without source_event_id that are ACCRUAL type are orphans
        for (const row of rows) {
          if (row.event_type === 'ACCRUAL') {
            orphans.push(this.buildOrphanItem(row));
          }
        }
        continue;
      }

      // If the source_event_id doesn't correspond to any loaded wallet event
      if (!walletEventIds.has(sourceEventId)) {
        for (const row of rows) {
          if (row.event_type === 'ACCRUAL') {
            orphans.push(this.buildOrphanItem(row));
          }
        }
      }
    }

    return orphans;
  }

  private buildOrphanItem(row: AccrualRow): ReconciliationItem {
    return {
      driverId: row.driver_id,
      rideId: row.source_id ?? '',
      walletLedgerEntryId: row.source_event_id ?? '',
      walletEntryType: '',
      walletCreatedAt: row.occurred_at,
      programYear: row.program_year,
      consumedFeeAmountCents: 0n,
      cumulativeBaseCents: 0n,
      expectedIncrementCents: 0n,
      expectedIdempotencyKey: '',
      actualAnnualIncentiveEventId: row.id,
      actualAmountCents: BigInt(row.amount_cents),
      actualBaseAmountCents: row.base_amount_cents ? BigInt(row.base_amount_cents) : null,
      actualRateBasisPoints: row.rate_basis_points,
      actualPolicyVersion: row.policy_version,
      actualProgramYear: row.program_year,
      actualOccurredAt: row.occurred_at,
      statuses: ['ORPHAN_ACCRUAL'],
    };
  }

  // ─── Post-Replay Filter ─────────────────────────────────────────────────

  private passesPostReplayFilter(
    ev: WalletEventRow,
    programYear: number,
    filters: ReconciliationFilters,
  ): boolean {
    // programYear filter: only include items from this year
    if (filters.programYear !== undefined && programYear !== filters.programYear) {
      return false;
    }

    // from filter: exclude events before this date (but they participated in base calc)
    if (filters.from && ev.created_at < filters.from) {
      return false;
    }

    // to filter: exclude events after this date (inclusive)
    if (filters.to && ev.created_at > filters.to) {
      return false;
    }

    return true;
  }

  // ─── Compute Totals ─────────────────────────────────────────────────────

  private computeTotals(
    items: ReconciliationItem[],
    reversals: ReversalItem[],
    orphans: ReconciliationItem[],
    configuration: ReconciliationConfiguration,
  ): ReconciliationTotals {
    let totalConsumedFeeCents = 0n;
    let expectedGrossAccrualCents = 0n;
    let actualGrossAccrualCents = 0n;
    let actualReversalCents = 0n;
    let wouldAccrueCents = 0n;
    let walletEventCount = 0;
    let expectedAccrualEventCount = 0;
    let actualAccrualEventCount = 0;
    let matchedCount = 0;
    let mismatchCount = 0;
    let missingCount = 0;
    let orphanCount = orphans.length;
    let duplicateCount = 0;
    let zeroIncrementCount = 0;
    let unresolvedPendingReferenceCount = 0;
    let reversalReviewCount = reversals.length;
    let unexpectedCount = 0;

    const countedActualIds = new Set<string>();

    for (const item of items) {
      walletEventCount++;
      totalConsumedFeeCents += item.consumedFeeAmountCents;

      if (item.expectedIncrementCents > 0n) {
        expectedGrossAccrualCents += item.expectedIncrementCents;
        expectedAccrualEventCount++;
        wouldAccrueCents += item.expectedIncrementCents;
      }

      // Count actual only once per event
      if (item.actualAnnualIncentiveEventId && !countedActualIds.has(item.actualAnnualIncentiveEventId)) {
        if (!item.statuses.includes('EXPECTED_ZERO_INCREMENT') || item.statuses.includes('ACCRUAL_EXISTS_FOR_ZERO_INCREMENT')) {
          actualGrossAccrualCents += this.absBigint(item.actualAmountCents ?? 0n);
          actualAccrualEventCount++;
          countedActualIds.add(item.actualAnnualIncentiveEventId);
        }
      }

      // Status counts
      if (item.statuses.includes('MATCH')) matchedCount++;
      if (item.statuses.includes('MISSING_ACCRUAL')) missingCount++;
      if (item.statuses.includes('DUPLICATE_SOURCE')) duplicateCount++;
      if (item.statuses.includes('EXPECTED_ZERO_INCREMENT')) zeroIncrementCount++;
      if (item.statuses.includes('UNRESOLVED_PENDING_REFERENCE')) unresolvedPendingReferenceCount++;
      if (item.statuses.includes('UNEXPECTED_ACCRUAL')) unexpectedCount++;

      // Mismatch: has any mismatch status
      const mismatchStatuses: ReconciliationStatus[] = [
        'AMOUNT_MISMATCH', 'BASE_AMOUNT_MISMATCH', 'RATE_MISMATCH',
        'POLICY_VERSION_MISMATCH', 'PROGRAM_YEAR_MISMATCH', 'OCCURRED_AT_MISMATCH',
        'DRIVER_MISMATCH', 'SOURCE_ID_MISMATCH', 'SOURCE_TYPE_MISMATCH',
        'IDEMPOTENCY_KEY_MISMATCH', 'CORRELATION_ID_MISMATCH',
      ];
      if (item.statuses.some(s => mismatchStatuses.includes(s))) mismatchCount++;
    }

    // Reversals
    for (const rev of reversals) {
      actualReversalCents += this.absBigint(rev.amountCents);
    }

    const actualNetAccrualCents = actualGrossAccrualCents - actualReversalCents;
    const differenceCents = actualNetAccrualCents - expectedGrossAccrualCents;

    return {
      totalConsumedFeeCents,
      expectedGrossAccrualCents,
      actualGrossAccrualCents,
      actualReversalCents,
      actualNetAccrualCents,
      differenceCents,
      wouldAccrueCents,
      walletEventCount,
      expectedAccrualEventCount,
      actualAccrualEventCount,
      matchedCount,
      mismatchCount,
      missingCount,
      orphanCount,
      duplicateCount,
      zeroIncrementCount,
      unresolvedPendingReferenceCount,
      reversalReviewCount,
      unexpectedCount,
    };
  }

  // ─── Compute Groups ─────────────────────────────────────────────────────

  private computeGroups(
    items: ReconciliationItem[],
    reversals: ReversalItem[],
  ): ReconciliationGroups {
    const byDriver: Record<string, ReconciliationGroup> = {};
    const byProgramYear: Record<number, ReconciliationGroup> = {};
    const byRide: Record<string, ReconciliationGroup> = {};
    const bySourceType: Record<string, ReconciliationGroup> = {};
    const byStatus: Record<string, number> = {};

    const emptyGroup = (): ReconciliationGroup => ({
      totalConsumedFeeCents: 0n,
      expectedGrossAccrualCents: 0n,
      actualGrossAccrualCents: 0n,
      actualReversalCents: 0n,
      actualNetAccrualCents: 0n,
      differenceCents: 0n,
      itemCount: 0,
    });

    for (const item of items) {
      // By driver
      if (!byDriver[item.driverId]) byDriver[item.driverId] = emptyGroup();
      this.addToGroup(byDriver[item.driverId], item);

      // By program year
      if (!byProgramYear[item.programYear]) byProgramYear[item.programYear] = emptyGroup();
      this.addToGroup(byProgramYear[item.programYear], item);

      // By ride
      if (item.rideId) {
        if (!byRide[item.rideId]) byRide[item.rideId] = emptyGroup();
        this.addToGroup(byRide[item.rideId], item);
      }

      // By source type
      const st = item.walletEntryType === 'fee_debit' ? 'FEE_DEBIT' : 'PENDING_RESOLVE';
      if (!bySourceType[st]) bySourceType[st] = emptyGroup();
      this.addToGroup(bySourceType[st], item);

      // By status
      for (const s of item.statuses) {
        byStatus[s] = (byStatus[s] ?? 0) + 1;
      }
    }

    // Add reversal amounts to relevant groups
    for (const rev of reversals) {
      const revAbs = this.absBigint(rev.amountCents);
      if (byDriver[rev.driverId]) {
        byDriver[rev.driverId].actualReversalCents += revAbs;
        byDriver[rev.driverId].actualNetAccrualCents -= revAbs;
        byDriver[rev.driverId].differenceCents -= revAbs;
      }
      if (byProgramYear[rev.programYear]) {
        byProgramYear[rev.programYear].actualReversalCents += revAbs;
        byProgramYear[rev.programYear].actualNetAccrualCents -= revAbs;
        byProgramYear[rev.programYear].differenceCents -= revAbs;
      }
      byStatus['REVERSAL_PRESENT_REVIEW_REQUIRED'] = (byStatus['REVERSAL_PRESENT_REVIEW_REQUIRED'] ?? 0) + 1;
    }

    // Finalize differenceCents for all groups
    for (const g of Object.values(byDriver)) g.differenceCents = g.actualNetAccrualCents - g.expectedGrossAccrualCents;
    for (const g of Object.values(byProgramYear)) g.differenceCents = g.actualNetAccrualCents - g.expectedGrossAccrualCents;
    for (const g of Object.values(byRide)) g.differenceCents = g.actualNetAccrualCents - g.expectedGrossAccrualCents;
    for (const g of Object.values(bySourceType)) g.differenceCents = g.actualNetAccrualCents - g.expectedGrossAccrualCents;

    return { byDriver, byProgramYear, byRide, bySourceType, byStatus };
  }

  private addToGroup(group: ReconciliationGroup, item: ReconciliationItem): void {
    group.itemCount++;
    group.totalConsumedFeeCents += item.consumedFeeAmountCents;
    if (item.expectedIncrementCents > 0n) {
      group.expectedGrossAccrualCents += item.expectedIncrementCents;
    }
    if (item.actualAmountCents !== null && !item.statuses.includes('EXPECTED_ZERO_INCREMENT')) {
      group.actualGrossAccrualCents += this.absBigint(item.actualAmountCents);
      group.actualNetAccrualCents += this.absBigint(item.actualAmountCents);
    }
  }

  // ─── Utility Methods ────────────────────────────────────────────────────

  private absAmount(balanceDeltaCents: string): bigint {
    const val = BigInt(balanceDeltaCents);
    return val < 0n ? -val : val;
  }

  private absBigint(val: bigint): bigint {
    return val < 0n ? -val : val;
  }
}
