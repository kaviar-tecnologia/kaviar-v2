import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authenticateDriver } from '../middlewares/auth';
import { getWindowInfo } from '../services/finance/annual-incentive-payout/request-window';
import { projectBalance } from '../services/finance/annual-incentive-payout/balance-projection';

const router = Router();
router.use(authenticateDriver);

/**
 * GET /api/v2/drivers/me/family-return
 *
 * Endpoint canônico consumido pelo app para exibir a Gratificação Anual KAVIAR.
 * Usa projectBalance() como única projeção financeira.
 * Não consulta family_return_accruals nem driver_credit_purchases.
 * Não possui SQL financeiro duplicado.
 *
 * Valores monetários retornados como strings (bigint safety).
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;

    // Check if annual incentive system is active
    const flag = await pool.query(
      "SELECT enabled FROM feature_flags WHERE key = 'ANNUAL_INCENTIVE_SHADOW_ENABLED' LIMIT 1"
    );
    const enabled = flag.rows[0]?.enabled === true;

    if (!enabled) {
      return res.json({
        success: true,
        data: {
          enabled: false,
          available_cents: '0',
          accrued_cents: '0',
          reserved_cents: '0',
          paid_cents: '0',
          reversed_cents: '0',
          message: 'Programa não ativo no momento.',
        },
      });
    }

    // Canonical balance projection (handles all event types, all years, carry-over)
    const balance = await projectBalance(pool, driverId);

    // Request window info from the payout system
    const windowInfo = getWindowInfo();
    const availableForRequest = windowInfo.isOpen;

    // Derive start/end for the app's contract
    const currentYear = windowInfo.currentYear;
    const requestStart = windowInfo.isOpen ? `${currentYear}-10-01` : (windowInfo.nextOpenDate || null);
    const requestEnd = windowInfo.isOpen ? (windowInfo.windowCloseDate || `${currentYear}-12-31`) : null;

    res.json({
      success: true,
      data: {
        enabled: true,
        available_cents: balance.totalAvailableCents.toString(),
        accrued_cents: balance.totalAccruedCents.toString(),
        reserved_cents: balance.totalOpenReservedCents.toString(),
        paid_cents: balance.totalPaidCents.toString(),
        reversed_cents: balance.totalReversedCents.toString(),
        available_for_request: availableForRequest,
        request_start: requestStart,
        request_end: requestEnd,
        message: 'Sua gratificação é acumulada após a conclusão e liquidação de operações elegíveis.',
      },
    });
  } catch (err) {
    console.error('[family-return] GET error:', (err as Error).message);
    res.status(500).json({ success: false, error: 'Erro ao consultar gratificação anual' });
  }
});

export default router;
