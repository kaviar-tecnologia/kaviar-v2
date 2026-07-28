/**
 * Annual Incentive Request Window validation.
 *
 * Rules:
 * - Requests allowed from October 1 to December 31 (inclusive)
 * - Timezone: America/Sao_Paulo
 * - Saldo não solicitado não expira
 * - Saldo permanece associado ao ano de aquisição
 */

const SAO_PAULO_TZ = 'America/Sao_Paulo';
const WINDOW_START_MONTH = 10; // October
const WINDOW_END_MONTH = 12;   // December

/**
 * Checks if the current date (in São Paulo timezone) is within the request window.
 * In test environments, can be overridden with ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN=true
 */
export function isWithinRequestWindow(now?: Date): boolean {
  if (process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN === 'true') {
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
    // Next window starts October 1 of current year (or next year if past December)
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
