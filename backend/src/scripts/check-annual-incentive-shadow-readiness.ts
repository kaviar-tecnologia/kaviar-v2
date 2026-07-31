/**
 * CLI — Prontidão do Modo Sombra da Gratificação Anual KAVIAR
 *
 * Usage:
 *   DATABASE_URL=... npx tsx src/scripts/check-annual-incentive-shadow-readiness.ts [options]
 *
 * Options:
 *   --window-hours <n>        Window in hours (1-720, default: 24)
 *   --driver-id <id>          Filter by driver
 *   --ride-id <id>            Filter by ride
 *   --program-year <year>     Filter by program year
 *   --from <ISO date>         Filter events from (inclusive)
 *   --to <ISO date>           Filter events to (inclusive)
 *   --expected-state <state>  Expected state: disabled|active
 *   --format human|json       Output format (default: human)
 *   --fail-on-not-ready       Exit code 2/3 if not ready/healthy
 *
 * Exit codes:
 *   0 — ready/healthy (or --fail-on-not-ready not set)
 *   1 — argument/configuration/protection/SQL error
 *   2 — NOT_READY, INVALID_CONFIGURATION, or SHADOW_ACTIVE_DEGRADED with blocker
 *   3 — INSUFFICIENT_TRAFFIC without blocker
 */

import pg from 'pg';
import { assertSafeFinanceDatabase } from '../lib/assert-safe-finance-db';
import {
  AnnualIncentiveShadowReadinessService,
  ReadinessFilters,
  ReadinessReport,
} from '../services/finance/annual-incentive-shadow-readiness.service';
import {
  DEFAULT_WINDOW_HOURS,
  MIN_WINDOW_HOURS,
  MAX_WINDOW_HOURS,
  ReadinessState,
} from '../services/finance/annual-incentive-shadow-readiness.types';

// ─── Argument Parsing ───────────────────────────────────────────────────────

