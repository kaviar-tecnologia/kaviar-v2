import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_TOKEN_EXPIRY = '15m';
const ISSUER = 'kaviar-accounting';
const AUDIENCE = 'kaviar-accountant-portal';

function getJwtSecret(): string {
  if (process.env.ACCOUNTANT_JWT_SECRET) {
    return process.env.ACCOUNTANT_JWT_SECRET;
  }
  // Fallback for dev only
  if (process.env.NODE_ENV !== 'production') {
    return (process.env.JWT_SECRET || 'dev-secret') + '-accountant';
  }
  throw new Error('ACCOUNTANT_JWT_SECRET must be set in production');
}

export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
  userType: 'ACCOUNTANT';
  iss: string;
  aud: string;
}

export function generateAccessToken(accountantId: string, sessionId: string): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      userId: accountantId,
      sessionId,
      userType: 'ACCOUNTANT',
    },
    secret,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: ISSUER,
      audience: AUDIENCE,
    }
  );
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  }) as any;

  if (decoded.userType !== 'ACCOUNTANT') {
    throw new Error('Invalid token type');
  }

  return {
    userId: decoded.userId,
    sessionId: decoded.sessionId,
    userType: decoded.userType,
    iss: decoded.iss,
    aud: decoded.aud,
  };
}
