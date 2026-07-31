/**
 * CLI — Reconciliador read-only da Gratificação Anual KAVIAR (modo sombra)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx src/scripts/reconcile-annual-incentive-shadow.ts [options]
 *
 * Options:
 *   --driver-id <id>       Filter by driver
 *   --ride-id <id>         Filter by ride
 *   --program-year <year>  Filter by program year
 *   --from <ISO date>      Filter events from (inclusive)
 *   --to <ISO date>        Filter events to (inclusive)
 *   --format human|json    Output format (default: human)
 *   --fail-on-divergence   Exit code 2 if critical divergence found
 *
 * Exit codes:
 *   0 — no critical divergence (or --fail-on-divergence not set)
 *   1 — configuration/argument/protection/SQL error
 *   2 — critical divergence with --fail-on-divergence
 */

import pg from 'pg';
import { assertSafeFinanceDatabase } from '../lib/assert-safe-finance-db';
import {
  AnnualIncentiveReconciliationService,
  ReconciliationFilters,
  ReconciliationReport,
} from '../services/finance/annual-incentive-reconciliation.service';

// ─── Argument Parsing ───────────────────────────────────────────────────────

interface CliArgs {
  driverId?: string;
  rideId?: string;
  programYear?: number;
  from?: Date;
  to?: Date;
  format: 'human' | 'json';
  failOnDivergence: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { format: 'human', failOnDivergence: false };
  const validFlags = new Set([
    '--driver-id', '--ride-id', '--program-year',
    '--from', '--to', '--format', '--fail-on-divergence',
  ]);

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (!arg.startsWith('--')) {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }

    if (!validFlags.has(arg)) {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }

    if (arg === '--fail-on-divergence') {
      args.failOnDivergence = true;
      i++;
      continue;
    }

