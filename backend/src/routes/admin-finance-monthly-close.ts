/**
 * PR #406: PREVIEW ONLY. No endpoint for finalizing a closing, locking an
 * account, changing a ledger status or uploading an external statement.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { loadMonthlyClosePreview } from '../services/finance/monthly-close-preview.service';

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

export default router;
