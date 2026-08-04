import rateLimit from 'express-rate-limit';

export const inviteRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { success: false, error: 'Limite de convites por hora atingido', code: 'RATE_LIMIT' },
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => (req as any).admin?.id || req.ip || 'unknown',
});

export const reinviteRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Limite de reenvios por hora atingido', code: 'RATE_LIMIT' },
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => (req as any).admin?.id || req.ip || 'unknown',
});

export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Muitas solicitações. Tente novamente mais tarde.', code: 'RATE_LIMIT' },
  skip: () => process.env.NODE_ENV === 'test',
});
