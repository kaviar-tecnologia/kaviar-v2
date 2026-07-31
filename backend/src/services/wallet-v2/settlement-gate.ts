/**
 * Settlement Maintenance Gate.
 *
 * When SETTLEMENT_PAUSED=true, all financial write operations that touch
 * ride_fee_splits or territory_ledger are blocked. This ensures a safe
 * window for backfill migrations without concurrent writes.
 *
 * Points of enforcement:
 * - WalletSettlementService.settleRide()
 * - PendingDebitService.resolveOnRecharge()
 * - Any scheduler or route that triggers fee collection
 */

export class SettlementPausedError extends Error {
  readonly code = 'SETTLEMENT_PAUSED';
  readonly statusCode = 503;

  constructor() {
    super('Settlement operations are paused for maintenance. Retry after maintenance window.');
    this.name = 'SettlementPausedError';
  }
}

/**
 * Reads SETTLEMENT_PAUSED from process.env at call time.
 * Note: changing SSM/env vars does NOT affect a running ECS task
 * unless the task is restarted. This is intentional — the gate
 * requires a container restart to activate/deactivate.
 */
export function isSettlementPaused(): boolean {
  return process.env.SETTLEMENT_PAUSED === 'true';
}

/**
 * Throws SettlementPausedError if settlement is paused.
 * Must be called before any financial write operation.
 */
export function assertSettlementActive(): void {
  if (isSettlementPaused()) {
    throw new SettlementPausedError();
  }
}
