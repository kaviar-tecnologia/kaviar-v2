import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware guard que garante que TERRITORIAL_OPERATOR/MANAGER tenha escopo territorial válido.
 *
 * DEVE ser usado APÓS applyTerritoryScope.
 *
 * Comportamento:
 * - SUPER_ADMIN → passa sempre (acesso global)
 * - TERRITORIAL_OPERATOR/MANAGER sem scope ou sem territoryIds NEM neighborhoodIds → 403
 * - TERRITORIAL_OPERATOR/MANAGER com territoryIds OU neighborhoodIds preenchido → passa
 * - Demais roles → passa (backward compatible, sem restrição territorial)
 */
export function requireTerritoryScope(req: Request, res: Response, next: NextFunction) {
  const admin = (req as any).admin;
  if (!admin) return res.status(401).json({ success: false, error: 'Não autenticado' });

  // SUPER_ADMIN: bypass incondicional
  if (admin.role === 'SUPER_ADMIN') return next();

  // TERRITORIAL_OPERATOR / TERRITORIAL_MANAGER: exige scope válido
  if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
    const scope = (req as any).territoryScope;

    const hasTerritories = scope?.territoryIds && scope.territoryIds.length > 0;
    const hasNeighborhoods = scope?.neighborhoodIds && scope.neighborhoodIds.length > 0;

    if (!scope || (!hasTerritories && !hasNeighborhoods)) {
      return res.status(403).json({
        success: false,
        code: 'TERRITORY_SCOPE_REQUIRED',
        error: 'Sem território vinculado. Acesso negado.',
      });
    }
  }

  return next();
}
