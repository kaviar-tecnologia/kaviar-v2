import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, resolveTerritoryMock, geoResolveServiceSpy } = vi.hoisted(() => ({
  prismaMock: {
    neighborhoods: {
      findUnique: vi.fn(),
    },
  } as any,
  resolveTerritoryMock: vi.fn(),
  geoResolveServiceSpy: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/territory-resolver.service', () => ({
  resolveTerritory: resolveTerritoryMock,
}));

vi.mock('../src/services/geo-resolve', () => ({
  GeoResolveService: geoResolveServiceSpy,
}));

const { default: arContextRoutes } = await import('../src/routes/ar-context');

const app = express();
app.use(express.json());
app.use('/api/ar', arContextRoutes);

function makeToken(options?: {
  expiresIn?: string | number;
  scope?: string;
  audience?: string;
  issuer?: string;
  secret?: string;
}): string {
  return jwt.sign(
    { scope: options?.scope ?? 'ar:territory-context' },
    options?.secret ?? (process.env.AR_PUBLIC_JWT_SECRET as string),
    {
      audience: options?.audience ?? 'ar-public',
      issuer: options?.issuer ?? 'kaviar-ar-public',
      expiresIn: options?.expiresIn ?? '5m',
      jwtid: `jti-${Math.random().toString(36).slice(2)}`,
    },
  );
}

