import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { requireTerritoryScope } from '../middlewares/require-territory-scope';
import {
  arPlaceCreateBodySchema,
  arPlaceIdParamSchema,
  arPlaceListQuerySchema,
  arPlacePatchBodySchema,
} from '../services/ar-places/ar-places-validation';
import {
  ArPlaceServiceError,
  createAdminArPlace,
  getAdminArPlaceById,
  listAdminArPlaces,
  updateAdminArPlace,
} from '../services/ar-places/ar-places.service';
import { serializeArPlaceDetail, serializeArPlaceListItem } from '../services/ar-places/ar-places-serializers';

const router = Router();

router.use(authenticateAdmin);
router.use(applyTerritoryScope);

function validationError(res: Response, error: ZodError) {
  return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Payload inválido' });
}

function serviceError(res: Response, error: unknown) {
  if (error instanceof ArPlaceServiceError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

router.get(
  '/places',
  requireRole(['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']),
  requireTerritoryScope,
  async (req: Request, res: Response) => {
    try {
      const parsed = arPlaceListQuerySchema.safeParse(req.query);
      if (!parsed.success) return validationError(res, parsed.error);

      const admin = (req as any).admin;
      const scope = (req as any).territoryScope;
      const rows = await listAdminArPlaces(parsed.data, admin, scope);
      return res.json({ success: true, data: rows.map(serializeArPlaceListItem) });
    } catch (error) {
      return serviceError(res, error);
    }
  },
);

router.get(
  '/places/:id',
  requireRole(['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']),
  requireTerritoryScope,
  async (req: Request, res: Response) => {
    try {
      const parsed = arPlaceIdParamSchema.safeParse(req.params);
      if (!parsed.success) return validationError(res, parsed.error);

      const admin = (req as any).admin;
      const scope = (req as any).territoryScope;
      const row = await getAdminArPlaceById(parsed.data.id, admin, scope);
      if (!row) return res.status(404).json({ success: false, error: 'Local AR não encontrado' });
      return res.json({ success: true, data: serializeArPlaceDetail(row) });
    } catch (error) {
      return serviceError(res, error);
    }
  },
);

router.post(
  '/places',
  requireRole(['SUPER_ADMIN', 'TERRITORIAL_MANAGER']),
  requireTerritoryScope,
  async (req: Request, res: Response) => {
    try {
      const parsed = arPlaceCreateBodySchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);

      const admin = (req as any).admin;
      const scope = (req as any).territoryScope;
      const created = await createAdminArPlace(parsed.data, admin, scope);
      return res.status(201).json({ success: true, data: serializeArPlaceDetail(created) });
    } catch (error) {
      return serviceError(res, error);
    }
  },
);

router.patch(
  '/places/:id',
  requireRole(['SUPER_ADMIN', 'TERRITORIAL_MANAGER']),
  requireTerritoryScope,
  async (req: Request, res: Response) => {
    try {
      const parsedParams = arPlaceIdParamSchema.safeParse(req.params);
      if (!parsedParams.success) return validationError(res, parsedParams.error);
      const parsedBody = arPlacePatchBodySchema.safeParse(req.body);
      if (!parsedBody.success) return validationError(res, parsedBody.error);

      const admin = (req as any).admin;
      const scope = (req as any).territoryScope;
      const updated = await updateAdminArPlace(parsedParams.data.id, parsedBody.data, admin, scope);
      if (!updated) return res.status(404).json({ success: false, error: 'Local AR não encontrado' });
      return res.json({ success: true, data: serializeArPlaceDetail(updated) });
    } catch (error) {
      return serviceError(res, error);
    }
  },
);

export default router;
