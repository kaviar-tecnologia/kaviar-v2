import { randomUUID, createHash } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { resolveTerritory } from '../services/territory-resolver.service';

const router = Router();

const AR_ANON_AUDIENCE = 'ar-public';
const AR_ANON_SCOPE = 'ar:territory-context';
const AR_ANON_TTL_SECONDS = 5 * 60;

const DEFAULT_AR_AUTH_RATE_LIMIT_MAX = 30;
const DEFAULT_AR_CONTEXT_RATE_LIMIT_MAX = 30;

const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

type ArResolutionMethod = 'community' | 'neighborhood' | 'fallback_800m' | 'outside';
type ArResolutionConfidence = 'high' | 'medium' | 'low';

type ArContextResolvedResponse = {
  resolved: true;
  territory: {
    id: string;
    name: string;
    city: string;
    state: string;
    neighborhood: {
      id: string | null;
      name: string | null;
    };
  };
  resolution: {
    method: Exclude<ArResolutionMethod, 'outside'>;
    confidence: Exclude<ArResolutionConfidence, 'low'>;
  };
  services: {
    // "car" indica território operacionalmente ativo para operação base;
    // não representa disponibilidade instantânea de motorista nem SLA.
    car: boolean;
    motoPassenger: boolean;
    motoExpress: boolean;
  };
};

type ArContextOutsideResponse = {
  resolved: false;
  territory: null;
  resolution: {
    method: 'outside';
    confidence: 'low';
  };
  services: {
    car: false;
    motoPassenger: false;
    motoExpress: false;
  };
};

type ArContextResponse = ArContextResolvedResponse | ArContextOutsideResponse;

function getJwtSecret(): string | null {
  return process.env.AR_PUBLIC_JWT_SECRET || process.env.JWT_SECRET || null;
}

function getRequestId(req: Request): string {
  return ((req as any).requestId as string | undefined) || randomUUID();
}

function getBearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function getRateLimitMax(envValue: string | undefined, defaultValue: number): number {
  if (!envValue) return defaultValue;
  const parsed = Number.parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

function buildOutsideResponse(): ArContextOutsideResponse {
  return {
    resolved: false,
    territory: null,
    resolution: {
      method: 'outside',
      confidence: 'low',
    },
    services: {
      car: false,
      motoPassenger: false,
      motoExpress: false,
    },
  };
}

function logContextResult(
  req: Request,
  payload: ArContextResponse,
  httpStatus: number,
): void {
  console.info('[AR_TERRITORY_CONTEXT]', {
    requestId: getRequestId(req),
    resolved: payload.resolved,
    method: payload.resolution.method,
    territoryId: payload.resolved ? payload.territory.id : null,
    httpStatus,
  });
}

function authenticateArAnonymousToken(req: Request, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  const secret = getJwtSecret();

  if (!token || !secret) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret, { audience: AR_ANON_AUDIENCE }) as JwtPayload;
    const scope = typeof decoded.scope === 'string' ? decoded.scope : '';
    if (scope !== AR_ANON_SCOPE) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

const arAuthRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: getRateLimitMax(process.env.AR_AUTH_RATE_LIMIT_MAX, DEFAULT_AR_AUTH_RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
  },
});

const arContextRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: getRateLimitMax(process.env.AR_CONTEXT_RATE_LIMIT_MAX, DEFAULT_AR_CONTEXT_RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = getBearerToken(req) || 'no-token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return `${req.ip}:${tokenHash}`;
  },
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
  },
});

router.post('/auth/anonymous', arAuthRateLimit, (req: Request, res: Response) => {
  const secret = getJwtSecret();
  if (!secret) {
    return res.status(500).json({ error: 'JWT_NOT_CONFIGURED' });
  }

  const token = jwt.sign(
    { scope: AR_ANON_SCOPE },
    secret,
    {
      audience: AR_ANON_AUDIENCE,
      expiresIn: AR_ANON_TTL_SECONDS,
      jwtid: randomUUID(),
    },
  );

  return res.status(200).json({
    token,
    tokenType: 'Bearer',
    expiresIn: AR_ANON_TTL_SECONDS,
    audience: AR_ANON_AUDIENCE,
    scope: AR_ANON_SCOPE,
    requestId: getRequestId(req),
  });
});

router.post('/context/territory', arContextRateLimit, authenticateArAnonymousToken, async (req: Request, res: Response) => {
  const parsed = coordinateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_COORDINATES' });
  }

  const { latitude, longitude } = parsed.data;

  try {
    const territoryResolution = await resolveTerritory(longitude, latitude);
    if (!territoryResolution.resolved || !territoryResolution.neighborhood?.id) {
      const outsideResponse = buildOutsideResponse();
      logContextResult(req, outsideResponse, 200);
      return res.status(200).json(outsideResponse);
    }

    const neighborhood = await prisma.neighborhoods.findUnique({
      where: { id: territoryResolution.neighborhood.id },
      select: {
        id: true,
        name: true,
        city: true,
        territory: {
          select: {
            id: true,
            name: true,
            uf: true,
            status: true,
            is_active: true,
            moto_passenger_enabled: true,
            moto_express_enabled: true,
          },
        },
      },
    });

    if (
      !neighborhood?.territory ||
      !neighborhood.city ||
      !neighborhood.territory.id ||
      !neighborhood.territory.name ||
      !neighborhood.territory.uf
    ) {
      const outsideResponse = buildOutsideResponse();
      logContextResult(req, outsideResponse, 200);
      return res.status(200).json(outsideResponse);
    }

    const method = territoryResolution.method;
    if (method === 'outside') {
      const outsideResponse = buildOutsideResponse();
      logContextResult(req, outsideResponse, 200);
      return res.status(200).json(outsideResponse);
    }

    const response: ArContextResolvedResponse = {
      resolved: true,
      territory: {
        id: neighborhood.territory.id,
        name: neighborhood.territory.name,
        city: neighborhood.city,
        state: neighborhood.territory.uf,
        neighborhood: {
          id: neighborhood.id || null,
          name: neighborhood.name || null,
        },
      },
      resolution: {
        method,
        confidence: method === 'fallback_800m' ? 'medium' : 'high',
      },
      services: {
        car: neighborhood.territory.status === 'active' && neighborhood.territory.is_active === true,
        motoPassenger: neighborhood.territory.moto_passenger_enabled,
        motoExpress: neighborhood.territory.moto_express_enabled,
      },
    };

    logContextResult(req, response, 200);
    return res.status(200).json(response);
  } catch {
    console.error('[AR_TERRITORY_CONTEXT]', {
      requestId: getRequestId(req),
      resolved: false,
      method: 'outside',
      territoryId: null,
      httpStatus: 500,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