function baseNeighborhoodRecord(overrides?: Record<string, unknown>) {
  return {
    id: 'nb-1',
    name: 'Copacabana',
    city: 'Rio de Janeiro',
    territory: {
      id: 'territory-rio',
      name: 'Rio',
      uf: 'RJ',
      status: 'active',
      is_active: true,
      moto_passenger_enabled: true,
      moto_express_enabled: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'general-jwt-secret';
  process.env.AR_PUBLIC_JWT_SECRET = 'ar-public-jwt-secret';

  resolveTerritoryMock.mockResolvedValue({
    resolved: true,
    method: 'neighborhood',
    neighborhood: { id: 'nb-1', name: 'Copacabana' },
    community: null,
    srid: 4326,
  });

  prismaMock.neighborhoods.findUnique.mockResolvedValue(baseNeighborhoodRecord());
});

afterEach(() => {
  delete process.env.AR_AUTH_RATE_LIMIT_MAX;
  delete process.env.AR_CONTEXT_RATE_LIMIT_MAX;
});

describe('AR context public endpoints', () => {
  it('1) emite token anônimo válido com claims mínimos', async () => {
    const res = await request(app).post('/api/ar/auth/anonymous').send({});

    expect(res.status).toBe(200);
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.expiresIn).toBe(300);
    expect(res.body.audience).toBe('ar-public');
    expect(res.body.issuer).toBe('kaviar-ar-public');
    expect(res.body.scope).toBe('ar:territory-context');

    const decoded = jwt.decode(res.body.token) as jwt.JwtPayload;
    expect(decoded.aud).toBe('ar-public');
    expect(decoded.iss).toBe('kaviar-ar-public');
    expect(decoded.scope).toBe('ar:territory-context');
    expect(decoded.iat).toBeTypeOf('number');
    expect(decoded.exp).toBeTypeOf('number');
    expect(decoded.jti).toBeTypeOf('string');
  });

  it('2) retorna 401 quando token está ausente', async () => {
    const res = await request(app)
      .post('/api/ar/context/territory')
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('3) retorna 401 para token expirado ou inválido', async () => {
    const expired = makeToken({ expiresIn: '-10s' });

    const expiredRes = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${expired}`)
      .send({ latitude: -22.9, longitude: -43.2 });
    expect(expiredRes.status).toBe(401);

    const invalidRes = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', 'Bearer invalid-token')
      .send({ latitude: -22.9, longitude: -43.2 });
    expect(invalidRes.status).toBe(401);
  });

  it('3.1) rejeita token assinado apenas com JWT_SECRET geral', async () => {
    const tokenWithGeneralSecret = makeToken({ secret: process.env.JWT_SECRET as string });
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${tokenWithGeneralSecret}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('3.2) rejeita token com issuer incorreto', async () => {
    const wrongIssuerToken = makeToken({ issuer: 'wrong-issuer' });
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${wrongIssuerToken}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('3.3) falha fechado sem AR_PUBLIC_JWT_SECRET', async () => {
    delete process.env.AR_PUBLIC_JWT_SECRET;
    const authRes = await request(app).post('/api/ar/auth/anonymous').send({});
    expect(authRes.status).toBe(503);
    expect(authRes.body.error).toBe('JWT_NOT_CONFIGURED');

    const tokenWithGeneralSecret = jwt.sign(
      { scope: 'ar:territory-context' },
      process.env.JWT_SECRET as string,
      { audience: 'ar-public', issuer: 'kaviar-ar-public', expiresIn: '5m', jwtid: 'jti-general-only' },
    );
    const contextRes = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${tokenWithGeneralSecret}`)
      .send({ latitude: -22.9, longitude: -43.2 });
    expect(contextRes.status).toBe(401);
    expect(contextRes.body.error).toBe('UNAUTHORIZED');
  });

  it('4) retorna 400 para latitude inválida', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -91, longitude: -43.2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_COORDINATES');
  });

  it('5) retorna 400 para longitude inválida', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: 181 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_COORDINATES');
  });

  it('6) resolve community com confidence high', async () => {
    resolveTerritoryMock.mockResolvedValueOnce({
      resolved: true,
      method: 'community',
      neighborhood: { id: 'nb-1', name: 'Copacabana' },
      community: { id: 'com-1', name: 'Comunidade' },
      srid: 4326,
    });

    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
    expect(res.body.resolution).toEqual({ method: 'community', confidence: 'high' });
  });

  it('7) resolve neighborhood com confidence high', async () => {
    resolveTerritoryMock.mockResolvedValueOnce({
      resolved: true,
      method: 'neighborhood',
      neighborhood: { id: 'nb-1', name: 'Copacabana' },
      community: null,
      srid: 4326,
    });

    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(200);
    expect(res.body.resolution).toEqual({ method: 'neighborhood', confidence: 'high' });
  });

  it('8) resolve fallback_800m com confidence medium', async () => {
    resolveTerritoryMock.mockResolvedValueOnce({
      resolved: true,
      method: 'fallback_800m',
      neighborhood: { id: 'nb-1', name: 'Copacabana' },
      community: null,
      srid: 4326,
    });

    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(200);
    expect(res.body.resolution).toEqual({ method: 'fallback_800m', confidence: 'medium' });
  });

  it('9) retorna outside quando resolver não encontra território', async () => {
    resolveTerritoryMock.mockResolvedValueOnce({
      resolved: false,
      method: 'outside',
      neighborhood: null,
      community: null,
      srid: 4326,
    });

    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -23.5, longitude: -46.6 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
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
    });
  });

  it('10) faz mapping correto de territory/neighborhood', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(prismaMock.neighborhoods.findUnique).toHaveBeenCalledWith({
      where: { id: 'nb-1' },
      select: expect.any(Object),
    });
    expect(res.status).toBe(200);
    expect(res.body.territory).toEqual({
      id: 'territory-rio',
      name: 'Rio',
      city: 'Rio de Janeiro',
      state: 'RJ',
      neighborhood: {
        id: 'nb-1',
        name: 'Copacabana',
      },
    });
  });

  it('11) aplica flags de services (car/motoPassenger/motoExpress)', async () => {
    prismaMock.neighborhoods.findUnique.mockResolvedValueOnce(
      baseNeighborhoodRecord({
        territory: {
          id: 'territory-rio',
          name: 'Rio',
          uf: 'RJ',
          status: 'inactive',
          is_active: true,
          moto_passenger_enabled: false,
          moto_express_enabled: true,
        },
      }),
    );

    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(200);
    expect(res.body.services).toEqual({
      car: false,
      motoPassenger: false,
      motoExpress: true,
    });
  });

  it('12) sem vínculo operacional neighborhood->territory retorna resolved=false', async () => {
    prismaMock.neighborhoods.findUnique.mockResolvedValueOnce(
      baseNeighborhoodRecord({ territory: null }),
    );

    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(false);
    expect(res.body.territory).toBeNull();
    expect(res.body.resolution).toEqual({ method: 'outside', confidence: 'low' });
  });

  it('13) não usa GeoResolveService legado', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(200);
    expect(geoResolveServiceSpy).not.toHaveBeenCalled();
    expect(resolveTerritoryMock).toHaveBeenCalledTimes(1);
  });

  it('14) resposta não expõe geom/polígonos/notas/auditoria', async () => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(200);
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain('geom');
    expect(bodyText).not.toContain('polygon');
    expect(bodyText).not.toContain('regulatory_notes');
    expect(bodyText).not.toContain('audit');
  });

  it('15) log não contém latitude/longitude/geohash/payload bruto', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const token = makeToken();

    const res = await request(app)
      .post('/api/ar/context/territory')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: -22.9, longitude: -43.2 });

    expect(res.status).toBe(200);
    expect(infoSpy).toHaveBeenCalled();
    const [, logPayload] = infoSpy.mock.calls.find((call) => call[0] === '[AR_TERRITORY_CONTEXT]') || [];
    expect(logPayload).toBeDefined();
    expect(logPayload).toMatchObject({
      requestId: expect.any(String),
      resolved: expect.any(Boolean),
      method: expect.any(String),
      territoryId: expect.anything(),
      httpStatus: 200,
    });
    expect(JSON.stringify(logPayload)).not.toContain('latitude');
    expect(JSON.stringify(logPayload)).not.toContain('longitude');
    expect(JSON.stringify(logPayload)).not.toContain('geohash');
  });

  it('16) rate limit por IP não é contornado ao variar tokens inválidos', async () => {
    let lastStatus = 0;

    for (let i = 0; i < 31; i++) {
      const variedInvalidToken = `invalid-token-${i}`;
      const response = await request(app)
        .post('/api/ar/context/territory')
        .set('Authorization', `Bearer ${variedInvalidToken}`)
        .send({ latitude: -22.9, longitude: -43.2 });
      lastStatus = response.status;
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
  });
});
