import { Router, Request, Response } from 'express';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { requireLocalSupportEnabled } from '../middlewares/local-support-flag';
import { localSupportService } from '../services/local-support.service';

const router = Router();
router.use(authenticateAdmin);
router.use(requireRole(['SUPER_ADMIN', 'OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']));
router.use(requireLocalSupportEnabled);

// GET /api/admin/local-support/drivers
router.get('/drivers', async (req: Request, res: Response) => {
  try {
    const { community_id, status, limit } = req.query;
    const data = await localSupportService.listDrivers({
      community_id: community_id as string,
      status: status as string,
      limit: limit ? Number(limit) : undefined,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// GET /api/admin/local-support/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const { community_id } = req.query;
    const data = await localSupportService.getSummary({
      community_id: community_id as string,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// POST /api/admin/local-support/drivers/:driverId
router.post('/drivers/:driverId', async (req: Request, res: Response) => {
  try {
    const data = await localSupportService.registerDriver(req.params.driverId, req.body);
    return res.json({ success: true, data });
  } catch (err: any) {
    const status = err.message === 'Driver not found' ? 404 : 500;
    return res.status(status).json({ success: false, error: status === 404 ? 'Motorista não encontrado' : 'Erro interno do servidor' });
  }
});

// PUT /api/admin/local-support/drivers/:driverId
router.put('/drivers/:driverId', async (req: Request, res: Response) => {
  try {
    const data = await localSupportService.updateDriver(req.params.driverId, req.body);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// POST /api/admin/local-support/invites
router.post('/invites', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const data = await localSupportService.recordInvite({
      ...req.body,
      invited_by_admin_id: admin?.id,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

export default router;
