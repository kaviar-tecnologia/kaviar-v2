/**
 * Manager Payout Engine Selection.
 *
 * MANAGER_PAYOUT_ENGINE controls which path is used:
 *   "disabled" — no cycles or payouts created
 *   "legacy"   — uses territory_payouts (manual mark-as-paid)
 *   "outbound" — uses territory_payout_cycles → financial_obligations
 *
 * MANAGER_PAYOUT_CUTOVER_MONTH defines the boundary:
 *   Months before cutover: legacy only
 *   Months at or after cutover: outbound only
 *
 * Fail-closed: invalid or missing configuration blocks all paths.
 */

export type ManagerPayoutEngine = 'disabled' | 'legacy' | 'outbound';

const VALID_ENGINES: readonly ManagerPayoutEngine[] = ['disabled', 'legacy', 'outbound'];
const REFERENCE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidReferenceMonth(value: string): boolean {
  return REFERENCE_MONTH_PATTERN.test(value);
}

export function getManagerPayoutEngine(): ManagerPayoutEngine {
  const value = process.env.MANAGER_PAYOUT_ENGINE ?? '';
  if (VALID_ENGINES.includes(value as ManagerPayoutEngine)) {
    return value as ManagerPayoutEngine;
  }
  return 'disabled';
}

export function getManagerPayoutCutoverMonth(): string | null {
  const value = process.env.MANAGER_PAYOUT_CUTOVER_MONTH ?? '';
  if (isValidReferenceMonth(value)) return value;
  return null;
}

/**
 * Determines if a reference_month should use the outbound engine.
 * Fail-closed: returns false if config is invalid or missing.
 */
export function isMonthOutbound(referenceMonth: string): boolean {
  if (!isValidReferenceMonth(referenceMonth)) return false;
  const engine = getManagerPayoutEngine();
  if (engine !== 'outbound') return false;
  const cutover = getManagerPayoutCutoverMonth();
  if (!cutover) return false; // outbound without cutover = fail closed
  return referenceMonth >= cutover;
}

/**
 * Determines if a reference_month is legacy (before cutover).
 * Fail-closed: returns false if outbound without cutover.
 */
export function isMonthLegacy(referenceMonth: string): boolean {
  if (!isValidReferenceMonth(referenceMonth)) return false;
  const engine = getManagerPayoutEngine();
  if (engine === 'legacy') return true;
  if (engine !== 'outbound') return false;
  const cutover = getManagerPayoutCutoverMonth();
  if (!cutover) return false; // fail closed
  return referenceMonth < cutover;
}

/**
 * Whether legacy /pay endpoint is allowed for a given month.
 */
export function isLegacyPayAllowed(referenceMonth: string): boolean {
  if (!isValidReferenceMonth(referenceMonth)) return false;
  const engine = getManagerPayoutEngine();
  if (engine === 'disabled') return false;
  if (engine === 'outbound') {
    const cutover = getManagerPayoutCutoverMonth();
    if (!cutover) return false;
    return referenceMonth < cutover;
  }
  return engine === 'legacy';
}
