/**
 * Annual Incentive Shadow Readiness Service — Etapa 2C.4C
 *
 * Read-only operational health and readiness assessment.
 * Determines if the system is ready to enable shadow mode,
 * and once enabled, whether it remains healthy.
 *
 * INVARIANTS:
 * - Uses BEGIN READ ONLY — no mutations possible
 * - Never alters flags
 * - Never inserts, updates, or deletes records
 * - Never calls process.exit
 * - Reuses the existing reconciler in read-only context
 */

import { Pool, PoolClient } from 'pg';
import { assertSafeFinanceDatabase } from '../../lib/assert-safe-finance-db';
import { AnnualIncentiveReconciliationService } from './annual-incentive-reconciliation.service';
import {
  ReadinessState,
  ReadinessCheck,
  CheckSeverity,
  CheckStatus,
  ConfigurationState,
  FlagConfiguration,
  DatabaseSafety,
  StructuralCheckResult,
  FinancialMetrics,
  PendingOperationsMetrics,
  LegacyCoexistence,
  NonAtomicBoundary,
  ReadinessFilters,
  ReadinessWindow,
  ReadinessReport,
  READINESS_REPORT_VERSION,
  EXPECTED_POLICY_VERSION,
  EXPECTED_TIMEZONE,
  KNOWN_NON_ATOMIC_BOUNDARIES,
  ESSENTIAL_COLUMNS,
  CRITICAL_DIVERGENCE_TYPES_ALWAYS,
} from './annual-incentive-shadow-readiness.types';

export {
  ReadinessState,
  ReadinessCheck,
  FlagConfiguration,
  StructuralCheckResult,
  FinancialMetrics,
  PendingOperationsMetrics,
  LegacyCoexistence,
  NonAtomicBoundary,
  ReadinessFilters,
  ReadinessReport,
};

// ─── Service Class ──────────────────────────────────────────────────────────

export class AnnualIncentiveShadowReadinessService {
  constructor(private pool: Pool) {}

