import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  authState,
  dispatchRideMock,
  quoteMock,
  createRideWithRequirementsMock,
  getRouteDistanceMock,
  resolveTerritoryMock,
  getFloorForRouteMock,
  resolveProfileMock,
  haversineKmMock,
  classifyRouteFromIdsMock,
} = vi.hoisted(() => ({
  prismaMock: {
    feature_flag_allowlist: {
      findUnique: vi.fn(),
    },
    rides_v2: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    passengers: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    driver_documents: {
      findUnique: vi.fn(),
    },
  } as any,
  authState: {
    passengerId: 'passenger-session',
  },
  dispatchRideMock: vi.fn(),
  quoteMock: vi.fn(),
  createRideWithRequirementsMock: vi.fn(),
  getRouteDistanceMock: vi.fn(),
  resolveTerritoryMock: vi.fn(),
  getFloorForRouteMock: vi.fn(),
  resolveProfileMock: vi.fn(),
  haversineKmMock: vi.fn(),
  classifyRouteFromIdsMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../src/config', () => ({ config: { wait: { enabled: false, ratePerMin: 1 } } }));
vi.mock('../src/config/s3-upload', () => ({ getPresignedUrl: vi.fn() }));
vi.mock('../src/modules/whatsapp', () => ({ whatsappEvents: {} }));

vi.mock('../src/services/dispatcher.service', () => ({
  dispatcherService: {
    dispatchRide: dispatchRideMock,
  },
}));

vi.mock('../src/services/care/care-ride-create', () => ({
  createRideWithRequirements: createRideWithRequirementsMock,
}));

vi.mock('../src/services/territory-resolver.service', () => ({
  resolveTerritory: resolveTerritoryMock,
}));

vi.mock('../src/services/realtime.service', () => ({
  realTimeService: {
    emitToDriver: vi.fn(),
    emitToRide: vi.fn(),
  },
}));

vi.mock('../src/services/pricing-engine', () => ({
  quote: quoteMock,
  resolveProfile: resolveProfileMock,
  haversineKm: haversineKmMock,
  classifyRouteFromIds: classifyRouteFromIdsMock,
  refine: vi.fn(),
  settle: vi.fn(),
}));

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
  getRouteDistance: getRouteDistanceMock,
}));

