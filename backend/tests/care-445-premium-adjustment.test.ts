import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, dispatchRideMock, txMock, refineMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    drivers: { findUnique: vi.fn() },
    passengers: { findUnique: vi.fn() },
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
  refineMock: vi.fn(),
  txMock: {
    $queryRaw: vi.fn(), $executeRaw: vi.fn(),
    rides_v2: { updateMany: vi.fn() },
    ride_offers: { findUnique: vi.fn(), updateMany: vi.fn() },
    driver_status: { update: vi.fn() },
  } as any,
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

vi.mock('../src/services/pricing-engine', () => ({ refine: refineMock }));
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


const normal = () => ({
  id: 'ride-premium-445', passenger_id: 'passenger-1', driver_id: 'driver-1',
  ride_type: 'normal', service_category: 'CAR_NORMAL', trip_details: null,
  status: 'pending_adjustment', quoted_price: '23.00', locked_price: '23.00',
  platform_fee: '4.14', driver_earnings: '18.86', pricing_profile_id: 'profile-1',
  adjusted_price: '25.00', driver_adjustment: '2.00',
});
const offer = () => ({
  id: 'offer-premium-445', ride_id: 'ride-premium-445', driver_id: 'driver-1',
  status: 'accepted', adjustment_status: 'pending', driver_adjustment: '2.00',
});
const settlement = () => ({
  ride_id: 'ride-premium-445', quoted_price: '23.00', locked_price: '23.00',
  pricing_profile_id: 'profile-1', fee_percent: '18.00',
  fee_amount: '4.14', driver_earnings: '18.86', settled_at: null,
  quoted_at: new Date('2026-09-29T12:00:00Z'), locked_at: new Date('2026-09-29T12:00:00Z'),
});
let locked: Record<string,any>, economic: Record<string,any>, currentOffer: Record<string,any>;

const appAdjustment = express();
appAdjustment.use(express.json());
appAdjustment.use('/api/v2/rides', ridesV2Routes);

beforeEach(() => {
  vi.clearAllMocks();
  authState.passengerId = 'passenger-1';
  locked = normal();
  economic = settlement();
  currentOffer = offer();
  prismaMock.rides_v2.findUnique.mockImplementation(async () => ({
    ...locked, offers: [currentOffer],
  }));
  prismaMock.$transaction.mockImplementation(async (callback: any) => callback(txMock));
  txMock.$queryRaw.mockImplementation(async (query: TemplateStringsArray) => {
    const sql = query.join(' ');
    if (sql.includes('FROM rides_v2')) return [locked];
    if (sql.includes('FROM ride_settlements')) return [economic];
    return [];
  });
  txMock.$executeRaw.mockResolvedValue(1);
  txMock.ride_offers.findUnique.mockImplementation(async () => currentOffer);
  txMock.ride_offers.updateMany.mockResolvedValue({ count: 1 });
  txMock.rides_v2.updateMany.mockResolvedValue({ count: 1 });
  txMock.driver_status.update.mockResolvedValue({});
  prismaMock.drivers.findUnique.mockResolvedValue(null);
  prismaMock.passengers.findUnique.mockResolvedValue(null);
  dispatchRideMock.mockResolvedValue(undefined);
  refineMock.mockResolvedValue(undefined);
});

const send = (accept: boolean) => request(appAdjustment)
  .post('/api/v2/rides/ride-premium-445/adjustment-response').send({ accept });

describe('CARE-445 Premium adjustment uses the official economic snapshot', () => {
  it('accepts one valid conventional adjustment and commits offer, settlement, and cache together', async () => {
    const res = await send(true);
    expect(res.status).toBe(200);
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(txMock.ride_offers.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'offer-premium-445', adjustment_status: 'pending' }),
    }));
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = txMock.$executeRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('UPDATE ride_settlements');
    expect(sql).toContain('fee_amount');
    expect(sql).toContain('driver_earnings');
    const values = txMock.$executeRaw.mock.calls[0].slice(1).map(String);
    expect(values).toContain('25');
    expect(values).toContain('4.5');
    expect(values).toContain('20.5');
    expect(txMock.rides_v2.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'ride-premium-445', status: 'pending_adjustment' }),
      data: expect.objectContaining({
        status: 'accepted', locked_price: expect.anything(),
        platform_fee: expect.anything(), driver_earnings: expect.anything(),
      }),
    }));
    const data = txMock.rides_v2.updateMany.mock.calls[0][0].data;
    expect([data.locked_price, data.platform_fee, data.driver_earnings].map(Number))
      .toEqual([25, 4.5, 20.5]);
  });

  it('rejects a second simultaneous response when the pending state changed', async () => {
    txMock.rides_v2.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await send(true);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: 'ADJUSTMENT_CONFLICT' });
    expect(refineMock).not.toHaveBeenCalled();
  });

  it('rejects a settlement with mismatched locked price or fee before mutation', async () => {
    economic.locked_price = '24.00';
    const res = await send(true);
    expect(res.status).toBe(409);
    expect(txMock.ride_offers.updateMany).not.toHaveBeenCalled();
    expect(txMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('fails closed and never accepts if the settlement does not exist', async () => {
    txMock.$queryRaw.mockImplementation(async (query: TemplateStringsArray) =>
      query.join(' ').includes('FROM rides_v2') ? [locked] : []);
    const res = await send(true);
    expect(res.status).toBe(409);
    expect(txMock.ride_offers.updateMany).not.toHaveBeenCalled();
    expect(txMock.rides_v2.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a disguised CARE conversion under the decisive ride lock', async () => {
    locked.ride_type = 'care';
    locked.service_category = 'CARE_ASSISTED';
    prismaMock.rides_v2.findUnique.mockResolvedValueOnce({ ...normal(), offers: [offer()] });
    const res = await send(true);
    expect(res.status).toBe(403);
    expect(txMock.ride_offers.updateMany).not.toHaveBeenCalled();
  });

  it('the rejection branch also requires a conditional one-time transition', async () => {
    const res = await send(false);
    expect(res.status).toBe(200);
    expect(txMock.ride_offers.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ adjustment_status: 'pending' }),
      data: { adjustment_status: 'rejected' },
    }));
    expect(txMock.rides_v2.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'pending_adjustment' }),
      data: expect.objectContaining({ status: 'requested' }),
    }));
    expect(txMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not release a driver or redispatch a rejected adjustment after losing the race', async () => {
    txMock.rides_v2.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await send(false);
    expect(res.status).toBe(409);
    expect(txMock.driver_status.update).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('does not acknowledge an accepted adjustment if official settlement update affects zero rows', async () => {
    txMock.$executeRaw.mockResolvedValueOnce(0);
    const res = await send(true);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ADJUSTMENT_CONFLICT');
    expect(refineMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid fractional-cent adjustment without changing the offer', async () => {
    currentOffer.driver_adjustment = '2.001';
    const res = await send(true);
    expect(res.status).toBe(409);
    expect(txMock.$executeRaw).not.toHaveBeenCalled();
  });
});
