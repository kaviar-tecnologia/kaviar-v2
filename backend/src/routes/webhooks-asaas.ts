/**
 * Asaas Webhooks Route.
 *
 * POST /webhooks/asaas/transfers — Transfer events (Pix/TED)
 * POST /webhooks/asaas/bills — Bill payment events
 *
 * Architecture:
 *   1. Validate token (timing-safe)
 *   2. Normalize event
 *   3. Persist as PENDING in financial_provider_events
 *   4. COMMIT
 *   5. Respond HTTP 200
 *
 * Processing happens asynchronously via the Event Worker (separate scheduler).
 * NO financial operations (PAYMENT, RELEASE, locks, provider calls) happen
 * inside the webhook request.
 */

import { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { pool } from '../db';
import { AsaasOutboundPaymentProvider } from '../services/finance/outbound-payments/providers';

const router = Router();

function verifyWebhookToken(req: Request): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) return false;

  const provided = req.headers['asaas-access-token'] as string
    ?? req.headers['access-token'] as string
    ?? '';

  if (!provided || provided.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

// The Asaas adapter normalizes to a strict allowlist: no bank account, full
// document, Pix key or other nested sensitive payload is persisted.
const provider = new AsaasOutboundPaymentProvider();

// POST /webhooks/asaas/transfers
router.post('/transfers', async (req: Request, res: Response) => {
  if (!verifyWebhookToken(req)) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const event = provider.normalizeWebhook(req.body);

    if (event.eventCategory !== 'TRANSFER') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Persist ONLY — no financial processing
    const { rowCount } = await pool.query(
      `INSERT INTO financial_provider_events
       (provider_name, provider_event_id, event_category, event_type, payload_safe, processing_status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       ON CONFLICT (provider_name, provider_event_id) DO NOTHING`,
      ['asaas', event.providerEventId, event.eventCategory, event.eventType, JSON.stringify(event.raw)]
    );

    const duplicate = (rowCount ?? 0) === 0;
    return res.status(200).json({ ok: true, persisted: !duplicate, duplicate });
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('INVALID_ASAAS_')) {
      return res.status(400).json({ error: 'INVALID_PROVIDER_EVENT' });
    }
    console.error('[ASAAS_WEBHOOK_PERSIST_ERROR] Persistence or processing failure');
    return res.status(503).json({ error: 'PERSISTENCE_FAILURE' });
  }
});

// POST /webhooks/asaas/bills
router.post('/bills', async (req: Request, res: Response) => {
  if (!verifyWebhookToken(req)) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const event = provider.normalizeWebhook(req.body);

    if (event.eventCategory !== 'BILL_PAYMENT') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const { rowCount } = await pool.query(
      `INSERT INTO financial_provider_events
       (provider_name, provider_event_id, event_category, event_type, payload_safe, processing_status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       ON CONFLICT (provider_name, provider_event_id) DO NOTHING`,
      ['asaas', event.providerEventId, event.eventCategory, event.eventType, JSON.stringify(event.raw)]
    );

    const duplicate = (rowCount ?? 0) === 0;
    return res.status(200).json({ ok: true, persisted: !duplicate, duplicate });
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.startsWith('INVALID_ASAAS_')) {
      return res.status(400).json({ error: 'INVALID_PROVIDER_EVENT' });
    }
    console.error('[ASAAS_BILL_WEBHOOK_PERSIST_ERROR] Persistence or processing failure');
    return res.status(503).json({ error: 'PERSISTENCE_FAILURE' });
  }
});

export default router;