interface CliArgs {
  windowHours: number;
  driverId?: string;
  rideId?: string;
  programYear?: number;
  from?: Date;
  to?: Date;
  expectedState?: 'disabled' | 'active';
  format: 'human' | 'json';
  failOnNotReady: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    windowHours: DEFAULT_WINDOW_HOURS,
    format: 'human',
    failOnNotReady: false,
  };

  const validFlags = new Set([
    '--window-hours', '--driver-id', '--ride-id', '--program-year',
    '--from', '--to', '--expected-state', '--format', '--fail-on-not-ready',
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

    if (arg === '--fail-on-not-ready') {
      args.failOnNotReady = true;
      i++;
      continue;
    }

    // All other flags require a value
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Argumento ${arg} requer um valor`);
    }

    switch (arg) {
      case '--window-hours': {
        const hours = parseInt(value, 10);
        if (isNaN(hours) || hours < MIN_WINDOW_HOURS || hours > MAX_WINDOW_HOURS) {
          throw new Error(`--window-hours inválido: ${value}. Valores válidos: ${MIN_WINDOW_HOURS} a ${MAX_WINDOW_HOURS}.`);
        }
        args.windowHours = hours;
        break;
      }
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
      case '--expected-state': {
        if (value !== 'disabled' && value !== 'active') {
          throw new Error(`--expected-state inválido: ${value}. Use "disabled" ou "active".`);
        }
        args.expectedState = value;
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

function formatCurrency(centsStr: string): string {
  const cents = BigInt(centsStr);
  const isNeg = cents < 0n;
  const abs = isNeg ? -cents : cents;
  const reais = abs / 100n;
  const centavos = abs % 100n;
  const formatted = `R$ ${reais.toString()},${centavos.toString().padStart(2, '0')}`;
  return isNeg ? `-${formatted}` : formatted;
}

function formatCoveragePercent(basisPointsStr: string | null): string {
  if (basisPointsStr === null) return 'N/A (sem eventos)';
  const bp = BigInt(basisPointsStr);
  const intPart = bp / 100n;
  const decPart = bp % 100n;
  return `${intPart.toString()},${decPart.toString().padStart(2, '0')}%`;
}

function stateLabel(state: ReadinessState): string {
  switch (state) {
    case 'READY_TO_ENABLE_SHADOW': return 'READY_TO_ENABLE_SHADOW';
    case 'SHADOW_ACTIVE_HEALTHY': return 'SHADOW_ACTIVE_HEALTHY';
    case 'SHADOW_ACTIVE_DEGRADED': return 'SHADOW_ACTIVE_DEGRADED';
    case 'NOT_READY': return 'NOT_READY';
    case 'INVALID_CONFIGURATION': return 'INVALID_CONFIGURATION';
    case 'INSUFFICIENT_TRAFFIC': return 'INSUFFICIENT_TRAFFIC';
  }
}

function formatHuman(report: ReadinessReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('Prontidão do Modo Sombra — Gratificação Anual KAVIAR');
  lines.push('');
  lines.push(`Estado geral: ${stateLabel(report.overallState)}`);
  lines.push(`Banco: ${report.databaseSafety.guardResult}`);
  lines.push(`Modo sombra: ${report.configuration.shadowEnabled ? 'ativo' : 'desligado'}`);
  lines.push(`Escrita: ${report.configuration.writeEnabled ? 'ativa' : 'desligada'}`);
  lines.push(`Janela: ${report.window.windowHours} horas`);
  lines.push('');

  // Structural
  lines.push('Estrutura:');
  for (const c of report.structuralChecks) {
    if (c.status === 'PASS') {
      lines.push(`  PASS — ${c.message}`);
    } else if (c.status === 'FAIL') {
      lines.push(`  FAIL — ${c.message}`);
    }
  }
  lines.push('');

  // Reconciliation
  const m = report.metrics;
  lines.push('Reconciliação:');
  lines.push(`  Eventos elegíveis: ${m.walletEventCount}`);
  lines.push(`  Direito esperado: ${formatCurrency(m.expectedGrossAccrualCents)}`);
  lines.push(`  Accrual real: ${formatCurrency(m.actualGrossAccrualCents)}`);
  if (!report.configuration.shadowEnabled) {
    const wouldAccrue = BigInt(m.expectedGrossAccrualCents) - BigInt(m.actualGrossAccrualCents);
    lines.push(`  Seria acumulado no modo sombra: ${formatCurrency(wouldAccrue.toString())}`);
  }
  lines.push(`  Divergências críticas existentes: ${report.blockers.filter(b => b.id.startsWith('FINANCIAL_')).length}`);
  if (report.configuration.shadowEnabled) {
    lines.push(`  Cobertura: ${formatCoveragePercent(m.coverageBasisPoints)}`);
    lines.push(`  Eventos esperados: ${m.expectedAccrualEventCount}`);
    lines.push(`  Eventos correspondentes: ${m.matchedCount}`);
    lines.push(`  Diferença financeira: ${formatCurrency(m.differenceCents)}`);
  }
  lines.push('');

  // Warnings
  if (report.warnings.length > 0) {
    lines.push('Avisos:');
    for (const w of report.warnings) {
      lines.push(`  WARNING — ${w.message}`);
    }
    lines.push('');
  }

  // Blockers
  if (report.blockers.length > 0) {
    lines.push('Bloqueadores:');
    for (const b of report.blockers) {
      lines.push(`  BLOCKER — ${b.message}`);
    }
    lines.push('');
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push('Recomendações:');
    for (const r of report.recommendations) {
      lines.push(`  ${r}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── JSON Output ────────────────────────────────────────────────────────────

function formatJson(report: ReadinessReport): string {
  return JSON.stringify(report, null, 2);
}

// ─── Exit Code Logic ────────────────────────────────────────────────────────

function determineExitCode(report: ReadinessReport, failOnNotReady: boolean): number {
  if (!failOnNotReady) return 0;

  const state = report.overallState;
  if (state === 'READY_TO_ENABLE_SHADOW' || state === 'SHADOW_ACTIVE_HEALTHY') {
    return 0;
  }
  if (state === 'INSUFFICIENT_TRAFFIC' && report.blockers.length === 0) {
    return 3;
  }
  // NOT_READY, INVALID_CONFIGURATION, SHADOW_ACTIVE_DEGRADED with blocker
  return 2;
}

// ─── Main ───────────────────────────────────────────────────────────────────

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

  // 4. Create pool and run readiness check
  const { Pool } = pg;
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const service = new AnnualIncentiveShadowReadinessService(pool);
    const filters: ReadinessFilters = {
      windowHours: cliArgs.windowHours,
      driverId: cliArgs.driverId,
      rideId: cliArgs.rideId,
      programYear: cliArgs.programYear,
      from: cliArgs.from,
      to: cliArgs.to,
      expectedState: cliArgs.expectedState,
    };

    const report = await service.run(filters);

    // 5. Output
    if (cliArgs.format === 'json') {
      process.stdout.write(formatJson(report) + '\n');
    } else {
      process.stdout.write(formatHuman(report) + '\n');
    }

    // 6. Exit code
    process.exitCode = determineExitCode(report, cliArgs.failOnNotReady);
  } catch (err) {
    process.stderr.write(`Erro: ${(err as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
