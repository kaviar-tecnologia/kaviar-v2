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
    driverId: 'driver-1',
  },
  dispatchRideMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../src/config', () => ({ config: { wait: { enabled: true, ratePerMin: 0.50 } } }));
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
  authenticateDriver: (req: any, _res: any, next: any) => { req.driverId = authState.driverId; next(); },
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


const appWait = express();
appWait.use(express.json());
appWait.use('/api/v2/rides', ridesV2Routes);

const waitRide = (patch: Record<string,any> = {}) => ({
  id: 'ride-445-wait', driver_id: 'driver-1', status: 'in_progress',
  wait_requested: true, wait_started_at: new Date('2026-09-29T12:00:00Z'),
  wait_ended_at: null, ...patch,
});
beforeEach(() => {
  vi.clearAllMocks();
  authState.driverId = 'driver-1';
  prismaMock.rides_v2.findUnique.mockResolvedValue(waitRide());
  prismaMock.rides_v2.updateMany.mockResolvedValue({ count: 1 });
});

describe('CARE-445 — wait timestamps cannot change after completion', () => {
  it('rejects wait/end for a completed ride, without writing a late end time', async () => {
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(waitRide({ status: 'completed' }));
    const response = await request(appWait).post('/api/v2/rides/ride-445-wait/wait/end');
    expect(response.status).toBe(400);
    expect(prismaMock.rides_v2.updateMany).not.toHaveBeenCalled();
  });

  it('uses a conditional wait/end write and does not report success if complete won the race', async () => {
    prismaMock.rides_v2.updateMany.mockResolvedValueOnce({ count: 0 });
    const response = await request(appWait).post('/api/v2/rides/ride-445-wait/wait/end');
    expect(response.status).toBe(409);
    expect(prismaMock.rides_v2.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ride-445-wait', driver_id: 'driver-1', status: 'in_progress',
        wait_requested: true, wait_started_at: { not: null }, wait_ended_at: null,
      },
      data: { wait_ended_at: expect.any(Date) },
    });
  });

  it('rejects wait/end when waiting was never requested', async () => {
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(waitRide({ wait_requested: false }));
    const response = await request(appWait).post('/api/v2/rides/ride-445-wait/wait/end');
    expect(response.status).toBe(400);
    expect(prismaMock.rides_v2.updateMany).not.toHaveBeenCalled();
  });

  it('records one wait/end for an in-progress ride, not an unconditional update', async () => {
    const response = await request(appWait).post('/api/v2/rides/ride-445-wait/wait/end');
    expect(response.status).toBe(200);
    expect(prismaMock.rides_v2.updateMany).toHaveBeenCalledTimes(1);
  });

  it('uses a one-time conditional wait/start write so start cannot race against complete', async () => {
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(waitRide({ wait_started_at: null }));
    prismaMock.rides_v2.updateMany.mockResolvedValueOnce({ count: 0 });
    const response = await request(appWait).post('/api/v2/rides/ride-445-wait/wait/start');
    expect(response.status).toBe(409);
    expect(prismaMock.rides_v2.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ride-445-wait', driver_id: 'driver-1', status: 'in_progress',
        wait_requested: true, wait_started_at: null,
      },
      data: { wait_started_at: expect.any(Date) },
    });
  });
});
