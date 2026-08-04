import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../services/accounting/accounting-token.service';

export async function authenticateAccountant(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token ausente' });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token ausente' });
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }

    // Verify userType
    if (payload.userType !== 'ACCOUNTANT') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Load accountant
    const accountant = await prisma.accountants.findUnique({
      where: { id: payload.userId },
    });

    if (!accountant) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }

    // Verify accountant is ACTIVE
    if (accountant.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'Conta não está ativa' });
    }

    // Verify session is still valid
    const session = await prisma.accountant_sessions.findFirst({
      where: {
        id: payload.sessionId,
        accountant_id: payload.userId,
        status: 'ACTIVE',
      },
    });

    if (!session) {
      return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada' });
    }

    // Check session expiry
    if (new Date() > session.expires_at) {
      return res.status(401).json({ success: false, error: 'Sessão expirada' });
    }

    // Set req.accountant
    (req as any).accountant = {
      id: accountant.id,
      email: accountant.email,
      sessionId: session.id,
    };

    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }
}