vi.mock('../src/services/territory-floor.service', () => ({
  getFloorForRoute: getFloorForRouteMock,
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

const normalBody = (patch: Record<string, any> = {}) => ({
  origin: { lat: -22.97, lng: -43.2, text: 'Origem' },
  destination: { lat: -22.95, lng: -43.18, text: 'Destino' },
  service_category: 'CAR_NORMAL',
  ...patch,
});

const careBody = (patch: Record<string, any> = {}) => normalBody({
  service_category: 'CARE_MOBILITY',
  trip_details: {
    care: {
      assistance_required: true,
      mobility_assistance: true,
    },
  },
  ...patch,
});

describe('CARE-490 rides-v2 blocked preflight behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authState.passengerId = 'passenger-session';

    prismaMock.feature_flag_allowlist.findUnique.mockResolvedValue(null);
    prismaMock.rides_v2.findFirst.mockResolvedValue(null);
    prismaMock.rides_v2.findUnique.mockResolvedValue(null);
    prismaMock.rides_v2.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.rides_v2.update.mockResolvedValue({});
    prismaMock.passengers.findUnique.mockResolvedValue(null);
    prismaMock.driver_documents.findUnique.mockResolvedValue(null);

    createRideWithRequirementsMock.mockResolvedValue({
      id: 'ride-normal',
      status: 'requested',
    });

    quoteMock.mockResolvedValue({
      quoted_price: 23,
      fee_percent: 18,
      fee_amount: 4.14,
      driver_earnings: 18.86,
      route_territory: 'local',
      distance_km: 10,
      pricing_profile_slug: 'car',
    });

    getRouteDistanceMock.mockResolvedValue({
      distance_km: 10,
      duration_min: 20,
    });

    resolveTerritoryMock.mockResolvedValue({
      neighborhood: null,
      community: null,
    });

    getFloorForRouteMock.mockResolvedValue(null);

    resolveProfileMock.mockResolvedValue({
      slug: 'car-normal',
      base_fare: 6,
      per_km: 2,
      per_minute: 0.5,
      minimum_fare: 12,
      surcharge_external: 0,
    });

    haversineKmMock.mockReturnValue(10);
    classifyRouteFromIdsMock.mockReturnValue('local');
    dispatchRideMock.mockResolvedValue(undefined);
  });

  it('blocks CARE estimate before route distance, pricing or quote work', async () => {
    const res = await request(app)
      .post('/api/v2/rides/estimate')
      .send(careBody());

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: 'CARE_SERVICE_NOT_AVAILABLE',
    });

    expect(prismaMock.feature_flag_allowlist.findUnique).toHaveBeenCalledWith({
      where: {
        key_passenger_id: {
          key: 'CARE_INTERNAL_PILOT',
          passenger_id: 'passenger-session',
        },
      },
      select: { id: true },
    });

    expect(getRouteDistanceMock).not.toHaveBeenCalled();
    expect(resolveProfileMock).not.toHaveBeenCalled();
    expect(quoteMock).not.toHaveBeenCalled();
    expect(createRideWithRequirementsMock).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('uses authenticated passengerId, never passengerId injected in request body', async () => {
    authState.passengerId = 'real-session-passenger';

    prismaMock.feature_flag_allowlist.findUnique.mockImplementation(async ({ where }: any) => {
      const passengerId = where.key_passenger_id.passenger_id;
      return passengerId === 'body-injected-passenger' ? { id: 'body-allowlist-row' } : null;
    });

    const res = await request(app)
      .post('/api/v2/rides/estimate')
      .send(careBody({
        passengerId: 'body-injected-passenger',
      }));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CARE_SERVICE_NOT_AVAILABLE');

    expect(prismaMock.feature_flag_allowlist.findUnique).toHaveBeenCalledWith({
      where: {
        key_passenger_id: {
          key: 'CARE_INTERNAL_PILOT',
          passenger_id: 'real-session-passenger',
        },
      },
      select: { id: true },
    });

    expect(prismaMock.feature_flag_allowlist.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          key_passenger_id: expect.objectContaining({
            passenger_id: 'body-injected-passenger',
          }),
        }),
      }),
    );
  });

  it('still blocks CARE create even when authenticated passenger is allowlisted', async () => {
    prismaMock.feature_flag_allowlist.findUnique.mockResolvedValue({ id: 'allowlist-row' });

    const res = await request(app)
      .post('/api/v2/rides')
      .send(careBody());

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: 'CARE_SERVICE_NOT_AVAILABLE',
    });

    expect(prismaMock.feature_flag_allowlist.findUnique).toHaveBeenCalledWith({
      where: {
        key_passenger_id: {
          key: 'CARE_INTERNAL_PILOT',
          passenger_id: 'passenger-session',
        },
      },
      select: { id: true },
    });

    expect(prismaMock.rides_v2.findFirst).not.toHaveBeenCalled();
    expect(createRideWithRequirementsMock).not.toHaveBeenCalled();
    expect(quoteMock).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });

  it('preserves normal estimate flow without querying CARE_INTERNAL_PILOT allowlist', async () => {
    const res = await request(app)
      .post('/api/v2/rides/estimate')
      .send(normalBody());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      distance_km: 10,
      duration_min: 20,
      route_territory: 'local',
      pricing_profile: 'car-normal',
      pricing_source: 'google_route',
    });

    expect(prismaMock.feature_flag_allowlist.findUnique).not.toHaveBeenCalled();
    expect(getRouteDistanceMock).toHaveBeenCalled();
    expect(resolveProfileMock).toHaveBeenCalled();
    expect(createRideWithRequirementsMock).not.toHaveBeenCalled();
    expect(dispatchRideMock).not.toHaveBeenCalled();
  });
});
