/**
 * Admin Manager Cycles Routes (Marco 3.2A).
 *
 * RBAC: SUPER_ADMIN, FINANCE
 * NO mark-as-paid, manual payment, or PAID status.
 */

import { Router, Request, Response } from 'express';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { pool } from '../db';
import {
  previewCycle,
  confirmRegularCycle,
  confirmSupplementalCycle,
  submitForReview,
  approveCycle,
  cancelCycle,
  getCycleById,
  TerritoryPayoutCycle,
} from '../services/finance/territory/cycle.service';
import { getManagerPayoutEngine, assertOutboundEngine } from '../services/finance/territory/engine-selection';
import { createObligationFromCycle } from '../services/finance/territory/obligation-bridge.service';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

function serializeCycle(c: TerritoryPayoutCycle) {
  return {
    ...c,
    grossPlatformFeeCents: c.grossPlatformFeeCents.toString(),
    grossManagerCommissionCents: c.grossManagerCommissionCents.toString(),
    approvedAdjustmentsCents: c.approvedAdjustmentsCents.toString(),
    approvedAmountCents: c.approvedAmountCents.toString(),
  };
}

// GET /manager-cycles (read-only — works even with MANAGER_PAYOUT_ENGINE=disabled)
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;
    if (req.query.territoryId) { where += ` AND c.territory_id=$${idx++}`; params.push(req.query.territoryId); }
    if (req.query.managerId) { where += ` AND c.manager_id=$${idx++}`; params.push(req.query.managerId); }
    if (req.query.status) { where += ` AND c.status=$${idx++}`; params.push(req.query.status); }
    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT c.*,
              a.name AS manager_name,
              payee_info.cpf_cnpj_masked AS manager_cpf_cnpj_masked,
              payee_info.key_masked AS manager_pix_masked,
              obl.obligation_id
       FROM territory_payout_cycles c
       LEFT JOIN admins a ON a.id = c.manager_id
       LEFT JOIN LATERAL (
         SELECT fp.cpf_cnpj_masked, fpd.key_masked
         FROM financial_payees fp
         LEFT JOIN financial_payee_destinations fpd
           ON fpd.payee_id = fp.id AND fpd.status = 'active' AND fpd.superseded_at IS NULL
         WHERE fp.reference_id = c.manager_id AND fp.payee_type = 'MANAGER'
         ORDER BY
           CASE fp.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
           fp.created_at DESC, fp.id DESC
         LIMIT 1
       ) payee_info ON true
       LEFT JOIN LATERAL (
         SELECT fo.id AS obligation_id
         FROM financial_obligations fo
         WHERE fo.source_type = 'territory_payout_cycle' AND fo.source_id = c.id
         ORDER BY fo.created_at DESC, fo.id DESC
         LIMIT 1
       ) obl ON true
       ${where}
       ORDER BY c.reference_month DESC, c.created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params);

    // Fetch payment evidence for cycles that have obligations
    const obligationIds = rows.filter((r: any) => r.obligation_id).map((r: any) => r.obligation_id);
    let payoutMap = new Map<string, any>();
    if (obligationIds.length > 0) {
      const { rows: payoutRows } = await pool.query(
        `SELECT DISTINCT ON (obligation_id) obligation_id, amount_cents::text AS amount_cents,
                provider_payout_id, external_reference,
                provider_status, status, confirmed_at, submitted_at, failed_at
         FROM financial_payouts
         WHERE obligation_id = ANY($1)
         ORDER BY obligation_id, created_at DESC, id DESC`, [obligationIds]);
      payoutMap = new Map(payoutRows.map((p: any) => [p.obligation_id, p]));
    }

    const result = rows.map((r: any) => {
      const cycle = serializeCycle(mapRow(r));
      const payout = payoutMap.get(r.obligation_id);

      // Determine display status
      let displayStatus: string = cycle.status;
      if (payout?.confirmed_at) displayStatus = 'PAGO';
      else if (payout?.failed_at) displayStatus = 'FALHOU';
      else if (payout?.submitted_at) displayStatus = 'PROCESSANDO';
      else if (cycle.status === 'OBLIGATION_CREATED') displayStatus = 'RESERVADO';
      else if (cycle.status === 'APPROVED') displayStatus = 'APROVADO';
      else if (cycle.status === 'UNDER_REVIEW') displayStatus = 'EM_REVISÃO';
      else if (cycle.status === 'CALCULATED') displayStatus = 'CALCULADO';
      else if (cycle.status === 'CANCELLED') displayStatus = 'CANCELADO';

      return {
        ...cycle,
        type: 'GESTOR',
        managerName: r.manager_name || '—',
        managerCpfCnpjMasked: r.manager_cpf_cnpj_masked || null,
        managerPixMasked: r.manager_pix_masked || null,
        displayStatus,
        confirmedAt: payout?.confirmed_at || null,
        evidence: payout ? {
          amount_cents: payout.amount_cents,
          provider_payout_id: payout.provider_payout_id,
          external_reference: payout.external_reference,
          provider_status: payout.provider_status,
          internal_status: payout.status,
          submitted_at: payout.submitted_at,
          confirmed_at: payout.confirmed_at,
          failed_at: payout.failed_at,
        } : null,
      };
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /manager-cycles/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const cycle = await getCycleById(pool, req.params.id);
    if (!cycle) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    res.json({ success: true, data: serializeCycle(cycle) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/preview
router.post('/preview', async (req: Request, res: Response) => {
  try {
    if (getManagerPayoutEngine() === 'disabled') {
      return res.status(409).json({ success: false, error: 'MANAGER_PAYOUT_ENGINE_DISABLED' });
    }
    const { territoryId, referenceMonth, managerId } = req.body;
    if (!territoryId || !referenceMonth) return res.status(400).json({ success: false, error: 'territoryId and referenceMonth required' });
    const preview = await previewCycle(pool, territoryId, referenceMonth, managerId ?? null);
    res.json({
      success: true,
      data: {
        ...preview,
        grossPlatformFeeCents: preview.grossPlatformFeeCents.toString(),
        grossManagerCommissionCents: preview.grossManagerCommissionCents.toString(),
        approvedAmountCents: preview.approvedAmountCents.toString(),
      },
    });
  } catch (err: any) {
    if (err.code?.startsWith('TERRITORY_CYCLE_')) return res.status(400).json({ success: false, error: err.code, message: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/confirm
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const { territoryId, referenceMonth, managerId } = req.body;
    if (!territoryId || !referenceMonth) return res.status(400).json({ success: false, error: 'territoryId and referenceMonth required' });
    const cycle = await confirmRegularCycle(pool, territoryId, referenceMonth, managerId ?? null);
    res.status(201).json({ success: true, data: serializeCycle(cycle) });
  } catch (err: any) {
    if (err.code === 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND') return res.status(409).json({ success: false, error: err.code });
    if (err.code?.startsWith('TERRITORY_CYCLE_')) return res.status(409).json({ success: false, error: err.code, message: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/confirm-supplemental
router.post('/confirm-supplemental', async (req: Request, res: Response) => {
  try {
    const { territoryId, referenceMonth, managerId } = req.body;
    if (!territoryId || !referenceMonth || !managerId) return res.status(400).json({ success: false, error: 'territoryId, referenceMonth and managerId required' });
    const cycle = await confirmSupplementalCycle(pool, territoryId, referenceMonth, managerId);
    if (!cycle) return res.json({ success: true, data: null, message: 'No unallocated entries' });
    res.status(201).json({ success: true, data: serializeCycle(cycle) });
  } catch (err: any) {
    if (err.code === 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND') return res.status(409).json({ success: false, error: err.code });
    if (err.code?.startsWith('TERRITORY_CYCLE_')) return res.status(409).json({ success: false, error: err.code, message: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/:id/submit-review
router.post('/:id/submit-review', async (req: Request, res: Response) => {
  try {
    const cycle = await submitForReview(pool, req.params.id);
    res.json({ success: true, data: { id: cycle.id, status: cycle.status } });
  } catch (err: any) {
    if (err.code === 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND') return res.status(409).json({ success: false, error: err.code });
    if (err.code === 'TERRITORY_CYCLE_INVALID_TRANSITION') return res.status(409).json({ success: false, error: err.code });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/:id/approve
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin?.id ?? 'unknown';
    const cycle = await approveCycle(pool, req.params.id, adminId);
    res.json({ success: true, data: { id: cycle.id, status: cycle.status, approvedAt: cycle.approvedAt, approvedBy: cycle.approvedBy } });
  } catch (err: any) {
    if (err.code === 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND') return res.status(409).json({ success: false, error: err.code });
    if (err.code === 'TERRITORY_CYCLE_INVALID_TRANSITION') return res.status(409).json({ success: false, error: err.code });
    if (err.code === 'TERRITORY_CYCLE_FISCAL_DOCUMENT_NOT_VALIDATED') return res.status(409).json({ success: false, error: err.code });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/:id/create-obligation
router.post('/:id/create-obligation', async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin?.id ?? 'unknown';
    const result = await createObligationFromCycle(pool, req.params.id, adminId);
    const status = result.alreadyExists ? 200 : 201;
    res.status(status).json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND') return res.status(409).json({ success: false, error: err.code });
    if (err.code === 'TERRITORY_CYCLE_INVALID_TRANSITION') return res.status(409).json({ success: false, error: err.code, message: err.message });
    if (err.code === 'TERRITORY_CYCLE_NOT_FOUND') return res.status(404).json({ success: false, error: err.code });
    if (err.code === 'TERRITORY_CYCLE_NO_MANAGER') return res.status(400).json({ success: false, error: err.code });
    console.error('[ADMIN_MANAGER_CYCLES_OBLIGATION_ERROR]', err.message);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/:id/cancel
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, error: 'reason required' });
    const adminId = (req as any).admin?.id ?? 'unknown';
    const cycle = await cancelCycle(pool, req.params.id, adminId, reason);
    res.json({ success: true, data: { id: cycle.id, status: cycle.status } });
  } catch (err: any) {
    if (err.code === 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND') return res.status(409).json({ success: false, error: err.code });
    if (err.code === 'TERRITORY_CYCLE_INVALID_TRANSITION') return res.status(409).json({ success: false, error: err.code });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

function mapRow(row: any): TerritoryPayoutCycle {
  return {
    id: row.id, territoryId: row.territory_id, managerId: row.manager_id,
    referenceMonth: row.reference_month, policyVersion: row.policy_version,
    commissionRateBasisPoints: row.commission_rate_basis_points,
    platformFeeRateBasisPoints: row.platform_fee_rate_basis_points,
    cycleType: row.cycle_type, parentCycleId: row.parent_cycle_id, sequenceNumber: row.sequence_number,
    grossPlatformFeeCents: BigInt(row.gross_platform_fee_cents),
    grossManagerCommissionCents: BigInt(row.gross_manager_commission_cents),
    approvedAdjustmentsCents: BigInt(row.approved_adjustments_cents),
    approvedAmountCents: BigInt(row.approved_amount_cents),
    status: row.status, fiscalDocumentRequired: row.fiscal_document_required,
    fiscalDocumentStatus: row.fiscal_document_status, approvedAt: row.approved_at,
    approvedBy: row.approved_by ?? null,
    calculatedAt: row.calculated_at, createdAt: row.created_at,
  };
}

export default router;
