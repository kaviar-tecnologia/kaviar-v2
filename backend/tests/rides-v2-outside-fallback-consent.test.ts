import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, dispatchRideMock } = vi.hoisted(() => ({
  prismaMock: {
    rides_v2: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  } as any,
  authState: {
    passengerId: 'passenger-1',
  },
  dispatchRideMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../src/config', () => ({ config: {} }));
vi.mock('../src/config/s3-upload', () => ({ getPresignedUrl: vi.fn() }));
vi.mock('../src/modules/whatsapp', () => ({ whatsappEvents: {} }));

vi.mock('../src/services/dispatcher.service', () => ({
  dispatcherService: {
    dispatchRide: dispatchRideMock,
  },
}));

vi.mock('../src/services/territory-resolver.service', () => ({
  resolveTerritory: vi.fn(),
}));

vi.mock('../src/services/realtime.service', () => ({
  realTimeService: {
    emitToDriver: vi.fn(),
    emitToRide: vi.fn(),
  },
}));

vi.mock('../src/services/pricing-engine', () => ({}));
vi.mock('../src/services/credit-cost.service', () => ({
  calculateCreditCost: vi.fn(),
}));
vi.mock('../src/services/credit.service', () => ({
  applyCreditDelta: vi.fn(),
}));
vi.mock('../src/services/wallet-shadow.service', () => ({
  shadowCalculate: vi.fn(),
}));
vi.mock('../src/services/moto-passenger-flag.service', () => ({
  isMotoPassengerEnabled: vi.fn(),
}));

vi.mock('../src/middlewares/auth', () => ({
  authenticatePassenger: (req: any, _res: any, next: any) => {
    req.passengerId = authState.passengerId;
    next();
  },
  authenticateDriver: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../src/services/google-directions.service', () => ({
  getRouteDistance: vi.fn(),
}));

vi.mock('../src/services/territory-floor.service', () => ({
  getFloorForRoute: vi.fn(),
}));

vi.mock('../src/services/wallet-v2/wallet.service', () => ({
  WalletService: class {},
}));
vi.mock('../src/services/wallet-v2/fee-split.service', () => ({
  FeeSplitService: class {},
}));
vi.mock('../src/services/wallet-v2/territory-ledger.service', () => ({
  TerritoryLedgerService: class {},
}));
vi.mock('../src/services/wallet-v2/pending-debit.service', () => ({
  PendingDebitService: class {},
}));
vi.mock('../src/services/wallet-v2/wallet-settlement.service', () => ({
  WalletSettlementService: class {},
}));
vi.mock('../src/services/wallet-v2/settlement-gate', () => ({
  isSettlementPaused: vi.fn(),
}));

vi.mock('../src/services/finance/annual-incentive-ledger.service', () => ({
  AnnualIncentiveLedgerService: class {},
}));
vi.mock('../src/services/finance/annual-incentive-shadow.service', () => ({
  AnnualIncentiveShadowService: class {},
}));

vi.mock('../src/services/push.service', () => ({
  sendPushToDriver: vi.fn(),
  sendPushToPassenger: vi.fn(),
}));

vi.mock('../src/services/wallet-v2/fee-helper', () => ({
  estimateFeeCentsFromPrice: vi.fn(),
  calculateFeeCents: vi.fn(),
}));

vi.mock('../src/routes/driver-wallet-v2', () => ({
  isWalletV2Enabled: vi.fn(),
  _resetWalletV2Cache: vi.fn(),
}));

vi.mock('../src/services/ride-emergency.service', () => ({
  triggerEmergency: vi.fn(),
  appendTrailPoint: vi.fn(),
}));

const { default: ridesV2Routes } = await import('../src/routes/rides-v2');

const app = express();
app.use(express.json());
app.use('/api/v2/rides', ridesV2Routes);

function ride(overrides: Record<string, any> = {}) {
  return {
    id: 'ride-1',
    passenger_id: 'passenger-1',
    status: 'no_driver',
    is_homebound: true,
    outside_fallback_allowed: false,
    outside_fallback_consented_at: null,
    ...overrides,
  };
}

describe('POST /api/v2/rides/:ride_id/outside-fallback-consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.passengerId = 'passenger-1';
    dispatchRideMock.mockResolvedValue(undefined);
    prismaMock.rides_v2.findFirst.mockResolvedValue(null);
    prismaMock.rides_v2.updateMany.mockResolvedValue({ count: 0 });
  });

  it('exige consentimento explícito accept=true', async () => {
    const res = await request(app)
      .post('/api/v2/rides/ride-1/outside-fallback-consent')
      .send({ accept: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CONSENT_REQUIRED');
    expect(prismaMock.rides_v2.findUnique).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('não permite que outro passageiro autorize a corrida', async () => {
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(
      ride({ passenger_id: 'passenger-2' }),
    );

    const res = await request(app)
      .post('/api/v2/rides/ride-1/outside-fallback-consent')
      .send({ accept: true });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Corrida não encontrada');
    expect(prismaMock.rides_v2.updateMany).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('bloqueia fallback OUTSIDE para corrida que não é homebound', async () => {
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(
      ride({ is_homebound: false }),
    );

    const res = await request(app)
      .post('/api/v2/rides/ride-1/outside-fallback-consent')
      .send({ accept: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OUTSIDE_FALLBACK_ONLY_HOMEBOUND');
    expect(prismaMock.rides_v2.updateMany).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('só permite primeiro consentimento quando a corrida está em no_driver', async () => {
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(
      ride({ status: 'requested' }),
    );

    const res = await request(app)
      .post('/api/v2/rides/ride-1/outside-fallback-consent')
      .send({ accept: true });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('OUTSIDE_FALLBACK_NOT_AVAILABLE');
    expect(res.body.status).toBe('requested');
    expect(prismaMock.rides_v2.updateMany).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('registra consentimento, volta para requested e inicia exatamente um dispatch', async () => {
    const consentedAt = new Date('2026-09-16T04:00:00.000Z');

    prismaMock.rides_v2.findUnique
      .mockResolvedValueOnce(ride())
      .mockResolvedValueOnce({
        id: 'ride-1',
        status: 'requested',
        outside_fallback_allowed: true,
        outside_fallback_consented_at: consentedAt,
      });

    prismaMock.rides_v2.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/v2/rides/ride-1/outside-fallback-consent')
      .send({ accept: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      ride_id: 'ride-1',
      status: 'requested',
      outside_fallback_allowed: true,
    });

    expect(prismaMock.rides_v2.updateMany).toHaveBeenCalledTimes(1);

    expect(prismaMock.rides_v2.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ride-1',
        passenger_id: 'passenger-1',
        is_homebound: true,
        status: 'no_driver',
      },
      data: {
        outside_fallback_allowed: true,
        outside_fallback_consented_at: expect.any(Date),
        status: 'requested',
      },
    });

    await vi.waitFor(() => {
      expect(dispatchRideMock).toHaveBeenCalledTimes(1);
      expect(dispatchRideMock).toHaveBeenCalledWith('ride-1');
    });
  });

  it('chamada repetida não dispara um segundo dispatch enquanto a corrida já está requested', async () => {
    const consentedAt = new Date('2026-09-16T04:00:00.000Z');

    prismaMock.rides_v2.findUnique
      .mockResolvedValueOnce(
        ride({
          status: 'requested',
          outside_fallback_allowed: true,
          outside_fallback_consented_at: consentedAt,
        }),
      )
      .mockResolvedValueOnce({
        id: 'ride-1',
        status: 'requested',
        outside_fallback_allowed: true,
        outside_fallback_consented_at: consentedAt,
      });

    prismaMock.rides_v2.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .post('/api/v2/rides/ride-1/outside-fallback-consent')
      .send({ accept: true });

    expect(res.status).toBe(200);
    expect(res.body.data.outside_fallback_allowed).toBe(true);

    await new Promise((resolve) => setImmediate(resolve));

    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('após falha operacional pode reutilizar o consentimento sem alterar o timestamp', async () => {
    const consentedAt = new Date('2026-09-16T04:00:00.000Z');

    prismaMock.rides_v2.findUnique
      .mockResolvedValueOnce(
        ride({
          status: 'no_driver',
          outside_fallback_allowed: true,
          outside_fallback_consented_at: consentedAt,
        }),
      )
      .mockResolvedValueOnce({
        id: 'ride-1',
        status: 'requested',
        outside_fallback_allowed: true,
        outside_fallback_consented_at: consentedAt,
      });

    prismaMock.rides_v2.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/v2/rides/ride-1/outside-fallback-consent')
      .send({ accept: true });

    expect(res.status).toBe(200);

    expect(prismaMock.rides_v2.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          outside_fallback_allowed: true,
          outside_fallback_consented_at: consentedAt,
          status: 'requested',
        },
      }),
    );

    await vi.waitFor(() => {
      expect(dispatchRideMock).toHaveBeenCalledTimes(1);
    });
  });

  it('GET /active recupera homebound no_driver que ainda aguarda decisão OUTSIDE', async () => {
    prismaMock.rides_v2.findFirst.mockResolvedValueOnce({
      id: 'ride-homebound-no-driver',
      passenger_id: 'passenger-1',
      status: 'no_driver',
      is_homebound: true,
      outside_fallback_allowed: false,
      outside_fallback_consented_at: null,
      scheduled_for: null,
      origin_lat: -22.9,
      origin_lng: -43.2,
      dest_lat: -22.91,
      dest_lng: -43.21,
      updated_at: new Date('2026-09-16T04:00:00.000Z'),
      driver: null,
    });

    const res = await request(app)
      .get('/api/v2/rides/active');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 'ride-homebound-no-driver',
      status: 'no_driver',
      is_homebound: true,
      outside_fallback_allowed: false,
    });

    expect(prismaMock.rides_v2.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          passenger_id: 'passenger-1',
          OR: expect.arrayContaining([
            {
              status: 'no_driver',
              is_homebound: true,
              outside_fallback_allowed: false,
              scheduled_for: null,
            },
          ]),
        },
      }),
    );
  });

  it('GET /active não inclui no_driver comum na seleção de corrida ativa', async () => {
    prismaMock.rides_v2.findFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v2/rides/active');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();

    const call = prismaMock.rides_v2.findFirst.mock.calls[0]?.[0];
    expect(call).toBeDefined();

    const activeStatuses =
      call.where.OR.find((entry: any) => entry.status?.in)?.status.in;

    expect(activeStatuses).not.toContain('no_driver');

    const noDriverBranches =
      call.where.OR.filter((entry: any) => entry.status === 'no_driver');

    expect(noDriverBranches).toEqual([
      {
        status: 'no_driver',
        is_homebound: true,
        outside_fallback_allowed: false,
        scheduled_for: null,
      },
    ]);
  });

});
