/**
 * PR #406: PREVIEW ONLY. No endpoint for finalizing a closing, locking an
 * account, changing a ledger status or uploading an external statement.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { loadMonthlyClosePreview } from '../services/finance/monthly-close-preview.service';
import {
  CloseReviewError, prepareMonthlyCloseReview, submitMonthlyCloseReview,
  approveInternalMonthlyCloseReview, reopenMonthlyCloseReview, listMonthlyCloseReviews,
} from '../services/finance/monthly-close-review.service';
import { auditCtx } from '../utils/audit';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

const querySchema = z.object({
  legal_entity_id: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
}).strict();

router.get('/preview', async (req: Request, res: Response) => {
  const role = (req as any).admin?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'INVALID_MONTHLY_CLOSE_QUERY' });
  }
  try {
    const { legal_entity_id, year, month } = parsed.data;
    const preview = await loadMonthlyClosePreview(legal_entity_id, year, month);
    if (!preview) {
      return res.status(404).json({ success: false, error: 'LEGAL_ENTITY_NOT_FOUND' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: preview });
  } catch {
    return res.status(500).json({ success: false, error: 'MONTHLY_CLOSE_PREVIEW_UNAVAILABLE' });
  }
});


/**
 * PR #407: these endpoints approve INTERNAL REVIEW ONLY. There is deliberately
 * no final-close, no bank statement certification, no ledger lock or payout.
 * The Portal do Contador's COMPLETED status is a separate process.
 */
const reviewParams = z.object({ id: z.string().uuid() }).strict();
const reopenBody = z.object({ reason: z.string().trim().min(10).max(500) }).strict();

function actorFrom(req: Request) {
  const role = (req as any).admin?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') throw new CloseReviewError(403, 'FORBIDDEN');
  const id = (req as any).admin?.id;
  if (!id) throw new CloseReviewError(401, 'ADMIN_ID_REQUIRED');
  const ctx = auditCtx(req);
  return {
    adminId: String(id), adminEmail: ctx.adminEmail ?? null,
    ipAddress: ctx.ip ?? null, userAgent: ctx.ua ?? null,
    role,
  };
}
function handleReviewError(res: Response, err: unknown) {
  if (err instanceof CloseReviewError) return res.status(err.status).json({ success: false, error: err.code });
  if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: 'INVALID_MONTHLY_CLOSE_INPUT' });
  if ((err as any)?.code === 'P2002') return res.status(409).json({ success: false, error: 'CONCURRENT_REVIEW_CONFLICT' });
  console.error('[FINANCE_CLOSE_REVIEW]', err);
  return res.status(500).json({ success: false, error: 'MONTHLY_CLOSE_REVIEW_UNAVAILABLE' });
}

router.get('/reviews', async (req: Request, res: Response) => {
  try {
    actorFrom(req);
    const query = querySchema.parse(req.query);
    const rows = await listMonthlyCloseReviews(query.legal_entity_id, query.year, query.month);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: rows });
  } catch (err) { return handleReviewError(res, err); }
});
router.post('/reviews/prepare', async (req: Request, res: Response) => {
  try {
    const actor = actorFrom(req);
    const query = querySchema.parse(req.body);
    const result = await prepareMonthlyCloseReview(query.legal_entity_id, query.year, query.month, actor);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ success: true, data: result });
  } catch (err) { return handleReviewError(res, err); }
});
router.post('/reviews/:id/submit', async (req: Request, res: Response) => {
  try {
    const actor = actorFrom(req);
    const params = reviewParams.parse(req.params);
    const result = await submitMonthlyCloseReview(params.id, actor);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: result });
  } catch (err) { return handleReviewError(res, err); }
});
router.post('/reviews/:id/approve-internal', async (req: Request, res: Response) => {
  try {
    const actor = actorFrom(req);
    if (actor.role !== 'SUPER_ADMIN') throw new CloseReviewError(403, 'SUPER_ADMIN_REQUIRED');
    const params = reviewParams.parse(req.params);
    const result = await approveInternalMonthlyCloseReview(params.id, actor);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: result });
  } catch (err) { return handleReviewError(res, err); }
});
router.post('/reviews/:id/reopen', async (req: Request, res: Response) => {
  try {
    const actor = actorFrom(req);
    if (actor.role !== 'SUPER_ADMIN') throw new CloseReviewError(403, 'SUPER_ADMIN_REQUIRED');
    const params = reviewParams.parse(req.params);
    const body = reopenBody.parse(req.body);
    const result = await reopenMonthlyCloseReview(params.id, body.reason, actor);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: result });
  } catch (err) { return handleReviewError(res, err); }
});

export default router;