    // All other flags require a value
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Argumento ${arg} requer um valor`);
    }

    switch (arg) {
      case '--driver-id':
        args.driverId = value;
        break;
      case '--ride-id':
        args.rideId = value;
        break;
      case '--program-year': {
        const year = parseInt(value, 10);
        if (isNaN(year) || year < 2020 || year > 2100) {
          throw new Error(`Ano do programa inválido: ${value}`);
        }
        args.programYear = year;
        break;
      }
      case '--from': {
        const d = new Date(value);
        if (isNaN(d.getTime())) {
          throw new Error(`Data inválida para --from: ${value}`);
        }
        args.from = d;
        break;
      }
      case '--to': {
        const d = new Date(value);
        if (isNaN(d.getTime())) {
          throw new Error(`Data inválida para --to: ${value}`);
        }
        args.to = d;
        break;
      }
      case '--format': {
        if (value !== 'human' && value !== 'json') {
          throw new Error(`Formato inválido: ${value}. Use "human" ou "json".`);
        }
        args.format = value;
        break;
      }
    }

    i += 2;
  }

  // Validate from/to range
  if (args.from && args.to && args.from > args.to) {
    throw new Error(`Intervalo invertido: --from (${args.from.toISOString()}) > --to (${args.to.toISOString()})`);
  }

  return args;
}

// ─── Human Output ───────────────────────────────────────────────────────────

function formatCurrency(cents: bigint): string {
  const isNeg = cents < 0n;
  const abs = isNeg ? -cents : cents;
  const reais = abs / 100n;
  const centavos = abs % 100n;
  const formatted = `R$ ${reais.toString()},${centavos.toString().padStart(2, '0')}`;
  return isNeg ? `-${formatted}` : formatted;
}

function formatHuman(report: ReconciliationReport): string {
  const lines: string[] = [];
  const t = report.totals;
  const c = report.configuration;

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  Reconciliação da Gratificação Anual KAVIAR');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Segurança do banco: ${c.databaseSafe ? 'LOCAL_TEST_CONFIRMED' : 'UNKNOWN'}`);
  lines.push(`Modo sombra: ${c.shadowEnabled ? 'ativo' : 'desligado'}`);
  lines.push(`Escrita: ${c.writeEnabled ? 'ativa' : 'desligada'}`);
  lines.push(`Configuração: ${c.shadowState}`);
  lines.push('');
  lines.push('─── Totais econômicos ───────────────────────────────────────');
  lines.push(`  Taxa KAVIAR consumida:           ${formatCurrency(t.totalConsumedFeeCents)}`);
  lines.push(`  Gratificação esperada:           ${formatCurrency(t.expectedGrossAccrualCents)}`);
  lines.push(`  Gratificação registrada:         ${formatCurrency(t.actualGrossAccrualCents)}`);
  lines.push(`  Reversões:                       ${formatCurrency(t.actualReversalCents)}`);
  lines.push(`  Saldo líquido registrado:        ${formatCurrency(t.actualNetAccrualCents)}`);
  lines.push(`  Diferença:                       ${formatCurrency(t.differenceCents)}`);
  lines.push(`  Seria acumulado no modo sombra:  ${formatCurrency(t.wouldAccrueCents)}`);
  lines.push('');
  lines.push('─── Contadores ─────────────────────────────────────────────');
  lines.push(`  Eventos wallet analisados:       ${t.walletEventCount}`);
  lines.push(`  Accruals esperados:              ${t.expectedAccrualEventCount}`);
  lines.push(`  Accruals registrados:            ${t.actualAccrualEventCount}`);
  lines.push(`  Correspondências (MATCH):        ${t.matchedCount}`);
  lines.push(`  Divergências (mismatch):         ${t.mismatchCount}`);
  lines.push(`  Ausentes (MISSING):              ${t.missingCount}`);
  lines.push(`  Órfãos (ORPHAN):                 ${t.orphanCount}`);
  lines.push(`  Duplicados (DUPLICATE):          ${t.duplicateCount}`);
  lines.push(`  Incremento zero:                 ${t.zeroIncrementCount}`);
  lines.push(`  Pendência não resolvida:         ${t.unresolvedPendingReferenceCount}`);
  lines.push(`  Reversões p/ revisão:            ${t.reversalReviewCount}`);
  lines.push(`  Inesperados (UNEXPECTED):        ${t.unexpectedCount}`);
  lines.push('');

  if (report.items.length > 0) {
    lines.push('─── Itens ──────────────────────────────────────────────────');
    for (const item of report.items) {
      const status = item.statuses.join(', ');
      lines.push(`  [${status}] driver=${item.driverId} ride=${item.rideId} wallet=${item.walletLedgerEntryId} tipo=${item.walletEntryType} esperado=${item.expectedIncrementCents.toString()}c real=${item.actualAmountCents?.toString() ?? '-'}c`);
    }
    lines.push('');
  }

  if (report.reversals.length > 0) {
    lines.push('─── Reversões ──────────────────────────────────────────────');
    for (const rev of report.reversals) {
      lines.push(`  [REVIEW] id=${rev.eventId} driver=${rev.driverId} valor=${rev.amountCents.toString()}c issues=[${rev.issues.join(', ')}]`);
    }
    lines.push('');
  }

  if (report.orphans.length > 0) {
    lines.push('─── Órfãos ─────────────────────────────────────────────────');
    for (const orph of report.orphans) {
      lines.push(`  [ORPHAN] id=${orph.actualAnnualIncentiveEventId} driver=${orph.driverId} ride=${orph.rideId} valor=${orph.actualAmountCents?.toString() ?? '-'}c`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

// ─── JSON Output ────────────────────────────────────────────────────────────

function bigintToString(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function formatJson(report: ReconciliationReport): string {
  const output = {
    reportVersion: report.reportVersion,
    generatedAt: report.generatedAt.toISOString(),
    configuration: report.configuration,
    filters: {
      driverId: report.filters.driverId ?? null,
      rideId: report.filters.rideId ?? null,
      programYear: report.filters.programYear ?? null,
      from: report.filters.from?.toISOString() ?? null,
      to: report.filters.to?.toISOString() ?? null,
    },
    totals: report.totals,
    groups: report.groups,
    items: report.items.map(item => ({
      ...item,
      walletCreatedAt: item.walletCreatedAt.toISOString(),
      actualOccurredAt: item.actualOccurredAt?.toISOString() ?? null,
    })),
    reversals: report.reversals,
    orphans: report.orphans.map(item => ({
      ...item,
      walletCreatedAt: item.walletCreatedAt.toISOString(),
      actualOccurredAt: item.actualOccurredAt?.toISOString() ?? null,
    })),
  };

  return JSON.stringify(output, bigintToString, 2);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function hasCriticalDivergence(report: ReconciliationReport): boolean {
  const t = report.totals;
  const isShadowActive = report.configuration.shadowState === 'SHADOW_ACTIVE';

  // Critical: mismatches, orphans, duplicates, unexpected, unresolved
  if (t.mismatchCount > 0) return true;
  if (t.orphanCount > 0) return true;
  if (t.duplicateCount > 0) return true;
  if (t.unexpectedCount > 0) return true;
  if (t.unresolvedPendingReferenceCount > 0) return true;

  // Missing accrual is critical only when shadow is active
  if (isShadowActive && t.missingCount > 0) return true;

  return false;
}

async function main(): Promise<void> {
  // 1. Parse arguments BEFORE any connection
  let cliArgs: CliArgs;
  try {
    cliArgs = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Erro de argumento: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  // 2. Validate DATABASE_URL BEFORE any connection
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write('Erro: DATABASE_URL não está definida.\n');
    process.exitCode = 1;
    return;
  }

  // 3. Validate database safety BEFORE creating pool
  try {
    assertSafeFinanceDatabase({ databaseUrl });
  } catch (err) {
    process.stderr.write(`Erro de segurança: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  // 4. Create pool and run reconciliation
  const { Pool } = pg;
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const service = new AnnualIncentiveReconciliationService(pool);
    const filters: ReconciliationFilters = {
      driverId: cliArgs.driverId,
      rideId: cliArgs.rideId,
      programYear: cliArgs.programYear,
      from: cliArgs.from,
      to: cliArgs.to,
    };

    const report = await service.run(filters);

    // 5. Output
    if (cliArgs.format === 'json') {
      process.stdout.write(formatJson(report) + '\n');
    } else {
      process.stdout.write(formatHuman(report) + '\n');
    }

    // 6. Exit code
    if (cliArgs.failOnDivergence && hasCriticalDivergence(report)) {
      process.exitCode = 2;
    } else {
      process.exitCode = 0;
    }
  } catch (err) {
    process.stderr.write(`Erro: ${(err as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
