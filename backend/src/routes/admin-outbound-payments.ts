/**
 * Admin Outbound Payments Routes.
 *
 * RBAC: SUPER_ADMIN, FINANCE
 * NO mark-as-paid, manual PAYMENT, or manual provider success.
 */

import { Router, Request, Response } from 'express';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { pool } from '../db';
import { createOutboundPaymentProvider } from '../services/finance/outbound-payments/providers';
import { calculateTreasuryHealth } from '../services/finance/outbound-payments/treasury';
import { runOutboundReconciliation } from '../services/finance/outbound-payments/reconciliation';
import { AnnualIncentiveLedgerService } from '../services/finance/annual-incentive-ledger.service';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

// GET /payees
router.get('/payees', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const { rows } = await pool.query(
      `SELECT id, payee_type, cpf_cnpj_masked, document_type, status, verification_status, created_at
       FROM financial_payees ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]
    );
    res.json({ success: true, data: rows });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// POST /payees
router.post('/payees', async (req: Request, res: Response) => {
  try {
    const { payeeType, legalNameEncrypted, cpfCnpjEncrypted, cpfCnpjHmac, cpfCnpjMasked, documentType, referenceId } = req.body;
    if (!payeeType || !cpfCnpjHmac || !documentType) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const { rows: [payee] } = await pool.query(
      `INSERT INTO financial_payees (payee_type, reference_id, legal_name_encrypted, cpf_cnpj_encrypted, cpf_cnpj_hmac, cpf_cnpj_masked, document_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING_VERIFICATION') RETURNING id, payee_type, cpf_cnpj_masked, status, created_at`,
      [payeeType, referenceId ?? null, legalNameEncrypted, cpfCnpjEncrypted, cpfCnpjHmac, cpfCnpjMasked, documentType]
    );
    // Audit
    await pool.query(
      `INSERT INTO financial_payment_audit (entity_type, entity_id, action, admin_id, details_safe)
       VALUES ('PAYEE', $1, 'CREATE', $2, $3)`,
      [payee.id, (req as any).admin?.id ?? null, JSON.stringify({ payeeType })]
    );
    res.status(201).json({ success: true, data: payee });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// GET /payees/:id
router.get('/payees/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, payee_type, cpf_cnpj_masked, document_type, status, verification_status, risk_status, reference_id, created_at, updated_at
       FROM financial_payees WHERE id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    res.json({ success: true, data: rows[0] });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// GET /obligations
router.get('/obligations', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const purpose = req.query.purpose as string | undefined;
    const status = req.query.status as string | undefined;
    const legalEntityId = req.query.legal_entity_id as string | undefined;
    const businessUnitId = req.query.business_unit_id as string | undefined;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;
    if (purpose) { where += ` AND o.purpose = $${idx++}`; params.push(purpose); }
    if (status) { where += ` AND o.status = $${idx++}`; params.push(status); }
    if (legalEntityId) { where += ` AND o.legal_entity_id = $${idx++}`; params.push(legalEntityId); }
    if (businessUnitId) { where += ` AND o.business_unit_id = $${idx++}`; params.push(businessUnitId); }

    const { rows } = await pool.query(
      `SELECT o.id, o.payee_id, o.purpose, o.description_safe, o.net_amount_cents, o.due_date, o.status,
              o.failure_code, o.created_at, o.legal_entity_id, o.business_unit_id,
              le.razao_social AS legal_entity_razao_social, le.nome_fantasia AS legal_entity_nome_fantasia,
              le.cnpj AS legal_entity_cnpj, bu.code AS business_unit_code, bu.name AS business_unit_name
       FROM financial_obligations o
       LEFT JOIN legal_entities le ON le.id = o.legal_entity_id
       LEFT JOIN financial_business_units bu ON bu.id = o.business_unit_id
       ${where}
       ORDER BY o.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, net_amount_cents: r.net_amount_cents.toString() })) });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// POST /obligations (admin-created obligations)
router.post('/obligations', async (req: Request, res: Response) => {
  try {
    const {
      payeeId, purpose, descriptionSafe, grossAmountCents, discountAmountCents, dueDate,
      competenceDate, documentReference, idempotencyKey, legalEntityId, businessUnitId,
    } = req.body;
    if (!payeeId || !purpose || !grossAmountCents || !idempotencyKey || !legalEntityId || !businessUnitId) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const [{ rows: entities }, { rows: units }] = await Promise.all([
      pool.query('SELECT id FROM legal_entities WHERE id = $1 AND is_active = true', [legalEntityId]),
      pool.query('SELECT id FROM financial_business_units WHERE id = $1 AND is_active = true', [businessUnitId]),
    ]);
    if (!entities.length) return res.status(404).json({ success: false, error: 'LEGAL_ENTITY_NOT_FOUND_OR_INACTIVE' });
    if (!units.length) return res.status(404).json({ success: false, error: 'BUSINESS_UNIT_NOT_FOUND_OR_INACTIVE' });

    const gross = BigInt(grossAmountCents);
    const discount = BigInt(discountAmountCents ?? '0');
    const net = gross - discount;
    if (net <= 0n) return res.status(400).json({ success: false, error: 'Net amount must be positive' });

    const { rows: [obl] } = await pool.query(
      `INSERT INTO financial_obligations (
         payee_id, purpose, source_type, legal_entity_id, business_unit_id, description_safe,
         gross_amount_cents, discount_amount_cents, net_amount_cents, due_date, competence_date,
         document_reference, idempotency_key, created_by_system, created_by_admin_id, status
       )
       VALUES ($1, $2, 'ADMIN_CREATED', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, $13, 'BLOCKED_POLICY_REVIEW')
       RETURNING id, status, legal_entity_id, business_unit_id, created_at`,
      [
        payeeId, purpose, legalEntityId, businessUnitId, descriptionSafe ?? '', gross.toString(),
        discount.toString(), net.toString(), dueDate ?? null, competenceDate ?? null,
        documentReference ?? null, idempotencyKey, (req as any).admin?.id ?? null,
      ]
    );
    await pool.query(
      `INSERT INTO financial_payment_audit (entity_type, entity_id, action, admin_id, details_safe)
       VALUES ('OBLIGATION', $1, 'CREATE', $2, $3)`,
      [obl.id, (req as any).admin?.id ?? null, JSON.stringify({ purpose, grossAmountCents, legalEntityId, businessUnitId })]
    );
    res.status(201).json({ success: true, data: obl });
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'IDEMPOTENCY_CONFLICT' });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /obligations/:id
router.get('/obligations/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM financial_obligations WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    const r = rows[0];
    res.json({ success: true, data: { ...r, gross_amount_cents: r.gross_amount_cents.toString(), net_amount_cents: r.net_amount_cents.toString(), discount_amount_cents: r.discount_amount_cents.toString() } });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// GET /payouts
router.get('/payouts', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const legalEntityId = req.query.legal_entity_id as string | undefined;
    const businessUnitId = req.query.business_unit_id as string | undefined;

    const params: any[] = [];
    let idx = 1;
    let where = 'WHERE 1=1';
    if (legalEntityId) { where += ` AND o.legal_entity_id = $${idx++}`; params.push(legalEntityId); }
    if (businessUnitId) { where += ` AND o.business_unit_id = $${idx++}`; params.push(businessUnitId); }

    const { rows } = await pool.query(
      `SELECT p.id, p.obligation_id, p.payee_id, p.amount_cents, p.instrument, p.provider_name,
              p.status, p.external_reference, p.submitted_at, p.confirmed_at, p.failed_at, p.created_at,
              o.legal_entity_id, o.business_unit_id,
              le.razao_social AS legal_entity_razao_social, le.nome_fantasia AS legal_entity_nome_fantasia,
              le.cnpj AS legal_entity_cnpj, bu.code AS business_unit_code, bu.name AS business_unit_name
       FROM financial_payouts p
       JOIN financial_obligations o ON o.id = p.obligation_id
       LEFT JOIN legal_entities le ON le.id = o.legal_entity_id
       LEFT JOIN financial_business_units bu ON bu.id = o.business_unit_id
       ${where}
       ORDER BY p.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, amount_cents: r.amount_cents.toString() })) });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// GET /payouts/:id
