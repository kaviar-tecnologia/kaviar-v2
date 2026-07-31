/**
 * Central safety guard for finance operations (tests, reconciliations, backfills).
 *
 * Unlike assert-safe-db-url.ts (which only checks hostname during test runs),
 * this function is called explicitly before ANY finance operation that touches
 * the database — including reconciliation scripts and future backfills.
 *
 * It BLOCKS execution against production databases unless explicitly overridden.
 */

const BLOCKED_HOSTNAME_PATTERNS: readonly RegExp[] = [
  /rds\.amazonaws\.com$/i,
  /production/i,
  /kaviar-prod/i,
];

const LOCAL_HOSTNAMES: readonly string[] = [
  'localhost',
  '127.0.0.1',
  '[::1]',
];

const SAFE_DBNAME_PATTERNS: readonly RegExp[] = [
  /test/i,
  /dev/i,
];

export const PRODUCTION_BLOCKED_ERROR =
  'PRODUCTION_DATABASE_BLOCKED: esta operação não pode usar o banco de produção.';

export type FinanceDbGuardOptions = {
  /** Override: process.env.NODE_ENV */
  nodeEnv?: string;
  /** Override: process.env.ALLOW_LOCAL_FINANCE_DATABASE */
  allowLocalFinanceDatabase?: string;
  /** Override: process.env.DATABASE_URL */
  databaseUrl?: string;
};

/**
 * Throws if the database URL points to a production database.
 *
 * Rules (in order):
 * 1. BLOCK if NODE_ENV === 'production' (regardless of URL or overrides).
 * 2. BLOCK if hostname matches known production patterns (rds.amazonaws.com, production, kaviar-prod).
 *    This rule is absolute — ALLOW_LOCAL_FINANCE_DATABASE cannot override it.
 * 3. ALLOW if database name (pathname) contains "test" or "dev" (any hostname).
 * 4. ALLOW if hostname is local (localhost, 127.0.0.1, [::1]) AND ALLOW_LOCAL_FINANCE_DATABASE=true.
 * 5. BLOCK otherwise.
 *
 * Key behavior:
 * - localhost with DB name "kaviar" (no test/dev) → BLOCKED by default
 * - localhost with DB name "kaviar" + ALLOW_LOCAL_FINANCE_DATABASE=true → ALLOWED
 * - RDS with DB name "kaviar_test" + ALLOW_LOCAL_FINANCE_DATABASE=true → BLOCKED (Rule 2)
 */
export function assertSafeFinanceDatabase(options: FinanceDbGuardOptions = {}): void {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const allowLocal = options.allowLocalFinanceDatabase ?? process.env.ALLOW_LOCAL_FINANCE_DATABASE;
  const databaseUrl = 'databaseUrl' in options ? options.databaseUrl : process.env.DATABASE_URL;

  // Rule 1: production environment always blocked
  if (nodeEnv === 'production') {
    throw new Error(
      `${PRODUCTION_BLOCKED_ERROR} NODE_ENV=production detectado.`
    );
  }

  if (!databaseUrl) {
    throw new Error(
      `${PRODUCTION_BLOCKED_ERROR} DATABASE_URL não está definida.`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      `${PRODUCTION_BLOCKED_ERROR} DATABASE_URL não é uma URL válida.`
    );
  }

  const hostname = parsed.hostname;
  const pathname = parsed.pathname; // e.g. /kaviar_test

  // Rule 2: blocked hostname patterns (absolute, no override)
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(
        `${PRODUCTION_BLOCKED_ERROR} Hostname "${hostname}" corresponde a padrão bloqueado.`
      );
    }
  }

  // Rule 3: safe database name (any hostname, including remote)
  if (pathname && SAFE_DBNAME_PATTERNS.some((p) => p.test(pathname))) {
    return;
  }

  // Rule 4: local hostname + explicit escape hatch
  const isLocal = LOCAL_HOSTNAMES.includes(hostname);
  if (isLocal && allowLocal === 'true') {
    return;
  }

  // Rule 5: block everything else
  if (isLocal) {
    throw new Error(
      `${PRODUCTION_BLOCKED_ERROR} Banco "${pathname.slice(1) || '(vazio)'}" em ${hostname} não contém "test" ou "dev" no nome. ` +
        `Use ALLOW_LOCAL_FINANCE_DATABASE=true para permitir banco local sem sufixo seguro.`
    );
  }

  throw new Error(
    `${PRODUCTION_BLOCKED_ERROR} Hostname "${hostname}" não é reconhecido como seguro e o nome do banco não contém "test" ou "dev". ` +
      `Configure DATABASE_URL para um banco com sufixo _test ou _dev.`
  );
}
