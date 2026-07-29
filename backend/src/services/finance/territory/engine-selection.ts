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
 */

export type ManagerPayoutEngine = 'disabled' | 'legacy' | 'outbound';

const VALID_ENGINES: readonly ManagerPayoutEngine[] = ['disabled', 'legacy', 'outbound'];

export function getManagerPayoutEngine(): ManagerPayoutEngine {
  const value = process.env.MANAGER_PAYOUT_ENGINE ?? '';
  if (VALID_ENGINES.includes(value as ManagerPayoutEngine)) {
    return value as ManagerPayoutEngine;
  }
  return 'disabled';
}

/**
 * Returns the cutover month (YYYY-MM format).
 * Returns null if not configured or invalid.
 */
export function getManagerPayoutCutoverMonth(): string | null {
  const value = process.env.MANAGER_PAYOUT_CUTOVER_MONTH ?? '';
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  return null;
}

/**
 * Determines if a reference_month should use the outbound engine.
 */
export function isMonthOutbound(referenceMonth: string): boolean {
  const engine = getManagerPayoutEngine();
  if (engine !== 'outbound') return false;

  const cutover = getManagerPayoutCutoverMonth();
  if (!cutover) return false;

  return referenceMonth >= cutover;
}

/**
 * Determines if a reference_month is legacy (before cutover).
 */
export function isMonthLegacy(referenceMonth: string): boolean {
  const engine = getManagerPayoutEngine();
  if (engine === 'legacy') return true;
  if (engine !== 'outbound') return false;

  const cutover = getManagerPayoutCutoverMonth();
  if (!cutover) return true; // no cutover = cannot use outbound

  return referenceMonth < cutover;
}

/**
 * Whether legacy /pay endpoint is allowed for a given month.
 */
export function isLegacyPayAllowed(referenceMonth: string): boolean {
  const engine = getManagerPayoutEngine();
  if (engine === 'disabled') return false;
  if (engine === 'outbound') {
    const cutover = getManagerPayoutCutoverMonth();
    if (!cutover) return false;
    return referenceMonth < cutover;
  }
  return engine === 'legacy';
}
