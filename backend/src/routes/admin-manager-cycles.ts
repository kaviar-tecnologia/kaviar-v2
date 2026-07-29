/**
 * Admin Manager Cycles Routes.
 *
 * RBAC: SUPER_ADMIN, FINANCE
 * NO mark-as-paid, manual payment, or PAID status.
 */

import { Router, Request, Response } from 'express';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { pool } from '../db';
import { calculateCycle, submitForReview, approveCycle, cancelCycle, listCycles, getCycleById } from '../services/finance/territory/cycle.service';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

// GET /manager-cycles
router.get('/', async (req: Request, res: Response) => {
  try {
    const cycles = await listCycles(pool, {
      territoryId: req.query.territoryId as string | undefined,
      managerId: req.query.managerId as string | undefined,
      status: req.query.status as string | undefined,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json({
      success: true,
      data: cycles.map(c => ({
        ...c,
        grossPlatformFeeCents: c.grossPlatformFeeCents.toString(),
        grossManagerCommissionCents: c.grossManagerCommissionCents.toString(),
        approvedAdjustmentsCents: c.approvedAdjustmentsCents.toString(),
        approvedAmountCents: c.approvedAmountCents.toString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// GET /manager-cycles/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const cycle = await getCycleById(pool, req.params.id);
    if (!cycle) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    res.json({
      success: true,
      data: {
        ...cycle,
        grossPlatformFeeCents: cycle.grossPlatformFeeCents.toString(),
        grossManagerCommissionCents: cycle.grossManagerCommissionCents.toString(),
        approvedAdjustmentsCents: cycle.approvedAdjustmentsCents.toString(),
        approvedAmountCents: cycle.approvedAmountCents.toString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/calculate
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { territoryId, referenceMonth, managerId } = req.body;
    if (!territoryId || !referenceMonth) {
      return res.status(400).json({ success: false, error: 'territoryId and referenceMonth required' });
    }
    const cycle = await calculateCycle(pool, territoryId, referenceMonth, managerId ?? null);
    res.status(201).json({
      success: true,
      data: {
        ...cycle,
        grossPlatformFeeCents: cycle.grossPlatformFeeCents.toString(),
        grossManagerCommissionCents: cycle.grossManagerCommissionCents.toString(),
        approvedAdjustmentsCents: cycle.approvedAdjustmentsCents.toString(),
        approvedAmountCents: cycle.approvedAmountCents.toString(),
      },
    });
  } catch (err: any) {
    if (err.code === 'TERRITORY_CYCLE_MONTH_NOT_OUTBOUND') {
      return res.status(400).json({ success: false, error: err.code, message: err.message });
    }
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/:id/submit-review
router.post('/:id/submit-review', async (req: Request, res: Response) => {
  try {
    const cycle = await submitForReview(pool, req.params.id);
    res.json({ success: true, data: { id: cycle.id, status: cycle.status } });
  } catch (err: any) {
    if (err.code === 'TERRITORY_CYCLE_INVALID_TRANSITION') {
      return res.status(409).json({ success: false, error: err.code });
    }
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

// POST /manager-cycles/:id/approve
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin?.id ?? 'unknown';
    const cycle = await approveCycle(pool, req.params.id, adminId);
    res.json({ success: true, data: { id: cycle.id, status: cycle.status, approvedAt: cycle.approvedAt } });
  } catch (err: any) {
    if (err.code === 'TERRITORY_CYCLE_INVALID_TRANSITION') {
      return res.status(409).json({ success: false, error: err.code });
    }
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
    if (err.code === 'TERRITORY_CYCLE_INVALID_TRANSITION') {
      return res.status(409).json({ success: false, error: err.code });
    }
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