  async run(filters: ReadinessFilters): Promise<ReadinessReport> {
    // 1. Validate database safety BEFORE any connection
    assertSafeFinanceDatabase();

    const now = new Date();
    const windowTo = filters.to ?? now;
    const windowFrom = filters.from ?? new Date(now.getTime() - filters.windowHours * 60 * 60 * 1000);

    // 2. Database safety info
    const databaseSafety = this.getDatabaseSafety();

    // 3. Open client and BEGIN READ ONLY
    const client = await this.pool.connect();
    let configuration: FlagConfiguration;
    let structural: StructuralCheckResult;
    let financialMetrics: FinancialMetrics;
    let financialChecks: ReadinessCheck[];
    let pendingOps: PendingOperationsMetrics;
    let legacy: LegacyCoexistence;

    try {
      await client.query('BEGIN READ ONLY');

      // 4. Read flag configuration
      configuration = await this.readFlagConfiguration(client);

      // 5. Structural checks
      structural = await this.runStructuralChecks(client);

      // 6. Financial checks via reconciler
      const financialResult = await this.runFinancialChecks(
        client, configuration, filters, windowFrom, windowTo
      );
      financialMetrics = financialResult.metrics;
      financialChecks = financialResult.checks;

      // 7. Pending operations
      pendingOps = await this.checkPendingOperations(client, windowFrom, windowTo);

      // 8. Legacy coexistence
      legacy = await this.checkLegacyCoexistence(client, windowFrom, windowTo);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 9. Non-atomic boundaries
    const nonAtomicBoundaries = this.getKnownNonAtomicBoundaries();
    const nonAtomicChecks = this.buildNonAtomicChecks(nonAtomicBoundaries);

    // 10. Global activation limitation
    const globalActivationCheck = this.buildGlobalActivationCheck();

    // 11. Aggregate all checks
    const allChecks: ReadinessCheck[] = [
      ...structural.checks,
      ...financialChecks,
      ...pendingOps.checks,
      ...legacy.checks,
      ...nonAtomicChecks,
      globalActivationCheck,
    ];

    // 11b. Expected state check (if requested)
    const expectedStateCheck = this.buildExpectedStateCheck(configuration, filters.expectedState);
    if (expectedStateCheck) {
      allChecks.push(expectedStateCheck);
    }

    // 11c. Source divergence check (env vars vs feature_flags table)
    if (configuration.sourceDivergence) {
      allChecks.push({
        id: 'CONFIGURATION_SOURCE_MISMATCH',
        name: 'Divergência entre env vars e feature_flags',
        severity: 'WARNING',
        status: 'FAIL',
        message: `As flags operacionais são determinadas exclusivamente pelas variáveis de ambiente do processo. ` +
          `Os valores da tabela feature_flags são apenas informativos e não alteram o estado efetivo. ` +
          `Env: SHADOW=${configuration.envShadowValue ?? 'ausente'}, WRITE=${configuration.envWriteValue ?? 'ausente'}. ` +
          `DB: SHADOW=${configuration.dbShadowValue ?? 'ausente'}, WRITE=${configuration.dbWriteValue ?? 'ausente'}.`,
        evidence: `envShadow=${configuration.envShadowValue}, envWrite=${configuration.envWriteValue}, dbShadow=${configuration.dbShadowValue}, dbWrite=${configuration.dbWriteValue}`,
        recommendedAction: 'Sincronizar a tabela feature_flags com o estado real das variáveis de ambiente do ECS.',
      });
    }

    // 11d. Runbook presence (declared as available — verified by test suite)
    allChecks.push({
      id: 'OPERATIONAL_RUNBOOK_AVAILABLE',
      name: 'Runbook operacional presente',
      severity: 'INFO',
      status: 'PASS',
      message: 'Runbook disponível em docs/finance/annual-incentive-shadow-runbook.md',
      evidence: 'Verificação em build-time pela suíte de testes do repositório (BUILD_TIME_REPOSITORY_TEST).',
      recommendedAction: '',
    });

    // 11e. Snapshot consistency declaration
    allChecks.push({
      id: 'OPERATIONAL_SNAPSHOT_CONSISTENCY',
      name: 'Consistência de snapshot transacional',
      severity: 'INFO',
      status: 'PASS',
      message: 'Checks estruturais e operacionais usam client A (BEGIN READ ONLY). ' +
        'Reconciliação financeira usa client B (BEGIN READ ONLY separado). ' +
        'Snapshots não são compartilhados entre as duas transações.',
      evidence: 'MULTI_TRANSACTION_EVENTUALLY_CONSISTENT: duas transações READ ONLY independentes.',
      recommendedAction: '',
    });

    // 11f. Database restriction declaration
    allChecks.push({
      id: 'OPERATIONAL_DATABASE_RESTRICTION',
      name: 'Restrição de ambiente de banco',
      severity: 'INFO',
      status: 'PASS',
      message: 'O CLI atual está autorizado somente para bancos locais test/dev. Não está autorizado para execução em produção.',
      evidence: `assertSafeFinanceDatabase() bloqueia RDS, NODE_ENV=production e bancos sem sufixo test/dev.`,
      recommendedAction: '',
    });

    const blockers = allChecks.filter(c => c.severity === 'BLOCKER' && c.status === 'FAIL');
    const warnings = allChecks.filter(c => c.severity === 'WARNING' && c.status === 'FAIL');

    // 12. Determine overall state
    const overallState = this.determineOverallState(
      configuration, structural, financialMetrics, blockers, warnings, filters.windowHours
    );

    // 13. Build recommendations
    const recommendations = this.buildRecommendations(overallState, blockers, warnings, configuration);

    // 14. Build window info
    const window: ReadinessWindow = {
      windowHours: filters.windowHours,
      from: windowFrom.toISOString(),
      to: windowTo.toISOString(),
    };

    return {
      reportVersion: READINESS_REPORT_VERSION,
      generatedAt: now.toISOString(),
      overallState,
      databaseSafety,
      configuration,
      filters: {
        driverId: filters.driverId ?? null,
        rideId: filters.rideId ?? null,
        programYear: filters.programYear ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
      window,
      structuralChecks: structural.checks,
      financialChecks,
      operationalChecks: [...pendingOps.checks, ...legacy.checks, ...nonAtomicChecks, globalActivationCheck, ...(configuration.sourceDivergence ? [{ id: 'CONFIGURATION_SOURCE_MISMATCH', name: 'Divergência entre env vars e feature_flags', severity: 'WARNING' as const, status: 'FAIL' as const, message: 'As flags operacionais são determinadas exclusivamente pelas variáveis de ambiente do processo. Os valores da tabela são apenas informativos.', evidence: `envShadow=${configuration.envShadowValue}, dbShadow=${configuration.dbShadowValue}`, recommendedAction: 'Sincronizar fontes.' }] : []), ...(expectedStateCheck ? [expectedStateCheck] : []), { id: 'OPERATIONAL_RUNBOOK_AVAILABLE', name: 'Runbook operacional presente', severity: 'INFO' as const, status: 'PASS' as const, message: 'Runbook disponível em docs/finance/annual-incentive-shadow-runbook.md', evidence: 'Verificação em build-time pela suíte de testes (BUILD_TIME_REPOSITORY_TEST).', recommendedAction: '' }, { id: 'OPERATIONAL_SNAPSHOT_CONSISTENCY', name: 'Consistência de snapshot', severity: 'INFO' as const, status: 'PASS' as const, message: 'MULTI_TRANSACTION_EVENTUALLY_CONSISTENT', evidence: 'Duas transações READ ONLY independentes.', recommendedAction: '' }, { id: 'OPERATIONAL_DATABASE_RESTRICTION', name: 'Restrição de ambiente', severity: 'INFO' as const, status: 'PASS' as const, message: 'CLI autorizado somente para bancos locais test/dev.', evidence: 'assertSafeFinanceDatabase() ativo.', recommendedAction: '' }],
      knownNonAtomicBoundaries: nonAtomicBoundaries,
      metrics: financialMetrics,
      reconciliation: {
        executed: true,
        criticalDivergenceCount: blockers.filter(b => b.id.startsWith('FINANCIAL_')).length,
        warningCount: warnings.length,
      },
      blockers,
      warnings,
      recommendations,
    };
  }

  // ─── Database Safety ────────────────────────────────────────────────────

  private getDatabaseSafety(): DatabaseSafety {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    let hostname = 'unknown';
    let databaseName = 'unknown';
    try {
      const parsed = new URL(databaseUrl);
      hostname = parsed.hostname;
      databaseName = parsed.pathname.slice(1) || 'unknown';
    } catch { /* ignore parse errors */ }

    return {
      safe: true, // If we got here, assertSafeFinanceDatabase passed
      hostname,
      databaseName,
      guardResult: 'LOCAL_TEST_CONFIRMED',
    };
  }

  // ─── Flag Configuration ─────────────────────────────────────────────────

  private async readFlagConfiguration(client: PoolClient): Promise<FlagConfiguration> {
    // ── Effective state: EXCLUSIVELY from process.env ──
    // The operational shadow service uses:
    //   process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED === 'true'
    //   process.env.ANNUAL_INCENTIVE_WRITE_ENABLED === 'true'
    // Any other value (including 'false', 'TRUE', '1', undefined, garbage) = disabled.
    const envShadowValue = process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED ?? null;
    const envWriteValue = process.env.ANNUAL_INCENTIVE_WRITE_ENABLED ?? null;

    const shadowEnabled = envShadowValue === 'true';
    const writeEnabled = envWriteValue === 'true';

    // ── Database values: DIAGNOSTIC ONLY ──
    // Queried for informational comparison. Never influences effective state.
    const r = await client.query<{ key: string; enabled: boolean }>(
      `SELECT key, enabled FROM feature_flags WHERE key IN ($1, $2)`,
      ['ANNUAL_INCENTIVE_SHADOW_ENABLED', 'ANNUAL_INCENTIVE_WRITE_ENABLED']
    );

    let dbShadowValue: string | null = null;
    let dbWriteValue: string | null = null;

    for (const row of r.rows) {
      if (row.key === 'ANNUAL_INCENTIVE_SHADOW_ENABLED') {
        dbShadowValue = row.enabled ? 'true' : 'false';
      }
      if (row.key === 'ANNUAL_INCENTIVE_WRITE_ENABLED') {
        dbWriteValue = row.enabled ? 'true' : 'false';
      }
    }

    // ── Configuration state ──
    let configurationState: ConfigurationState;
    if (!shadowEnabled && !writeEnabled) {
      configurationState = 'SHADOW_DISABLED';
    } else if (!shadowEnabled && writeEnabled) {
      configurationState = 'WRITE_AVAILABLE_SHADOW_DISABLED';
    } else if (shadowEnabled && writeEnabled) {
      configurationState = 'SHADOW_ACTIVE';
    } else {
      configurationState = 'INVALID_CONFIGURATION';
    }

    // ── Source divergence: env interpretation vs DB ──
    const dbShadowEnabled = dbShadowValue === 'true';
    const dbWriteEnabled = dbWriteValue === 'true';
    const sourceDivergence =
      (shadowEnabled !== dbShadowEnabled) || (writeEnabled !== dbWriteEnabled);

    return {
      rawShadowValue: envShadowValue,
      rawWriteValue: envWriteValue,
      shadowEnabled,
      writeEnabled,
      configurationState,
      configurationSource: 'PROCESS_ENV' as const,
      envShadowValue,
      envWriteValue,
      dbShadowValue,
      dbWriteValue,
      sourceDivergence,
    };
  }

  // ─── Structural Checks ──────────────────────────────────────────────────

  private async runStructuralChecks(client: PoolClient): Promise<StructuralCheckResult> {
    const checks: ReadinessCheck[] = [];

    // 1. Check annual_incentive_ledger table exists
    const ledgerTable = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'annual_incentive_ledger'`
    );
    const ledgerTableExists = ledgerTable.rowCount! > 0;
    checks.push({
      id: 'STRUCTURAL_LEDGER_TABLE',
      name: 'Tabela annual_incentive_ledger',
      severity: 'BLOCKER',
      status: ledgerTableExists ? 'PASS' : 'FAIL',
      message: ledgerTableExists ? 'Tabela annual_incentive_ledger presente.' : 'Tabela annual_incentive_ledger AUSENTE.',
      evidence: ledgerTableExists ? 'information_schema.tables contém annual_incentive_ledger' : 'Tabela não encontrada em information_schema.tables',
      recommendedAction: ledgerTableExists ? '' : 'Executar migrations pendentes.',
    });

    // 2. Check trigger exists
    const triggerResult = await client.query(
      `SELECT tgenabled FROM pg_trigger WHERE tgname = 'annual_incentive_ledger_immutable_trg'`
    );
    const triggerExists = triggerResult.rowCount! > 0;
    const triggerState = triggerExists ? (triggerResult.rows[0].tgenabled as string) : null;
    const triggerEnabled = triggerState === 'O';

    checks.push({
      id: 'STRUCTURAL_TRIGGER_EXISTS',
      name: 'Trigger annual_incentive_ledger_immutable_trg',
      severity: 'BLOCKER',
      status: triggerExists ? 'PASS' : 'FAIL',
      message: triggerExists ? 'Trigger de imutabilidade presente.' : 'Trigger de imutabilidade AUSENTE.',
      evidence: triggerExists ? `pg_trigger.tgenabled = '${triggerState}'` : 'Trigger não encontrado em pg_trigger',
      recommendedAction: triggerExists ? '' : 'Recriar trigger de imutabilidade no ledger.',
    });

    // 3. Check trigger enabled (tgenabled = 'O')
    checks.push({
      id: 'STRUCTURAL_TRIGGER_ENABLED',
      name: 'Trigger habilitado (tgenabled = O)',
      severity: 'BLOCKER',
      status: triggerEnabled ? 'PASS' : 'FAIL',
      message: triggerEnabled ? 'Trigger habilitado (O = Origin).' : `Trigger NÃO habilitado (estado: ${triggerState ?? 'inexistente'}).`,
      evidence: triggerState ? `tgenabled = '${triggerState}'` : 'Trigger inexistente',
      recommendedAction: triggerEnabled ? '' : 'ENABLE TRIGGER annual_incentive_ledger_immutable_trg.',
    });

    // 4. Check idempotency_key constraint
    const idempConstraint = await client.query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_name = 'annual_incentive_ledger'
         AND constraint_type IN ('UNIQUE', 'PRIMARY KEY')
         AND constraint_name LIKE '%idempotency_key%'
       UNION
       SELECT 1 FROM pg_indexes
       WHERE tablename = 'annual_incentive_ledger'
         AND indexdef LIKE '%idempotency_key%'
         AND indexdef LIKE '%UNIQUE%'`
    );
    const idempotencyKeyConstraintExists = idempConstraint.rowCount! > 0;
    checks.push({
      id: 'STRUCTURAL_IDEMPOTENCY_CONSTRAINT',
      name: 'Constraint de idempotency_key',
      severity: 'BLOCKER',
      status: idempotencyKeyConstraintExists ? 'PASS' : 'FAIL',
      message: idempotencyKeyConstraintExists ? 'Constraint de unicidade da chave de idempotência presente.' : 'Constraint de idempotency_key AUSENTE.',
      evidence: idempotencyKeyConstraintExists ? 'Constraint ou índice UNIQUE encontrado para idempotency_key' : 'Nenhum constraint/índice UNIQUE para idempotency_key',
      recommendedAction: idempotencyKeyConstraintExists ? '' : 'Criar constraint UNIQUE em idempotency_key.',
    });

    // 5. Check source identity constraint/index (unique on source_type + source_event_id + event_type)
    const sourceConstraint = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'annual_incentive_ledger'
         AND indexdef LIKE '%source_event%'
         AND indexdef LIKE '%UNIQUE%'`
    );
    const sourceIdentityConstraintExists = sourceConstraint.rowCount! > 0;
    const sourceIndexName = sourceConstraint.rows[0]?.indexname ?? 'N/A';
    checks.push({
      id: 'STRUCTURAL_SOURCE_IDENTITY',
      name: 'Índice UNIQUE de identidade da origem (source_type, source_event_id, event_type)',
      severity: 'BLOCKER',
      status: sourceIdentityConstraintExists ? 'PASS' : 'FAIL',
      message: sourceIdentityConstraintExists
        ? `Índice UNIQUE de identidade da origem presente: ${sourceIndexName}`
        : 'Índice UNIQUE de identidade da origem AUSENTE.',
      evidence: sourceIdentityConstraintExists
        ? `${sourceIndexName}: ${sourceConstraint.rows[0]?.indexdef ?? ''}`
        : 'Nenhum índice UNIQUE para source_event_id encontrado',
      recommendedAction: sourceIdentityConstraintExists ? '' : 'Criar índice UNIQUE em (source_type, source_event_id, event_type).',
    });

    // 6. Check essential columns exist
    let essentialColumnsPresent = true;
    let essentialTypesCorrect = true;
    const columnResult = await client.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'annual_incentive_ledger'`
    );
    const columnMap = new Map<string, string>();
    for (const row of columnResult.rows) {
      columnMap.set(row.column_name, row.data_type);
    }

    const missingColumns: string[] = [];
    const wrongTypes: string[] = [];
    for (const [col, expectedType] of Object.entries(ESSENTIAL_COLUMNS)) {
      const actualType = columnMap.get(col);
      if (!actualType) {
        essentialColumnsPresent = false;
        missingColumns.push(col);
      } else if (!this.typeMatches(actualType, expectedType)) {
        essentialTypesCorrect = false;
        wrongTypes.push(`${col}: esperado ${expectedType}, encontrado ${actualType}`);
      }
    }

    checks.push({
      id: 'STRUCTURAL_ESSENTIAL_COLUMNS',
      name: 'Colunas essenciais presentes',
      severity: 'BLOCKER',
      status: essentialColumnsPresent ? 'PASS' : 'FAIL',
      message: essentialColumnsPresent ? 'Todas as colunas essenciais presentes.' : `Colunas ausentes: ${missingColumns.join(', ')}`,
      evidence: essentialColumnsPresent ? `${columnMap.size} colunas encontradas` : `Faltam: ${missingColumns.join(', ')}`,
      recommendedAction: essentialColumnsPresent ? '' : 'Executar migrations pendentes.',
    });

    checks.push({
      id: 'STRUCTURAL_ESSENTIAL_TYPES',
      name: 'Tipos de colunas corretos',
      severity: 'BLOCKER',
      status: essentialTypesCorrect ? 'PASS' : 'FAIL',
      message: essentialTypesCorrect ? 'Todos os tipos de dados estão corretos.' : `Tipos incorretos: ${wrongTypes.join('; ')}`,
      evidence: essentialTypesCorrect ? 'Todos os tipos conferem' : wrongTypes.join('; '),
      recommendedAction: essentialTypesCorrect ? '' : 'Verificar migrations.',
    });

    // 8. wallet_ledger exists
    const walletLedger = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wallet_ledger'`
    );
    const walletLedgerExists = walletLedger.rowCount! > 0;
    checks.push({
      id: 'STRUCTURAL_WALLET_LEDGER',
      name: 'Tabela wallet_ledger',
      severity: 'BLOCKER',
      status: walletLedgerExists ? 'PASS' : 'FAIL',
      message: walletLedgerExists ? 'Tabela wallet_ledger presente.' : 'Tabela wallet_ledger AUSENTE.',
      evidence: walletLedgerExists ? 'information_schema.tables contém wallet_ledger' : 'Tabela não encontrada',
      recommendedAction: walletLedgerExists ? '' : 'Executar migrations.',
    });

