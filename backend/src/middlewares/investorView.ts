import type { Request, Response, NextFunction } from 'express';

// Middleware para bloquear ações de investidores (read-only)
const investorView = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).admin || (req as any).user;
  
  if (!user) {
    return next(); // Sem usuário, deixar outros middlewares tratarem
  }

  // Verificar se é INVESTOR_VIEW ou ANGEL_VIEWER
  if (user.role !== 'INVESTOR_VIEW' && user.role !== 'ANGEL_VIEWER') {
    return next(); // Não é investidor/angel, permitir
  }

  // Permitir endpoints de autenticação
  const allowedAuthPaths = [
    '/admin/auth/login',
    '/admin/auth/forgot-password',
    '/admin/auth/reset-password',
  ];

  if (allowedAuthPaths.some(path => req.path === path)) {
    return next();
  }

  // Bloquear métodos que modificam dados
  const blockedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  
  if (blockedMethods.includes(req.method)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Ação não permitida para visualização de investidor',
      role: 'INVESTOR_VIEW',
    });
  }

  // Bloquear endpoints sensíveis mesmo em GET
  const blockedPaths = [
    '/api/admin/drivers/approve',
    '/api/admin/drivers/reject',
    '/api/admin/payments',
    '/api/admin/notifications',
    '/api/admin/exports',
    '/api/admin/documents/download', // Bloquear download de documentos
    '/api/passengers/documents', // PII
    '/api/drivers/documents', // PII
  ];

  const fullPath = `${req.baseUrl}${req.path}`;
  const isBlocked = blockedPaths.some(path => fullPath.startsWith(path));
  
  if (isBlocked) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Endpoint não disponível para visualização de investidor',
      role: 'INVESTOR_VIEW',
    });
  }

  // Adicionar flag no request para outros middlewares saberem
  (req as any).isInvestorView = true;
  
  // Adicionar header na resposta
  res.setHeader('X-Demo-Mode', 'true');
  res.setHeader('X-Investor-View', 'true');
  
  next();
};

export default investorView;
