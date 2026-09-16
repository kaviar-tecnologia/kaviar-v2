import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => {
  const prismaMock: any = {
    neighborhoods: {
      findUnique: vi.fn(),
    },
    driver_status: {
      findMany: vi.fn(),
    },
  };

  return { prismaMock };
});

const canDriverOperateInMunicipalityMock = vi.hoisted(() => vi.fn());
const resolveTerritoryMock = vi.hoisted(() => vi.fn());
const municipalGateEnabled = vi.hoisted(() => ({ value: true }));

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
  canDriverOperateInMunicipality: canDriverOperateInMunicipalityMock,
  mapServiceCategoryToMunicipalModality: () => 'CAR',
}));
vi.mock('../src/services/territory-resolver.service', () => ({
  resolveTerritory: resolveTerritoryMock,
}));
vi.mock('../src/config', () => ({
  config: {
    driverEnforcement: {
      get municipalRegulatoryGateEnabled() {
        return municipalGateEnabled.value;
      },
    },
  },
}));

import { DispatcherService } from '../src/services/dispatcher.service';

describe('dispatcher municipal fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    municipalGateEnabled.value = true;
    prismaMock.driver_status.findMany.mockResolvedValue([]);
    prismaMock.neighborhoods.findUnique.mockResolvedValue(null);
    resolveTerritoryMock.mockResolvedValue({ resolved: false, neighborhood: null });
    canDriverOperateInMunicipalityMock.mockResolvedValue({ allowed: true, reason: null, municipal: null });
  });

  it('não seleciona candidatos quando não consegue resolver município da corrida', async () => {
    const dispatcher = new DispatcherService();

    const ride: any = {
      id: 'ride-1',
      origin_lat: -21.0,
      origin_lng: -47.0,
      service_category: 'CAR_NORMAL',
      origin_neighborhood_id: null,
      dest_neighborhood_id: null,
      passenger: { neighborhood_id: null, community_id: null },
    };

    const result = await (dispatcher as any).findCandidates(ride);

    expect(result).toEqual([]);
    expect(canDriverOperateInMunicipalityMock).not.toHaveBeenCalled();
  });

  it('usa fallback por coordenadas quando possível e aplica gate municipal', async () => {
    const dispatcher = new DispatcherService();

    resolveTerritoryMock.mockResolvedValue({
      resolved: true,
      neighborhood: { id: 'nb-1', name: 'Centro' },
      community: null,
      method: 'neighborhood',
      srid: 4326,
    });

    prismaMock.neighborhoods.findUnique.mockResolvedValue({
      city: 'Santa Rita do Passa Quatro',
      territory: { uf: 'SP' },
    });

    prismaMock.driver_status.findMany.mockResolvedValue([
      {
        driver_id: 'driver-1',
        availability: 'online',
        driver: {
          vehicle_type: 'CAR',
          neighborhood_id: 'nb-1',
          community_id: null,
          women_preference_eligible: false,
          women_matching_opt_in: false,
          driver_location: {
            lat: -21.0001,
            lng: -47.0001,
            updated_at: new Date(),
          },
        },
      },
    ]);

    canDriverOperateInMunicipalityMock.mockResolvedValue({
      allowed: false,
      reason: 'Aguardando autorização municipal aprovada e válida.',
      municipal: { hasRegulation: true, municipalStatus: 'DOCUMENTS_PENDING' },
    });

    const ride: any = {
      id: 'ride-2',
      origin_lat: -21.0,
      origin_lng: -47.0,
      service_category: 'CAR_NORMAL',
      origin_neighborhood_id: null,
      dest_neighborhood_id: null,
      origin_community_id: null,
      is_homebound: false,
      passenger: { neighborhood_id: null, community_id: null },
    };

    const result = await (dispatcher as any).findCandidates(ride);

    expect(result).toEqual([]);
    expect(canDriverOperateInMunicipalityMock).toHaveBeenCalledWith(
      'driver-1',
      'Santa Rita do Passa Quatro',
      'SP',
      'CAR',
    );
  });

  it('com gate desligado não filtra candidatos por autorização municipal', async () => {
    municipalGateEnabled.value = false;

    prismaMock.driver_status.findMany.mockResolvedValue([
      {
        driver_id: 'driver-1',
        availability: 'online',
        driver: {
          vehicle_type: 'CAR',
          neighborhood_id: 'nb-1',
          community_id: null,
          women_preference_eligible: false,
          women_matching_opt_in: false,
          driver_location: {
            lat: -21.0001,
            lng: -47.0001,
            updated_at: new Date(),
          },
        },
      },
    ]);

    canDriverOperateInMunicipalityMock.mockResolvedValue({
      allowed: false,
      reason: 'Aguardando autorização municipal aprovada e válida.',
      municipal: { hasRegulation: true, municipalStatus: 'DOCUMENTS_PENDING' },
    });

    const dispatcher = new DispatcherService();

    const ride: any = {
      id: 'ride-3',
      origin_lat: -21.0,
      origin_lng: -47.0,
      service_category: 'CAR_NORMAL',
      origin_neighborhood_id: 'nb-1',
      dest_neighborhood_id: null,
      origin_community_id: null,
      is_homebound: false,
      passenger: { neighborhood_id: null, community_id: null },
    };

    const result = await (dispatcher as any).findCandidates(ride);

    expect(result).toHaveLength(1);
    expect(canDriverOperateInMunicipalityMock).not.toHaveBeenCalled();
  });
});