    // 9. pending_debits exists
    const pendingDebits = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pending_debits'`
    );
    const pendingDebitsExists = pendingDebits.rowCount! > 0;
    checks.push({
      id: 'STRUCTURAL_PENDING_DEBITS',
      name: 'Tabela pending_debits',
      severity: 'BLOCKER',
      status: pendingDebitsExists ? 'PASS' : 'FAIL',
      message: pendingDebitsExists ? 'Tabela pending_debits presente.' : 'Tabela pending_debits AUSENTE.',
      evidence: pendingDebitsExists ? 'information_schema.tables contém pending_debits' : 'Tabela não encontrada',
      recommendedAction: pendingDebitsExists ? '' : 'Executar migrations.',
    });

    // 10. Timezone check (constant — always America/Sao_Paulo)
    checks.push({
      id: 'STRUCTURAL_TIMEZONE',
      name: 'Timezone do programa',
      severity: 'INFO',
      status: 'PASS',
      message: `Timezone: ${EXPECTED_TIMEZONE}`,
      evidence: 'Constante definida no código: America/Sao_Paulo',
      recommendedAction: '',
    });

    // 11. Policy version check
    checks.push({
      id: 'STRUCTURAL_POLICY_VERSION',
      name: 'Versão da política',
      severity: 'INFO',
      status: 'PASS',
      message: `Versão da política: ${EXPECTED_POLICY_VERSION}`,
      evidence: 'Constante definida no código: ANNUAL-INCENTIVE-v1',
      recommendedAction: '',
    });

    return {
      ledgerTableExists,
      triggerExists,
      triggerEnabled,
      triggerState,
      idempotencyKeyConstraintExists,
      sourceIdentityConstraintExists,
      essentialColumnsPresent,
      essentialTypesCorrect,
      walletLedgerExists,
      pendingDebitsExists,
      timezone: EXPECTED_TIMEZONE,
      policyVersion: EXPECTED_POLICY_VERSION,
      checks,
    };
  }

  private typeMatches(actual: string, expected: string): boolean {
    // Normalize type names for comparison
    const normalize = (t: string): string => {
      return t.toLowerCase()
        .replace('character varying', 'text')
        .replace('timestamp without time zone', 'timestamp')
        .replace('timestamp with time zone', 'timestamp with time zone')
        .trim();
    };
    const a = normalize(actual);
    const e = normalize(expected);
    // Allow bigint to match bigint or numeric
    if (e === 'bigint' && (a === 'bigint' || a === 'numeric')) return true;
    if (e === 'text' && (a === 'text' || a === 'character varying')) return true;
    if (e === 'integer' && (a === 'integer' || a === 'int' || a === 'int4')) return true;
    return a === e || a.startsWith(e);
  }

  // ─── Financial Checks (via Reconciler) ──────────────────────────────────

  private async runFinancialChecks(
    client: PoolClient,
    configuration: FlagConfiguration,
    filters: ReadinessFilters,
    windowFrom: Date,
    windowTo: Date,
  ): Promise<{ metrics: FinancialMetrics; checks: ReadinessCheck[] }> {
    const checks: ReadinessCheck[] = [];

    // Run reconciler with same filters
    const reconciler = new AnnualIncentiveReconciliationService(this.pool);
    const reconcilerFilters = {
      driverId: filters.driverId,
      rideId: filters.rideId,
      programYear: filters.programYear,
      from: filters.from ?? windowFrom,
      to: filters.to ?? windowTo,
    };

    const report = await reconciler.run(reconcilerFilters);
    const t = report.totals;

    // Coverage calculation using bigint (no floating point)
    const coverageBasisPoints: bigint | null =
      t.expectedAccrualEventCount === 0
        ? null
        : (BigInt(t.matchedCount) * 10000n) / BigInt(t.expectedAccrualEventCount);

    const metrics: FinancialMetrics = {
      walletEventCount: t.walletEventCount,
      expectedAccrualEventCount: t.expectedAccrualEventCount,
      actualAccrualEventCount: t.actualAccrualEventCount,
      matchedCount: t.matchedCount,
      missingCount: t.missingCount,
      mismatchCount: t.mismatchCount,
      orphanCount: t.orphanCount,
      duplicateCount: t.duplicateCount,
      unexpectedCount: t.unexpectedCount,
      zeroIncrementCount: t.zeroIncrementCount,
      reversalReviewCount: t.reversalReviewCount,
      totalConsumedFeeCents: t.totalConsumedFeeCents.toString(),
      expectedGrossAccrualCents: t.expectedGrossAccrualCents.toString(),
      actualGrossAccrualCents: t.actualGrossAccrualCents.toString(),
      actualNetAccrualCents: t.actualNetAccrualCents.toString(),
      differenceCents: t.differenceCents.toString(),
      coverageBasisPoints: coverageBasisPoints !== null ? coverageBasisPoints.toString() : null,
    };

    // Check critical divergences
    const isShadowActive = configuration.configurationState === 'SHADOW_ACTIVE';

    // MISSING_ACCRUAL is only a blocker when shadow is active
    if (isShadowActive && t.missingCount > 0) {
      checks.push({
        id: 'FINANCIAL_MISSING_ACCRUAL',
        name: 'Accruals ausentes com modo sombra ativo',
        severity: 'BLOCKER',
        status: 'FAIL',
        message: `${t.missingCount} accrual(s) ausente(s) com modo sombra ativo.`,
        evidence: `missingCount = ${t.missingCount}, shadowActive = true`,
        recommendedAction: 'Investigar por que accruals não foram gravados para eventos elegíveis.',
      });
    } else if (!isShadowActive && t.missingCount > 0) {
      checks.push({
        id: 'FINANCIAL_MISSING_ACCRUAL_SHADOW_OFF',
        name: 'Accruals ausentes (shadow desligado)',
        severity: 'INFO',
        status: 'PASS',
        message: `${t.missingCount} accrual(s) ausente(s) — esperado com shadow desligado.`,
        evidence: `missingCount = ${t.missingCount}, shadowActive = false`,
        recommendedAction: '',
      });
    }

    if (t.mismatchCount > 0) {
      checks.push({
        id: 'FINANCIAL_AMOUNT_MISMATCH',
        name: 'Divergência de valores',
        severity: 'BLOCKER',
        status: 'FAIL',
        message: `${t.mismatchCount} divergência(s) de valor detectada(s).`,
        evidence: `mismatchCount = ${t.mismatchCount}`,
        recommendedAction: 'Investigar divergências individualmente no reconciliador.',
      });
    }

    if (t.orphanCount > 0) {
      checks.push({
        id: 'FINANCIAL_ORPHAN_ACCRUAL',
        name: 'Accruals órfãos',
        severity: 'BLOCKER',
        status: 'FAIL',
        message: `${t.orphanCount} accrual(s) órfão(s) sem evento wallet correspondente.`,
        evidence: `orphanCount = ${t.orphanCount}`,
        recommendedAction: 'Investigar origem dos accruals órfãos.',
      });
    }

    if (t.duplicateCount > 0) {
      checks.push({
        id: 'FINANCIAL_DUPLICATE',
        name: 'Duplicidades detectadas',
        severity: 'BLOCKER',
        status: 'FAIL',
        message: `${t.duplicateCount} duplicidade(s) detectada(s).`,
        evidence: `duplicateCount = ${t.duplicateCount}`,
        recommendedAction: 'Investigar falha de idempotência.',
      });
    }

    if (t.unexpectedCount > 0) {
      checks.push({
        id: 'FINANCIAL_UNEXPECTED',
        name: 'Accruals inesperados',
        severity: 'BLOCKER',
        status: 'FAIL',
        message: `${t.unexpectedCount} accrual(s) inesperado(s).`,
        evidence: `unexpectedCount = ${t.unexpectedCount}`,
        recommendedAction: 'Investigar accruals não associados a eventos esperados.',
      });
    }

    if (t.unresolvedPendingReferenceCount > 0) {
      checks.push({
        id: 'FINANCIAL_UNRESOLVED_PENDING',
        name: 'Referências de pendência não resolvidas',
        severity: 'BLOCKER',
        status: 'FAIL',
        message: `${t.unresolvedPendingReferenceCount} referência(s) de pending_debit não resolvida(s).`,
        evidence: `unresolvedPendingReferenceCount = ${t.unresolvedPendingReferenceCount}`,
        recommendedAction: 'Investigar pending_debits com status inconsistente.',
      });
    }

    if (t.reversalReviewCount > 0) {
      checks.push({
        id: 'FINANCIAL_REVERSAL_REVIEW',
        name: 'Reversões requerem revisão',
        severity: 'WARNING',
        status: 'FAIL',
        message: `${t.reversalReviewCount} reversão(ões) requer(em) revisão manual.`,
        evidence: `reversalReviewCount = ${t.reversalReviewCount}`,
        recommendedAction: 'Revisar reversões — fluxo operacional de reversão ainda não implementado.',
      });
    }

    // If no issues at all
    if (checks.length === 0) {
      checks.push({
        id: 'FINANCIAL_OK',
        name: 'Reconciliação financeira',
        severity: 'INFO',
        status: 'PASS',
        message: 'Zero divergências detectadas na janela analisada.',
        evidence: `walletEventCount=${t.walletEventCount}, matchedCount=${t.matchedCount}`,
        recommendedAction: '',
      });
    }

    return { metrics, checks };
  }

  // ─── Pending Operations ─────────────────────────────────────────────────

  private async checkPendingOperations(
    client: PoolClient,
    windowFrom: Date,
    windowTo: Date,
  ): Promise<PendingOperationsMetrics> {
    const checks: ReadinessCheck[] = [];

    // Count pending
    const pendingResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pending_debits WHERE status = 'pending'`
    );
    const pendingCount = parseInt(pendingResult.rows[0]?.count ?? '0', 10);

    // Count failed
    const failedResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pending_debits WHERE status = 'failed'`
    );
    const failedCount = parseInt(failedResult.rows[0]?.count ?? '0', 10);

    // Count resolved in window
    const resolvedResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pending_debits WHERE status = 'resolved' AND resolved_at >= $1 AND resolved_at <= $2`,
      [windowFrom, windowTo]
    );
    const resolvedInWindowCount = parseInt(resolvedResult.rows[0]?.count ?? '0', 10);

    // Oldest pending
    const oldestResult = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM pending_debits WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
    );
    const oldestPendingCreatedAt = oldestResult.rows[0]?.created_at ?? null;
    let oldestPendingAgeHours: number | null = null;
    if (oldestPendingCreatedAt) {
      oldestPendingAgeHours = Math.round(
        (Date.now() - oldestPendingCreatedAt.getTime()) / (1000 * 60 * 60)
      );
    }

    // Generate checks
    if (pendingCount > 0 && oldestPendingAgeHours !== null && oldestPendingAgeHours > 24) {
      checks.push({
        id: 'OPERATIONAL_PENDING_OLD',
        name: 'Pendência antiga',
        severity: 'WARNING',
        status: 'FAIL',
        message: `${pendingCount} pendência(s) com mais de 24h (mais antiga: ${oldestPendingAgeHours}h).`,
        evidence: `oldestPendingAgeHours = ${oldestPendingAgeHours}`,
        recommendedAction: 'Investigar pendências antigas — possível falha no settlement.',
      });
    } else if (pendingCount > 0) {
      checks.push({
        id: 'OPERATIONAL_PENDING_RECENT',
        name: 'Pendências recentes',
        severity: 'INFO',
        status: 'PASS',
        message: `${pendingCount} pendência(s) recente(s) em processamento.`,
        evidence: `pendingCount = ${pendingCount}, ageHours = ${oldestPendingAgeHours ?? 0}`,
        recommendedAction: '',
      });
    }

    if (failedCount > 0) {
      checks.push({
        id: 'OPERATIONAL_PENDING_FAILED',
        name: 'Pendências com falha',
        severity: 'WARNING',
        status: 'FAIL',
        message: `${failedCount} pendência(s) com status 'failed'.`,
        evidence: `failedCount = ${failedCount}`,
        recommendedAction: 'Investigar causa das falhas e considerar reprocessamento manual.',
      });
    }

    return {
      pendingCount,
      failedCount,
      resolvedInWindowCount,
      oldestPendingCreatedAt: oldestPendingCreatedAt?.toISOString() ?? null,
      oldestPendingAgeHours,
      checks,
    };
  }

  // ─── Legacy Coexistence ─────────────────────────────────────────────────

  private async checkLegacyCoexistence(
    client: PoolClient,
    windowFrom: Date,
    windowTo: Date,
  ): Promise<LegacyCoexistence> {
    const checks: ReadinessCheck[] = [];

    // Check family_return_accruals in window
    let legacyCount = 0;
    const legacyTableExists = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'family_return_accruals'`
    );
    if (legacyTableExists.rowCount! > 0) {
      const legacyResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM family_return_accruals WHERE created_at >= $1 AND created_at <= $2`,
        [windowFrom, windowTo]
      );
      legacyCount = parseInt(legacyResult.rows[0]?.count ?? '0', 10);
    }

    // Check annual_incentive_ledger in window
    let annualIncentiveCount = 0;
    const ledgerTableExists = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'annual_incentive_ledger'`
    );
    if (ledgerTableExists.rowCount! > 0) {
      const incentiveResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM annual_incentive_ledger WHERE created_at >= $1 AND created_at <= $2`,
        [windowFrom, windowTo]
      );
      annualIncentiveCount = parseInt(incentiveResult.rows[0]?.count ?? '0', 10);
    }

    const legacyCoexistenceDetected = legacyCount > 0 && annualIncentiveCount > 0;

    if (legacyCount > 0) {
      checks.push({
        id: 'OPERATIONAL_LEGACY_COEXISTENCE',
        name: 'Coexistência com retorno legado',
        severity: 'WARNING',
        status: 'FAIL',
        message: 'O retorno legado por recarga continua coexistindo com a Gratificação Anual. Os valores não devem ser somados nem apresentados como o mesmo benefício.',
        evidence: `legacyAccrualRecordCountInWindow = ${legacyCount}, annualIncentiveRecordCountInWindow = ${annualIncentiveCount}`,
        recommendedAction: 'Planejar descontinuação do retorno legado após validação do modo sombra.',
      });
    }

    return {
      legacyAccrualRecordCountInWindow: legacyCount,
      annualIncentiveRecordCountInWindow: annualIncentiveCount,
      legacyCoexistenceDetected,
      checks,
    };
  }

  // ─── Non-Atomic Boundaries ──────────────────────────────────────────────

  private getKnownNonAtomicBoundaries(): NonAtomicBoundary[] {
    return KNOWN_NON_ATOMIC_BOUNDARIES;
  }

  private buildNonAtomicChecks(boundaries: NonAtomicBoundary[]): ReadinessCheck[] {
    return boundaries.map(b => ({
      id: `NON_ATOMIC_${b.component.toUpperCase()}`,
      name: `Fronteira não atômica: ${b.component}`,
      severity: 'WARNING' as CheckSeverity,
      status: 'FAIL' as CheckStatus,
      message: b.description,
      evidence: `Componente ${b.component} é gravado pós-commit.`,
      recommendedAction: b.recommendedAction,
    }));
  }

  // ─── Global Activation Limitation ──────────────────────────────────────

  private buildGlobalActivationCheck(): ReadinessCheck {
    return {
      id: 'GLOBAL_ONLY_ACTIVATION',
      name: 'Flags globais — sem ativação por coorte',
      severity: 'WARNING',
      status: 'FAIL',
      message: 'As flags atuais são globais. Não existe ativação por motorista, cidade, percentual ou coorte.',
      evidence: 'Feature flags ANNUAL_INCENTIVE_SHADOW_ENABLED e ANNUAL_INCENTIVE_WRITE_ENABLED são booleanas globais.',
      recommendedAction: 'Ativação gradual real exigirá etapa futura de escopo por coorte ou cidade.',
    };
  }

  // ─── Expected State Check ──────────────────────────────────────────────

  private buildExpectedStateCheck(
    configuration: FlagConfiguration,
    expectedState?: 'disabled' | 'active',
  ): ReadinessCheck | null {
    if (!expectedState) return null;

    if (expectedState === 'disabled') {
      const matches = !configuration.shadowEnabled;
      return {
        id: matches ? 'EXPECTED_STATE_MATCH' : 'EXPECTED_STATE_MISMATCH',
        name: 'Estado esperado: disabled',
        severity: matches ? 'INFO' : 'BLOCKER',
        status: matches ? 'PASS' : 'FAIL',
        message: matches
          ? 'Estado atual corresponde ao esperado (shadow desligado).'
          : `Estado esperado "disabled" mas shadow está ativo (shadowEnabled=${configuration.shadowEnabled}).`,
        evidence: `expectedState=disabled, shadowEnabled=${configuration.shadowEnabled}`,
        recommendedAction: matches ? '' : 'Shadow está ativo quando deveria estar desligado.',
      };
    }

    if (expectedState === 'active') {
      const matches = configuration.shadowEnabled && configuration.writeEnabled;
      return {
        id: matches ? 'EXPECTED_STATE_MATCH' : 'EXPECTED_STATE_MISMATCH',
        name: 'Estado esperado: active',
        severity: matches ? 'INFO' : 'BLOCKER',
        status: matches ? 'PASS' : 'FAIL',
        message: matches
          ? 'Estado atual corresponde ao esperado (shadow ativo e escrita ativa).'
          : `Estado esperado "active" mas configuração atual: shadow=${configuration.shadowEnabled}, write=${configuration.writeEnabled}.`,
        evidence: `expectedState=active, shadowEnabled=${configuration.shadowEnabled}, writeEnabled=${configuration.writeEnabled}`,
        recommendedAction: matches ? '' : 'Configuração não corresponde ao estado esperado.',
      };
    }

    return null;
  }

  // ─── Overall State Determination ───────────────────────────────────────

  private determineOverallState(
    configuration: FlagConfiguration,
    structural: StructuralCheckResult,
    metrics: FinancialMetrics,
    blockers: ReadinessCheck[],
    warnings: ReadinessCheck[],
    windowHours: number,
  ): ReadinessState {
    // Invalid configuration overrides all
    if (configuration.configurationState === 'INVALID_CONFIGURATION') {
      return 'INVALID_CONFIGURATION';
    }

    // Any blocker means NOT_READY
    if (blockers.length > 0) {
      return 'NOT_READY';
    }

    const isShadowActive = configuration.configurationState === 'SHADOW_ACTIVE';

    if (isShadowActive) {
      // Check if there's traffic
      if (metrics.walletEventCount === 0) {
        return 'INSUFFICIENT_TRAFFIC';
      }

      // Check healthy: 100% coverage, zero difference
      const coverageBP = metrics.coverageBasisPoints !== null ? BigInt(metrics.coverageBasisPoints) : null;
      const differenceCents = BigInt(metrics.differenceCents);

      if (
        coverageBP === 10000n &&
        differenceCents === 0n &&
        structural.triggerEnabled &&
        warnings.filter(w => w.severity === 'WARNING' && !this.isExpectedWarning(w)).length === 0
      ) {
        return 'SHADOW_ACTIVE_HEALTHY';
      }

      // If there are warnings but no blockers
      return 'SHADOW_ACTIVE_DEGRADED';
    }

    // Shadow not active — check readiness
    // Structure must be complete
    if (!structural.ledgerTableExists || !structural.triggerEnabled ||
        !structural.idempotencyKeyConstraintExists || !structural.essentialColumnsPresent ||
        !structural.walletLedgerExists || !structural.pendingDebitsExists) {
      return 'NOT_READY';
    }

    return 'READY_TO_ENABLE_SHADOW';
  }

  private isExpectedWarning(check: ReadinessCheck): boolean {
    // These warnings are expected and don't degrade active shadow
    const expectedWarnings = [
      'GLOBAL_ONLY_ACTIVATION',
      'NON_ATOMIC_RIDE_FEE_SPLITS',
      'NON_ATOMIC_TERRITORY_LEDGER',
      'OPERATIONAL_LEGACY_COEXISTENCE',
    ];
    return expectedWarnings.includes(check.id);
  }

  // ─── Recommendations ────────────────────────────────────────────────────

  private buildRecommendations(
    state: ReadinessState,
    blockers: ReadinessCheck[],
    warnings: ReadinessCheck[],
    configuration: FlagConfiguration,
  ): string[] {
    const recs: string[] = [];

    switch (state) {
      case 'READY_TO_ENABLE_SHADOW':
        recs.push('Sistema pronto. Seguir runbook para ativar WRITE=true primeiro, depois SHADOW=true.');
        recs.push('Confirmar backup/PITR antes de ativação.');
        recs.push('Definir responsável técnico e janela de observação.');
        break;
      case 'SHADOW_ACTIVE_HEALTHY':
        recs.push('Modo sombra operando com saúde total.');
        recs.push('Continuar monitoramento periódico conforme runbook.');
        break;
      case 'SHADOW_ACTIVE_DEGRADED':
        recs.push('Modo sombra operando com avisos. Revisar warnings.');
        recs.push('Se avisos persistirem, considerar investigação ou rollback.');
        break;
      case 'NOT_READY':
        recs.push('Resolver todos os blockers antes de ativar o modo sombra.');
        for (const b of blockers) {
          if (b.recommendedAction) recs.push(`  → ${b.recommendedAction}`);
        }
        break;
      case 'INVALID_CONFIGURATION':
        recs.push('Configuração inválida: SHADOW=true com WRITE=false.');
        recs.push('Corrigir: desligar SHADOW ou ligar WRITE.');
        recs.push('Ordem correta: ativar WRITE=true ANTES de SHADOW=true.');
        break;
      case 'INSUFFICIENT_TRAFFIC':
        recs.push('Nenhum evento elegível ocorreu na janela analisada.');
        recs.push('A ausência de divergência não comprova a saúde do modo sombra.');
        recs.push('Aguardar tráfego real e reavaliar.');
        break;
    }

    return recs;
  }
}
