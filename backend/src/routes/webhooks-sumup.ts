import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { SumUpError } from '../services/sumup-service';
import {
  reconcilePendingSumUpRecharges,
  reconcileSumUpRechargeByExternalId,
  reconcileSumUpRechargeById,
} from '../services/wallet-v2/sumup-recharge.service';

const router = Router();

function readToken(req: Request): string {
  const bearer = String(req.headers.authorization || '');
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
  return String(req.headers['x-sumup-token'] || req.headers['x-reconcile-token'] || '');
}

// Native SumUp checkout callback. This is NOT the token-protected internal endpoint.
// SumUp sends { event_type: 'CHECKOUT_STATUS_CHANGED', id: '<checkout-id>' }.
// The payload is untrusted: only a fresh authenticated GET to SumUp can credit the wallet.
// A durable pending recharge + the reconciliation scheduler recover process interruptions.
const nativeCallbackLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/sumup/callback', nativeCallbackLimiter, (req: Request, res: Response) => {
  if (!process.env.SUMUP_CHECKOUT_CALLBACK_URL?.trim()) {
    return res.sendStatus(503);
  }

  if (req.body?.event_type !== 'CHECKOUT_STATUS_CHANGED') {
    // Unknown events are explicitly ignored per SumUp's webhook guidance.
    return res.status(204).end();
  }

  const checkoutId = req.body?.id;
  if (typeof checkoutId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(checkoutId)) {
    return res.sendStatus(400);
  }

  // Acknowledge promptly. Retryable pending recharges are also scanned by the
  // scheduler; the POST body/status is NEVER taken as evidence of a payment.
  res.status(204).end();
  void reconcileSumUpRechargeByExternalId(checkoutId)
    .then((result) => {
      if (result.final_status === 'not_found') {
        console.warn('[SUMUP_CALLBACK] Unrecognized checkout notification');
      }
    })
    .catch((err: unknown) => {
      console.error('[SUMUP_CALLBACK] Reconciliation deferred to scheduler:', err instanceof SumUpError
        ? err.safeMessage : 'internal_error');
    });
});

// POST /api/webhooks/sumup
// Legacy/internal token-protected notification (not the native return_url).
router.post('/sumup', async (req: Request, res: Response) => {
  const expected = process.env.SUMUP_WEBHOOK_TOKEN || '';
  if (!expected) {
    return res.status(503).json({ success: false, error: 'Webhook SumUp desabilitado.' });
  }

  const incoming = readToken(req);
  if (!incoming || incoming !== expected) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }

  const checkoutId = String(
    req.body?.checkout_id || req.body?.id || req.body?.checkout?.id || req.body?.data?.id || ''
  ).trim();

  if (!checkoutId) {
    return res.status(400).json({ success: false, error: 'checkout_id obrigatório no payload.' });
  }

  try {
    const result = await reconcileSumUpRechargeByExternalId(checkoutId);
    return res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof SumUpError) {
      return res.status(502).json({ success: false, error: 'Não foi possível verificar pagamento na SumUp.' });
    }
    console.error('[SUMUP_WEBHOOK] Error:', (err as Error).message);
    return res.status(500).json({ success: false, error: 'Erro ao processar webhook SumUp.' });
  }
});

// POST /api/webhooks/sumup/reconcile
// Endpoint interno para reconciliação segura de recargas pendentes.
router.post('/sumup/reconcile', async (req: Request, res: Response) => {
  const expected = process.env.SUMUP_RECONCILE_TOKEN || '';
  if (!expected) {
    return res.status(503).json({ success: false, error: 'Reconciliação SumUp desabilitada.' });
  }

  const incoming = readToken(req);
  if (!incoming || incoming !== expected) {
    return res.status(401).json({ success: false, error: 'Não autorizado.' });
  }

  const rechargeId = typeof req.body?.recharge_id === 'string' ? req.body.recharge_id.trim() : '';
  const limit = Number(req.body?.limit || 50);
  const minAgeMinutes = Number(req.body?.min_age_minutes || 1);

  try {
    if (rechargeId) {
      const result = await reconcileSumUpRechargeById(rechargeId);
      return res.json({
        success: true,
        data: {
          mode: 'single',
          result,
        },
      });
    }

    const batch = await reconcilePendingSumUpRecharges(limit, minAgeMinutes);
    return res.json({ success: true, data: { mode: 'batch', ...batch } });
  } catch (err) {
    if (err instanceof SumUpError) {
      return res.status(502).json({ success: false, error: 'Não foi possível consultar a SumUp na reconciliação.' });
    }
    console.error('[SUMUP_RECONCILE] Error:', (err as Error).message);
    return res.status(500).json({ success: false, error: 'Erro ao executar reconciliação SumUp.' });
  }
});

export default router;
