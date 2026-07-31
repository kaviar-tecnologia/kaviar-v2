/**
 * Annual Incentive Request Window validation.
 *
 * Rules:
 * - Requests allowed from October 1 to December 31 (inclusive)
 * - Timezone: America/Sao_Paulo
 * - Saldo não solicitado não expira
 * - Saldo permanece associado ao ano de aquisição
 *
 * ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN is a TEST-ONLY override.
 * It can only force the window open when ALL of:
 *   - Value is exactly "true" (case-sensitive)
 *   - NODE_ENV is "test" (or local dev explicitly)
 *   - DATABASE_URL points to localhost/127.0.0.1
 *   - Database name contains "test" or "dev"
 *   - Host is not RDS or any remote server
 *
 * In production, staging, remote DB, or RDS: the flag is IGNORED.
 */

const SAO_PAULO_TZ = 'America/Sao_Paulo';
const WINDOW_START_MONTH = 10; // October
const WINDOW_END_MONTH = 12;   // December

/**
 * Determines if the FORCE_WINDOW_OPEN override is allowed in the current environment.
 * Returns true only when all safety conditions are met.
 */
function isForceWindowAllowed(): boolean {
  const flag = process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
  if (flag !== 'true') return false;

  const nodeEnv = process.env.NODE_ENV ?? '';
  if (nodeEnv === 'production' || nodeEnv === 'staging') return false;
  if (nodeEnv !== 'test' && nodeEnv !== 'development') return false;

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl) return false;

  try {
    const parsed = new URL(dbUrl);
    const hostname = parsed.hostname;

    // Must be local
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
    if (!isLocal) return false;

    // Must not be RDS
    if (/rds\.amazonaws\.com/i.test(hostname)) return false;

    // Database name must contain test or dev
    const dbName = parsed.pathname?.slice(1) ?? '';
    if (!dbName || !/(test|dev)/i.test(dbName)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if the current date (in São Paulo timezone) is within the request window.
 *
 * The ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN override is only honored in safe
 * test/development environments. In all other environments, only the real
 * calendar rule (October 1 – December 31) applies.
 */
export function isWithinRequestWindow(now?: Date): boolean {
  if (isForceWindowAllowed()) {
    return true;
  }
  const date = now ?? new Date();
  const spDate = new Date(date.toLocaleString('en-US', { timeZone: SAO_PAULO_TZ }));
  const month = spDate.getMonth() + 1; // getMonth() is 0-based
  return month >= WINDOW_START_MONTH && month <= WINDOW_END_MONTH;
}

/**
 * Returns the current date in São Paulo timezone as a structured object.
 */
export function getSaoPauloDate(now?: Date): { year: number; month: number; day: number } {
  const date = now ?? new Date();
  const spStr = date.toLocaleString('en-US', { timeZone: SAO_PAULO_TZ });
  const spDate = new Date(spStr);
  return {
    year: spDate.getFullYear(),
    month: spDate.getMonth() + 1,
    day: spDate.getDate(),
  };
}

/**
 * Returns info about the request window for display purposes.
 */
export function getWindowInfo(now?: Date): {
  isOpen: boolean;
  currentMonth: number;
  currentYear: number;
  nextOpenDate: string | null;
  windowCloseDate: string | null;
} {
  const sp = getSaoPauloDate(now);
  const isOpen = sp.month >= WINDOW_START_MONTH && sp.month <= WINDOW_END_MONTH;

  let nextOpenDate: string | null = null;
  let windowCloseDate: string | null = null;

  if (!isOpen) {
    const nextYear = sp.month > WINDOW_END_MONTH ? sp.year + 1 : sp.year;
    nextOpenDate = `${nextYear}-10-01`;
  } else {
    windowCloseDate = `${sp.year}-12-31`;
  }

  return {
    isOpen,
    currentMonth: sp.month,
    currentYear: sp.year,
    nextOpenDate,
    windowCloseDate,
  };
}
