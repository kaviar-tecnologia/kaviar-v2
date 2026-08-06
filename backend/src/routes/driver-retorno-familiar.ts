/**
 * Driver Retorno Familiar KAVIAR — DESATIVADO
 *
 * Este fluxo calculava gratificação sobre driver_credit_purchases (recargas).
 * Substituído pela política BONUS-POLICY-v1.3 que usa o annual_incentive_ledger.
 * O endpoint é mantido para não quebrar versões antigas do app, mas retorna
 * available: false com mensagem de migração.
 *
 * Fluxo canônico: GET /api/v2/drivers/me/family-return (lê do ledger oficial)
 * Sistema completo: /api/driver/annual-incentive/*
 */

import { Router, Request, Response } from 'express';
import { authenticateDriver } from '../middlewares/auth';

const router = Router();
router.use(authenticateDriver);

const MIGRATION_MESSAGE = 'Este programa foi substituído pela Gratificação Anual KAVIAR. Consulte a tela de saldo para ver seu valor acumulado.';

// GET /api/v2/drivers/me/retorno-familiar — desativado
router.get('/', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      available: false,
      message: MIGRATION_MESSAGE,
      disclaimer: 'A Gratificação Anual de Incentivo KAVIAR é financiada integralmente pela KAVIAR e não constitui salário, comissão, 13º ou vínculo empregatício.',
    },
  });
});

// POST /api/v2/drivers/me/retorno-familiar/request — desativado
router.post('/request', async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'Este fluxo de solicitação foi substituído. Utilize a Gratificação Anual KAVIAR.',
  });
});

export default router;
