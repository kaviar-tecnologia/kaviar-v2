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

// GET /manager-cycles
router.get('/', async (req: Request, res: Response) => {
  try {
    if (getManagerPayoutEngine() === 'disabled') {
      return res.status(409).json({ success: false, error: 'MANAGER_PAYOUT_ENGINE_DISABLED' });
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;
    if (req.query.territoryId) { where += ` AND territory_id=$${idx++}`; params.push(req.query.territoryId); }
    if (req.query.managerId) { where += ` AND manager_id=$${idx++}`; params.push(req.query.managerId); }
    if (req.query.status) { where += ` AND status=$${idx++}`; params.push(req.query.status); }
    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT * FROM territory_payout_cycles ${where} ORDER BY reference_month DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params);
    res.json({ success: true, data: rows.map((r: any) => serializeCycle(mapRow(r))) });
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
    if (getManagerPayoutEngine() === 'disabled') {
      return res.status(409).json({ success: false, error: 'MANAGER_PAYOUT_ENGINE_DISABLED' });
    }
    const { territoryId, referenceMonth, managerId } = req.body;
    if (!territoryId || !referenceMonth) return res.status(400).json({ success: false, error: 'territoryId and referenceMonth required' });
    const cycle = await confirmRegularCycle(pool, territoryId, referenceMonth, managerId ?? null);
    res.status(201).json({ success: true, data: serializeCycle(cycle) });
  } catch (err: any) {
    if (err.code?.startsWith('TERRITORY_CYCLE_')) return res.status(409).json({ success: false, error: err.code, message: err.message });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/confirm-supplemental
router.post('/confirm-supplemental', async (req: Request, res: Response) => {
  try {
    if (getManagerPayoutEngine() === 'disabled') {
      return res.status(409).json({ success: false, error: 'MANAGER_PAYOUT_ENGINE_DISABLED' });
    }
    const { territoryId, referenceMonth, managerId } = req.body;
    if (!territoryId || !referenceMonth || !managerId) return res.status(400).json({ success: false, error: 'territoryId, referenceMonth and managerId required' });
    const cycle = await confirmSupplementalCycle(pool, territoryId, referenceMonth, managerId);
    if (!cycle) return res.json({ success: true, data: null, message: 'No unallocated entries' });
    res.status(201).json({ success: true, data: serializeCycle(cycle) });
  } catch (err: any) {
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
