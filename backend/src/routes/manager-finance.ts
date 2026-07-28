/**
 * Manager Finance Routes.
 *
 * GET /payout-destination — current destination (masked)
 * PUT /payout-destination — set/replace destination
 * GET /payouts — manager's payout history
 */

import { Router, Request, Response } from 'express';
import { authenticateAdmin } from '../middlewares/auth';
import { pool } from '../db';
import {
  encryptPayoutSecret,
  hmacPayoutValue,
  maskCpf,
  normalizeCpf,
  isValidCpf,
} from '../services/finance/annual-incentive-payout/crypto';

const router = Router();

// Manager is authenticated as admin with role check
router.use(authenticateAdmin);

// Middleware to extract manager operator profile
router.use(async (req: Request, res: Response, next) => {
  const admin = (req as any).admin;
  if (!admin) return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });

  // Find operator profile linked to this admin
  const { rows } = await pool.query(
    `SELECT op.id, op.document_cpf FROM operator_profiles op WHERE op.admin_id = $1 LIMIT 1`,
    [admin.id]
  );
  (req as any).managerProfile = rows[0] ?? null;
  next();
});

// GET /payout-destination
router.get('/payout-destination', async (req: Request, res: Response) => {
  try {
    const profile = (req as any).managerProfile;
    if (!profile) return res.json({ success: true, data: null });

    // Find payee for this manager
    const { rows: [payee] } = await pool.query(
      `SELECT id FROM financial_payees WHERE reference_id = $1 AND payee_type = 'MANAGER' LIMIT 1`,
      [profile.id]
    );
    if (!payee) return res.json({ success: true, data: null });

    const { rows: [dest] } = await pool.query(
      `SELECT id, method, key_type, key_masked, status, verified_at, created_at
       FROM financial_payee_destinations WHERE payee_id = $1 AND status = 'active' AND superseded_at IS NULL LIMIT 1`,
      [payee.id]
    );
    res.json({ success: true, data: dest ?? null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// PUT /payout-destination
router.put('/payout-destination', async (req: Request, res: Response) => {
  try {
    const profile = (req as any).managerProfile;
    if (!profile) return res.status(400).json({ success: false, error: 'No manager profile found' });

    const { pixKeyCpf, pixKeyCnpj } = req.body;
    const keyValue = pixKeyCpf ?? pixKeyCnpj;
    const method = pixKeyCnpj ? 'PIX_CNPJ' : 'PIX_CPF';
    const keyType = pixKeyCnpj ? 'CNPJ' : 'CPF';

    if (!keyValue) return res.status(400).json({ success: false, error: 'pixKeyCpf or pixKeyCnpj required' });

    const normalized = keyValue.replace(/\D/g, '');
    const encrypted = encryptPayoutSecret(normalized);
    const hmac = hmacPayoutValue(normalized);
    const masked = maskCpf(normalized); // works for both CPF display
    const keyVersion = process.env.ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION ?? '1';

    // Find or create payee
    let payeeId: string;
    const { rows: [existingPayee] } = await pool.query(
      `SELECT id FROM financial_payees WHERE reference_id = $1 AND payee_type = 'MANAGER' LIMIT 1`,
      [profile.id]
    );
    if (existingPayee) {
      payeeId = existingPayee.id;
    } else {
      const { rows: [newPayee] } = await pool.query(
        `INSERT INTO financial_payees (payee_type, reference_id, legal_name_encrypted, cpf_cnpj_encrypted, cpf_cnpj_hmac, cpf_cnpj_masked, document_type, status)
         VALUES ('MANAGER', $1, $2, $3, $4, $5, $6, 'ACTIVE') RETURNING id`,
        [profile.id, encrypted, encrypted, hmac, masked, keyType]
      );
      payeeId = newPayee.id;
    }

    // Supersede existing destination
    await pool.query(
      `UPDATE financial_payee_destinations SET status = 'superseded', superseded_at = NOW(), updated_at = NOW()
       WHERE payee_id = $1 AND status = 'active'`, [payeeId]
    );

    // Cooldown: new destination gets 24h cooldown
    const cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { rows: [dest] } = await pool.query(
      `INSERT INTO financial_payee_destinations (payee_id, method, key_type, key_encrypted, key_hmac, key_masked, encryption_key_version, status, verified_at, cooldown_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), $8) RETURNING id, method, key_type, key_masked, status, created_at`,
      [payeeId, method, keyType, encrypted, hmac, masked, keyVersion, cooldownUntil]
    );

    res.json({ success: true, data: dest });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /payouts
router.get('/payouts', async (req: Request, res: Response) => {
  try {
    const profile = (req as any).managerProfile;
    if (!profile) return res.json({ success: true, data: [] });

    const { rows: [payee] } = await pool.query(
      `SELECT id FROM financial_payees WHERE reference_id = $1 AND payee_type = 'MANAGER' LIMIT 1`,
      [profile.id]
    );
    if (!payee) return res.json({ success: true, data: [] });

    const { rows } = await pool.query(
      `SELECT p.id, p.amount_cents, p.instrument, p.status, p.submitted_at, p.confirmed_at, p.created_at,
              o.purpose, o.description_safe, o.competence_date
       FROM financial_payouts p JOIN financial_obligations o ON o.id = p.obligation_id
       WHERE p.payee_id = $1 ORDER BY p.created_at DESC LIMIT 50`,
      [payee.id]
    );

    res.json({ success: true, data: rows.map(r => ({ ...r, amount_cents: r.amount_cents.toString() })) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
