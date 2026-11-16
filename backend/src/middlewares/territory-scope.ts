import type { Request, Response, NextFunction } from 'express';
import { getAdminTerritoryScope, TerritoryScope } from '../services/territory-scope.service';

/**
 * Middleware que resolve o escopo territorial do admin logado.
 * Seta req.territoryScope para uso nos handlers.
 *
 * - SUPER_ADMIN → req.territoryScope = null (sem filtro)
 * - TERRITORIAL_OPERATOR sem territory_access → req.territoryScope = { territoryIds: [], neighborhoodIds: [], accessLevel: 'none' }
 * - TERRITORIAL_OPERATOR com territory_access → req.territoryScope = { territoryIds, neighborhoodIds, accessLevel }
 * - Demais roles sem territory_access → req.territoryScope = null (backward compatible)
 * - Demais roles com territory_access → req.territoryScope = { territoryIds, neighborhoodIds, accessLevel }
 *
 * Este middleware NÃO bloqueia acesso. Apenas resolve o escopo.
 * Use requireTerritoryScope APÓS este middleware para bloquear operadores sem escopo.
 */
export async function applyTerritoryScope(req: Request, _res: Response, next: NextFunction) {
  try {
    const admin = (req as any).admin;
    if (!admin) return next();

    const scope = await getAdminTerritoryScope(admin.id, admin.role);
    (req as any).territoryScope = scope;
    next();
  } catch (err) {
    // TERRITORIAL_OPERATOR / TERRITORIAL_MANAGER: falha no resolver = scope vazio (deny-by-default)
    const admin = (req as any).admin;
    if (admin?.role === 'TERRITORIAL_OPERATOR' || admin?.role === 'TERRITORIAL_MANAGER') {
      console.error('[TERRITORY_SCOPE] resolution failed', { requestId: (req as any).requestId });
      return _res.status(503).json({
        success: false,
        code: 'TERRITORY_SCOPE_UNAVAILABLE',
        error: 'Não foi possível verificar o acesso territorial. Tente novamente.',
      });
    } else {
      // Demais roles: fail-open para backward compat
      (req as any).territoryScope = null;
    }
    next();
  }
}