router.get('/payouts/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM financial_payouts WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    const { rows: attempts } = await pool.query('SELECT * FROM financial_payout_attempts WHERE payout_id = $1 ORDER BY attempt_number', [req.params.id]);
    res.json({ success: true, data: { ...rows[0], amount_cents: rows[0].amount_cents.toString(), attempts } });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// GET /treasury/health
router.get('/treasury/health', async (_req: Request, res: Response) => {
  try {
    const provider = createOutboundPaymentProvider();
    const health = await calculateTreasuryHealth(pool, provider);
    res.json({
      success: true, data: {
        providerBalanceCents: health.providerBalanceCents?.toString() ?? null,
        approvedObligationsCents: health.approvedObligationsCents.toString(),
        reservedObligationsCents: health.reservedObligationsCents.toString(),
        inTransitCents: health.inTransitCents.toString(),
        dueNext7DaysCents: health.dueNext7DaysCents.toString(),
        dueNext30DaysCents: health.dueNext30DaysCents.toString(),
        bufferCents: health.bufferCents?.toString() ?? null,
        deficitCents: health.deficitCents?.toString() ?? null,
        accountOwnershipConfirmed: health.accountOwnershipConfirmed,
        providerAvailable: health.providerAvailable,
      },
    });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// GET /provider-health
router.get('/provider-health', async (_req: Request, res: Response) => {
  try {
    const provider = createOutboundPaymentProvider();
    const avail = await provider.validateAvailability();
    res.json({ success: true, data: { available: avail.available, reason: avail.reason, provider: provider.providerName } });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

// POST /reconciliation/run
router.post('/reconciliation/run', async (req: Request, res: Response) => {
  try {
    const provider = createOutboundPaymentProvider();
    const ledger = new AnnualIncentiveLedgerService(pool);
    const report = await runOutboundReconciliation({ pool, provider, eventProcessorDeps: { pool, ledgerService: ledger } });
    await pool.query(
      `INSERT INTO financial_payment_audit (entity_type, entity_id, action, admin_id, details_safe)
       VALUES ('RECONCILIATION', 'manual_run', 'RUN_RECONCILIATION', $1, $2)`,
      [(req as any).admin?.id ?? null, JSON.stringify(report)]
    );
    res.json({ success: true, data: report });
  } catch (err: any) { res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
});

export default router;
