import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authenticateDriver } from '../middlewares/auth';
import { getWindowInfo } from '../services/finance/annual-incentive-payout/request-window';

const router = Router();
router.use(authenticateDriver);

/**
 * GET /api/v2/drivers/me/family-return
 *
 * Endpoint canônico consumido pelo app para exibir a Gratificação Anual KAVIAR.
 * Lê exclusivamente do annual_incentive_ledger (fonte oficial).
 * Não consulta family_return_accruals nem driver_credit_purchases.
 *
 * Compatibilidade: mantém o mesmo contrato que o app já consome.
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
          accrued_cents: 0,
          message: 'Programa não ativo no momento.',
        },
      });
    }

    const programYear = new Date().getFullYear();

    // Sum ACCRUAL minus REVERSAL from the official ledger
    const result = await pool.query(
      `SELECT COALESCE(SUM(
        CASE WHEN event_type = 'ACCRUAL' THEN amount_cents
             WHEN event_type = 'REVERSAL' THEN -amount_cents
             ELSE 0 END
      ), 0)::bigint AS total
       FROM annual_incentive_ledger
       WHERE driver_id = $1 AND program_year = $2`,
      [driverId, programYear]
    );
    const accruedCents = Number(result.rows[0].total);

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
        accrued_cents: accruedCents,
        available_for_request: availableForRequest,
        request_start: requestStart,
        request_end: requestEnd,
        policy_version: 'BONUS-POLICY-v1.3',
        message: 'Sua gratificação é acumulada após a conclusão e liquidação de operações elegíveis.',
      },
    });
  } catch (err) {
    console.error('[family-return] GET error:', (err as Error).message);
    res.status(500).json({ success: false, error: 'Erro ao consultar gratificação anual' });
  }
});

export default router;
