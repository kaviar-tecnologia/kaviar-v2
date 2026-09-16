import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    driver_status: {
      findMany: vi.fn(),
    },
  } as any,
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../src/services/favorites-matching.service', () => ({
  rankDriversByFavorites: (candidates: any[]) => candidates,
}));

vi.mock('../src/services/credit.service', () => ({
  getCreditBalance: vi.fn(),
}));

vi.mock('../src/services/pricing-engine', () => ({
  isFlatFeeEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/services/municipal-regulation.service', () => ({
  canDriverOperateInMunicipality: vi.fn().mockResolvedValue({
    allowed: true,
    reason: null,
    municipal: null,
  }),
  mapServiceCategoryToMunicipalModality: () => 'CAR',
}));

vi.mock('../src/services/territory-resolver.service', () => ({
  resolveTerritory: vi.fn(),
}));

vi.mock('../src/config', () => ({
  config: {
    driverEnforcement: {
      municipalRegulatoryGateEnabled: false,
    },
  },
}));

import { DispatcherService } from '../src/services/dispatcher.service';

function driver(
  id: string,
  neighborhoodId: string | null,
  communityId: string | null,
  lat = -22.9001,
  lng = -43.2001,
) {
  return {
    driver_id: id,
    availability: 'online',
    driver: {
      vehicle_type: 'CAR',
      neighborhood_id: neighborhoodId,
      community_id: communityId,
      women_preference_eligible: false,
      women_matching_opt_in: false,
      driver_location: {
        lat,
        lng,
        updated_at: new Date(),
      },
    },
  };
}

function ride(overrides: Record<string, any> = {}) {
  return {
    id: 'ride-test',
    passenger_id: 'passenger-1',
    origin_lat: -22.9000,
    origin_lng: -43.2000,
    service_category: 'CAR_NORMAL',

    origin_neighborhood_id: 'origin-neighborhood',
    origin_community_id: 'origin-community',

    is_homebound: false,
    outside_fallback_allowed: false,
    outside_fallback_consented_at: null,

    passenger: {
      neighborhood_id: 'home-neighborhood',
      community_id: 'home-community',
    },

    ...overrides,
  };
}

describe('dispatcher strict community matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.CREDIT_GATE_ENABLED = 'false';
    process.env.WOMEN_DRIVER_PREFERENCE_ENABLED = 'false';
    process.env.FAVORITES_WEIGHT = '0';
    delete process.env.DEV_GEOFENCE_BOOST;
  });

  it('permite motorista da mesma comunidade em corrida normal', async () => {
    prismaMock.driver_status.findMany.mockResolvedValue([
      driver('driver-community', 'other-neighborhood', 'origin-community'),
    ]);

    const dispatcher = new DispatcherService();
    const result = await (dispatcher as any).findCandidates(ride());

    expect(result).toHaveLength(1);
    expect(result[0].driver_id).toBe('driver-community');
    expect(result[0].same_community).toBe(true);
  });

  it('permite motorista do mesmo bairro em corrida normal', async () => {
    prismaMock.driver_status.findMany.mockResolvedValue([
      driver('driver-neighborhood', 'origin-neighborhood', 'other-community'),
    ]);

    const dispatcher = new DispatcherService();
    const result = await (dispatcher as any).findCandidates(ride());

    expect(result).toHaveLength(1);
    expect(result[0].driver_id).toBe('driver-neighborhood');
    expect(result[0].same_community).toBe(false);
    expect(result[0].same_neighborhood).toBe(true);
  });

  it('bloqueia OUTSIDE em corrida normal e não usa a residência do passageiro como fallback', async () => {
    prismaMock.driver_status.findMany.mockResolvedValue([
      // O motorista pertence à comunidade residencial do passageiro,
      // mas não ao território da origem da corrida.
      driver('driver-home-community', 'home-neighborhood', 'home-community'),
    ]);

    const dispatcher = new DispatcherService();
    const result = await (dispatcher as any).findCandidates(ride());

    expect(result).toEqual([]);
  });

  it('em homebound usa o território residencial do passageiro', async () => {
    prismaMock.driver_status.findMany.mockResolvedValue([
      driver('driver-home', 'home-neighborhood', 'home-community'),
    ]);

    const dispatcher = new DispatcherService();
    const result = await (dispatcher as any).findCandidates(
      ride({
        is_homebound: true,
        origin_neighborhood_id: 'away-neighborhood',
        origin_community_id: 'away-community',
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].driver_id).toBe('driver-home');
    expect(result[0].same_community).toBe(true);
  });

  it('bloqueia OUTSIDE em homebound sem consentimento', async () => {
    prismaMock.driver_status.findMany.mockResolvedValue([
      driver('driver-outside', 'outside-neighborhood', 'outside-community'),
    ]);

    const dispatcher = new DispatcherService();
    const result = await (dispatcher as any).findCandidates(
      ride({
        is_homebound: true,
      }),
    );

    expect(result).toEqual([]);
  });

  it('bloqueia OUTSIDE se booleano estiver true mas não houver timestamp de consentimento', async () => {
    prismaMock.driver_status.findMany.mockResolvedValue([
      driver('driver-outside', 'outside-neighborhood', 'outside-community'),
    ]);

    const dispatcher = new DispatcherService();
    const result = await (dispatcher as any).findCandidates(
      ride({
        is_homebound: true,
        outside_fallback_allowed: true,
        outside_fallback_consented_at: null,
      }),
    );

    expect(result).toEqual([]);
  });

  it('permite OUTSIDE em homebound somente após consentimento registrado', async () => {
    prismaMock.driver_status.findMany.mockResolvedValue([
      driver('driver-outside', 'outside-neighborhood', 'outside-community'),
    ]);

    const dispatcher = new DispatcherService();
    const result = await (dispatcher as any).findCandidates(
      ride({
        is_homebound: true,
        outside_fallback_allowed: true,
        outside_fallback_consented_at: new Date(),
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].driver_id).toBe('driver-outside');
    expect(result[0].same_community).toBe(false);
    expect(result[0].same_neighborhood).toBe(false);
  });

  it('mantém prioridade COMMUNITY → NEIGHBORHOOD → OUTSIDE após consentimento', async () => {
    prismaMock.driver_status.findMany.mockResolvedValue([
      driver('driver-outside', 'outside-neighborhood', 'outside-community'),
      driver('driver-neighborhood', 'home-neighborhood', 'other-community'),
      driver('driver-community', 'other-neighborhood', 'home-community'),
    ]);

    const dispatcher = new DispatcherService();
    const result = await (dispatcher as any).findCandidates(
      ride({
        is_homebound: true,
        outside_fallback_allowed: true,
        outside_fallback_consented_at: new Date(),
      }),
    );

    expect(result.map((candidate: any) => candidate.driver_id)).toEqual([
      'driver-community',
      'driver-neighborhood',
      'driver-outside',
    ]);
  });
});
