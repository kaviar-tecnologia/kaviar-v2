import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, dispatchRideMock, pricingSettleMock, creditDeltaMock, walletActiveMock, walletSettleMock, shadowMock, emitRideMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    drivers: { findUnique: vi.fn() },
    partner_commissions: { upsert: vi.fn() },
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
  pricingSettleMock: vi.fn(),
  creditDeltaMock: vi.fn(),
  walletActiveMock: vi.fn(),
  walletSettleMock: vi.fn(),
  shadowMock: vi.fn(),
  emitRideMock: vi.fn(),
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
    emitToRide: emitRideMock,
  },
}));

vi.mock('../src/services/pricing-engine', () => ({ settle: pricingSettleMock }));
vi.mock('../src/services/credit-cost.service', () => ({
  calculateCreditCost: vi.fn(),
}));
vi.mock('../src/services/credit.service', () => ({
  applyCreditDelta: creditDeltaMock,
}));
vi.mock('../src/services/wallet-shadow.service', () => ({
  shadowCalculate: shadowMock,
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
  WalletSettlementService: class { settleRide = walletSettleMock; },
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
  estimateFeeCentsFromPrice: vi.fn((reais: number) => Math.round(reais * 18)),
  calculateFeeCents: vi.fn((cents: number) => Math.round(cents * 0.18)),
}));

vi.mock('../src/routes/driver-wallet-v2', () => ({
  isWalletV2Enabled: walletActiveMock,
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
  prismaMock.drivers.findUnique.mockResolvedValue(null);
  pricingSettleMock.mockResolvedValue({ final_price: 20, fee_percent: 18, fee_amount: 3.60,
    driver_earnings: 16.40, credit_cost: 0, credit_match_type: 'FLAT_FEE', settlement_territory: 'OUTSIDE', wait_charge_cents: 0 });
  creditDeltaMock.mockResolvedValue({ balance: 100 });
  walletActiveMock.mockResolvedValue(false);
  walletSettleMock.mockResolvedValue({ collected: true });
  shadowMock.mockResolvedValue(undefined);
  prismaMock.rides_v2.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.$transaction.mockImplementation(async (callback: any) => callback({
    rides_v2: { updateMany: prismaMock.rides_v2.updateMany },
    driver_status: { update: vi.fn() },
    passengers: { update: vi.fn() },
  }));
});


const completedRide = (status: 'completed' | 'in_progress' = 'completed', patch: Record<string, any> = {}) => ({
  ...waitRide({ status, wait_requested: false, wait_started_at: null, wait_ended_at: null }),
  passenger_id: 'passenger-1', locked_price: 20, quoted_price: 20,
  origin_neighborhood_id: null, ...patch,
});

describe('CARE-445 — explicit completion recovery after uncertain pricing or fee commit', () => {
  it('reconciles an already completed ride without redoing the status transaction or emitting duplicate status', async () => {
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(completedRide());
    const response = await request(appWait).post('/api/v2/rides/ride-445-wait/complete');
    expect(response.status).toBe(200);
    expect(pricingSettleMock).toHaveBeenCalledWith('ride-445-wait', undefined);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(creditDeltaMock).toHaveBeenCalledWith('driver-1', -3.60,
      'platform_fee:ride-445-wait', 'system', 'fee_ride-445-wait');
    expect(emitRideMock).not.toHaveBeenCalled();
  });

  it('retries a failed pricing close only after a new explicit request; no financial side effect before confirmation', async () => {
    pricingSettleMock.mockRejectedValueOnce(new Error('pricing COMMIT ack unknown'));
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(completedRide('in_progress'))
      .mockResolvedValueOnce(completedRide('completed'));
    const first = await request(appWait).post('/api/v2/rides/ride-445-wait/complete');
    expect(first.status).toBe(503);
    expect(first.body.error).toBe('PRICING_SETTLEMENT_UNCONFIRMED');
    expect(creditDeltaMock).not.toHaveBeenCalled();
    expect(emitRideMock).not.toHaveBeenCalled();

    const second = await request(appWait).post('/api/v2/rides/ride-445-wait/complete');
    expect(second.status).toBe(200);
    expect(pricingSettleMock).toHaveBeenCalledTimes(2);
    expect(creditDeltaMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(emitRideMock).not.toHaveBeenCalled(); // no replay notification: outbox remains a separate gate
  });

  it('returns 503 for failed legacy fee debit and retries with the same idempotency key', async () => {
    creditDeltaMock.mockRejectedValueOnce(new Error('ledger temporarily unavailable'))
      .mockResolvedValueOnce({ balance: 96.40 });
    prismaMock.rides_v2.findUnique.mockResolvedValue(completedRide());
    const first = await request(appWait).post('/api/v2/rides/ride-445-wait/complete');
    expect(first.status).toBe(503);
    expect(first.body.error).toBe('RIDE_FINANCIAL_EFFECTS_UNCONFIRMED');
    const retry = await request(appWait).post('/api/v2/rides/ride-445-wait/complete');
    expect(retry.status).toBe(200);
    expect(creditDeltaMock).toHaveBeenCalledTimes(2);
    expect(creditDeltaMock.mock.calls[0][4]).toBe('fee_ride-445-wait');
    expect(creditDeltaMock.mock.calls[1][4]).toBe('fee_ride-445-wait');
    expect(emitRideMock).not.toHaveBeenCalled();
  });

  it('reuses the confirmed total and locked base when recovering a Wallet V2 wait ride', async () => {
    walletActiveMock.mockResolvedValue(true);
    pricingSettleMock.mockResolvedValue({ final_price: 21.50, fee_percent: 18, fee_amount: 3.60,
      driver_earnings: 17.90, credit_cost: 0, credit_match_type: 'FLAT_FEE',
      settlement_territory: 'OUTSIDE', wait_charge_cents: 150 });
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce(completedRide('completed', {
      wait_requested: true, wait_started_at: new Date('2026-09-29T12:00:00Z'),
      wait_ended_at: new Date('2026-09-29T12:03:00Z'),
    }));
    const response = await request(appWait).post('/api/v2/rides/ride-445-wait/complete');
    expect(response.status).toBe(200);
    expect(walletSettleMock).toHaveBeenCalledWith(expect.objectContaining({
      rideId: 'ride-445-wait', finalPriceCents: 2150n, feeBaseCents: 2000n,
    }));
    expect(emitRideMock).not.toHaveBeenCalled();
  });
});
