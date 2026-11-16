import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { auditCtx } from '../utils/audit';
import {
  executeRegularization,
  previewRegularization,
  RegularizationError,
} from '../services/territory/manager-regularization';

const router = Router();
router.use(authenticateAdmin, requireSuperAdmin);

const selection = z.object({
  adminId: z.string().trim().min(1).max(200),
  assignment: z.boolean(),
  referral: z.boolean(),
}).strict();
const requestSchema = z.object({
  mode: z.enum(['preview', 'execute']).default('preview'),
  managers: z.array(selection).min(1).max(50),
  fingerprint: z.string().optional(),
  reason: z.string().optional(),
}).strict();

router.post('/', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Solicitação inválida.' });
  const { mode, managers, fingerprint, reason } = parsed.data;
  try {
    if (mode === 'preview') {
      return res.json({ success: true, mode, report: await previewRegularization(prisma, managers) });
    }
    if (process.env.MANAGER_REGULARIZATION_EXECUTION_ENABLED !== 'true') {
      return res.status(403).json({ success: false, code: 'EXECUTION_DISABLED', error: 'Execução desativada.' });
    }
    const result = await executeRegularization(prisma, auditCtx(req).adminId, managers, fingerprint ?? '', reason ?? '');
    return res.json({ success: true, mode, ...result });
  } catch (error) {
    if (error instanceof RegularizationError) {
      const status = error.code === 'FORBIDDEN' ? 403
        : error.code.startsWith('INVALID_') ? 400 : 409;
      return res.status(status).json({ success: false, code: error.code, error: error.message });
    }
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ success: false, code: 'CONCURRENT_CONFLICT', error: 'Dados conflitantes. Gere uma nova prévia.' });
    }
    console.error('[MANAGER_REGULARIZATION] operation failed', { code: (error as { code?: string }).code });
    return res.status(500).json({ success: false, error: 'Não foi possível concluir a regularização.' });
  }
});

export default router;
