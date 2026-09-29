import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, dispatchRideMock, quoteMock, territoryMock } = vi.hoisted(() => ({
  prismaMock: {
    rides_v2: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    passengers: { findUnique: vi.fn() },
  } as any,
  authState: {
    passengerId: 'passenger-1',
  },
  dispatchRideMock: vi.fn(),
  quoteMock: vi.fn(),
  territoryMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../src/config', () => ({ config: { wait: { enabled: false } } }));
vi.mock('../src/config/s3-upload', () => ({ getPresignedUrl: vi.fn() }));
vi.mock('../src/modules/whatsapp', () => ({ whatsappEvents: {} }));

vi.mock('../src/services/dispatcher.service', () => ({
  dispatcherService: {
    dispatchRide: dispatchRideMock,
  },
}));

vi.mock('../src/services/territory-resolver.service', () => ({
  resolveTerritory: territoryMock,
}));

vi.mock('../src/services/realtime.service', () => ({
  realTimeService: {
    emitToDriver: vi.fn(),
    emitToRide: vi.fn(),
  },
}));

vi.mock('../src/services/pricing-engine', () => ({ quote: quoteMock }));
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


const officialRide = (id = 'ride-445-dispatch') => ({
  id, status: 'requested', ride_type: 'normal', service_category: 'CAR_NORMAL',
  pricing_profile_id: 'profile-1', quoted_price: '23.00', locked_price: '23.00',
  platform_fee: '4.14', driver_earnings: '18.86',
  settlement: {
    ride_id: id, pricing_profile_id: 'profile-1',
    quoted_price: '23.00', locked_price: '23.00', fee_amount: '4.14', driver_earnings: '18.86',
    quoted_at: new Date('2026-09-29T12:00:00Z'), locked_at: new Date('2026-09-29T12:00:00Z'),
  },
});

const requestBody = (patch: Record<string, any> = {}) => ({
  origin: { lat: -22.97, lng: -43.20, text: 'Origin' },
  destination: { lat: -22.95, lng: -43.18, text: 'Destination' },
  service_category: 'CAR_NORMAL',
  ...patch,
});

describe('CARE-445: create/idempotency must never dispatch or return success without quote lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.passengerId = 'passenger-445';
    prismaMock.rides_v2.findFirst.mockResolvedValue(null);
    prismaMock.rides_v2.create.mockImplementation(async (args: any) => ({
      id: 'ride-445-dispatch', status: args.data.status,
    }));
    prismaMock.rides_v2.update.mockResolvedValue({});
    prismaMock.rides_v2.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.rides_v2.findUnique.mockResolvedValue(officialRide());
    prismaMock.passengers.findUnique.mockResolvedValue(null);
    territoryMock.mockResolvedValue({ neighborhood: null, community: null });
    quoteMock.mockResolvedValue({
      quoted_price: 23, fee_percent: 18, fee_amount: 4.14,
      driver_earnings: 18.86, route_territory: 'local', distance_km: 10,
      pricing_profile_slug: 'car',
    });
    dispatchRideMock.mockResolvedValue(undefined);
  });

  const flushDispatch = async () => { await new Promise<void>(resolve => setImmediate(resolve)); };

  it('returns an explicit error and sends no immediate dispatch after quote throws', async () => {
    quoteMock.mockRejectedValueOnce(new Error('synthetic quote unavailable'));
    const res = await request(app).post('/api/v2/rides').send(requestBody());
    await flushDispatch();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: 'PRICING_QUOTE_UNAVAILABLE' });
    expect(dispatchRideMock).not.toHaveBeenCalled();
    expect(prismaMock.rides_v2.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ride-445-dispatch', passenger_id: 'passenger-445',
        status: { in: ['requested', 'scheduled'] },
      },
      data: { status: 'no_driver' },
    });
  });

  it('does not retain a scheduled ride that could dispatch later after quote failure', async () => {
    quoteMock.mockRejectedValueOnce(new Error('synthetic quote unavailable'));
    const scheduled_for = new Date(Date.now() + 30 * 60_000).toISOString();
    const res = await request(app).post('/api/v2/rides').send(requestBody({ scheduled_for }));
    expect(res.status).toBe(503);
    expect(dispatchRideMock).not.toHaveBeenCalled();
    expect(prismaMock.rides_v2.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['requested', 'scheduled'] } }),
      data: { status: 'no_driver' },
    }));
  });

  it.each([null, { quoted_price: Number.NaN }, { quoted_price: 0 }])(
    'returns error and no dispatch when quote returns an invalid result %s',
    async (result) => {
      quoteMock.mockResolvedValueOnce(result);
      const res = await request(app).post('/api/v2/rides').send(requestBody());
      await flushDispatch();
      expect(res.status).toBe(503);
      expect(dispatchRideMock).not.toHaveBeenCalled();
    },
  );

  it('requires a coherent persisted settlement and cache after the quote returned success', async () => {
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce({
      ...officialRide(), locked_price: null,
    });
    const res = await request(app).post('/api/v2/rides').send(requestBody());
    await flushDispatch();
    expect(res.status).toBe(503);
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('does not falsely return success for an unquoted idempotent replay', async () => {
    prismaMock.rides_v2.findFirst.mockResolvedValueOnce({
      ...officialRide(), settlement: null, quoted_price: null, locked_price: null,
    });
    const res = await request(app).post('/api/v2/rides')
      .set('Idempotency-Key', 'existing-unpriced')
      .send(requestBody());
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: 'PRICING_QUOTE_UNAVAILABLE' });
    expect(prismaMock.rides_v2.create).not.toHaveBeenCalled();
    expect(quoteMock).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('replays an existing priced ride without creating or dispatching twice', async () => {
    prismaMock.rides_v2.findFirst.mockResolvedValueOnce(officialRide());
    const res = await request(app).post('/api/v2/rides')
      .set('Idempotency-Key', 'existing-priced')
      .send(requestBody());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ride_id: 'ride-445-dispatch', status: 'requested' });
    expect(prismaMock.rides_v2.create).not.toHaveBeenCalled();
    expect(quoteMock).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('keeps the normal priced CAR creation working and schedules one dispatch', async () => {
    const res = await request(app).post('/api/v2/rides').send(requestBody());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ quoted_price: 23, ride_id: 'ride-445-dispatch' });
    await vi.waitFor(() => expect(dispatchRideMock).toHaveBeenCalledTimes(1));
  });

  it('still rejects CARE before any pricing or DB write', async () => {
    const res = await request(app).post('/api/v2/rides')
      .send(requestBody({ service_category: 'CARE_ASSISTED' }));
    expect(res.status).toBe(403);
    expect(quoteMock).not.toHaveBeenCalled();
    expect(prismaMock.rides_v2.create).not.toHaveBeenCalled();
  });
});
