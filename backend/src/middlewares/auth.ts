import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

// Mantém compatibilidade: tenta ADMIN_JWT_SECRET e depois JWT_SECRET.
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

function getBearerToken(req: Request): string | null {
  const header = (req.headers.authorization || (req.headers as any).Authorization) as string | undefined;
  if (!header || typeof header !== 'string') return null;

  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;

  return token.trim();
}

/**
 * Check if a session token was issued before the user changed their password.
 * Returns true if the token is stale and should be rejected.
 */
function isTokenStale(tokenIat: number | undefined, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt || !tokenIat) return false;
  // password_changed_at in unix seconds, with 2s tolerance for clock skew
  const changedAtUnix = Math.floor(passwordChangedAt.getTime() / 1000);
  return tokenIat < changedAtUnix - 2;
}

export async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!JWT_SECRET) {
      console.error('[AUTH] JWT_SECRET não configurado');
      return res.status(500).json({ success: false, error: 'JWT secret not configured' });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token ausente' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Compatibilidade: token antigo pode ter adminId; novo usa userId
    const adminId = decoded.userId || decoded.adminId;
    if (!adminId) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }

    // Se vier userType e não for ADMIN, bloqueia
    if (decoded.userType && decoded.userType !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const admin = await prisma.admins.findUnique({ 
      where: { id: adminId },
    });
    
    if (!admin || !admin.is_active) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }

    // Invalidate sessions issued before password change
    if (isTokenStale(decoded.iat, admin.password_changed_at)) {
      return res.status(401).json({ success: false, error: 'Sessão expirada. Faça login novamente.' });
    }

    // Adicionar role ao req.admin
    (req as any).admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    (req as any).adminId = adminId;

    return next();
  } catch (err) {
    console.error('❌ [AUTH] Erro ao verificar token');
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }
}

/**
 * Middleware de autorização por papel (role)
 */
export function requireRole(allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const admin = (req as any).admin;

      if (!admin) {
        return res.status(401).json({ success: false, error: 'Não autenticado' });
      }

      if (allowedRoles.includes(admin.role)) {
        return next();
      }

      return res.status(403).json({ 
        success: false, 
        error: 'Acesso negado. Permissão insuficiente.',
        requiredRoles: allowedRoles,
        userRole: admin.role,
      });
    } catch (_err) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
  };
}

export const requireSuperAdmin = requireRole(['SUPER_ADMIN']);
export const allowExecutiveConfirmedAction = requireRole(['SUPER_ADMIN', 'EXECUTIVE_ADMIN']);
export const allowReadAccess = requireRole(['SUPER_ADMIN', 'ANGEL_VIEWER', 'TERRITORIAL_OPERATOR', 'TERRITORIAL_MANAGER']);
export const allowFinanceAccess = requireRole(['SUPER_ADMIN', 'EXECUTIVE_ADMIN', 'FINANCE']);

/**
 * Middleware genérico: verifica JWT válido, seta req.user
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const decoded = jwt.verify(token, JWT_SECRET!) as any;
    (req as any).user = decoded;
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware: verifica JWT + role ADMIN ou SUPER_ADMIN
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const decoded = jwt.verify(token, JWT_SECRET!) as any;
    if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    (req as any).user = decoded;
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export async function authenticateDriver(req: Request, res: Response, next: NextFunction) {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ success: false, error: 'JWT secret not configured' });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token ausente' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (decoded.userType !== 'DRIVER') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const driver = await prisma.drivers.findUnique({ 
      where: { id: decoded.userId }
    });
    
    if (!driver) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }

    // Invalidate sessions issued before password change
    if (isTokenStale(decoded.iat, driver.password_changed_at)) {
      return res.status(401).json({ success: false, error: 'Sessão expirada. Faça login novamente.' });
    }

    // Single-device session control: reject if session was superseded by another login
    if (decoded.sessionId && driver.active_session_id && decoded.sessionId !== driver.active_session_id) {
      return res.status(401).json({ success: false, error: 'Sessão encerrada. Você fez login em outro dispositivo.' });
    }

    (req as any).driver = driver;
    (req as any).userId = decoded.userId;
    (req as any).driverId = decoded.userId;

    return next();
  } catch (_err) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }
}

export async function authenticatePassenger(req: Request, res: Response, next: NextFunction) {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ success: false, error: 'JWT secret not configured' });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token ausente' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (decoded.userType !== 'PASSENGER') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const passenger = await prisma.passengers.findUnique({ 
      where: { id: decoded.userId }
    });
    
    if (!passenger) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }

    // Invalidate sessions issued before password change
    if (isTokenStale(decoded.iat, passenger.password_changed_at)) {
      return res.status(401).json({ success: false, error: 'Sessão expirada. Faça login novamente.' });
    }

    (req as any).passenger = passenger;
    (req as any).userId = decoded.userId;
    (req as any).passengerId = decoded.userId;

    return next();
  } catch (_err) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }
}
