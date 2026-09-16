import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    rides_v2: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
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
  canDriverOperateInMunicipality: vi.fn(),
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

const consentedAt = new Date('2026-09-16T03:00:00.000Z');

function failedOffer(id: string, createdAt: Date) {
  return {
    id,
    driver_id: `driver-${id}`,
    status: 'rejected',
    created_at: createdAt,
  };
}

function baseRide(overrides: Record<string, any> = {}) {
  return {
    id: 'ride-window',
    status: 'requested',
    is_homebound: true,
    outside_fallback_allowed: true,
    outside_fallback_consented_at: consentedAt,
    offers: [],
    passenger: {
      neighborhood_id: 'home-neighborhood',
      community_id: 'home-community',
    },
    ...overrides,
  };
}

describe('dispatcher attempt windows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.rides_v2.update.mockResolvedValue({});
  });

  it('não deixa 5 falhas anteriores ao consentimento consumirem a nova janela', async () => {
    const before = new Date('2026-09-16T02:50:00.000Z');

    prismaMock.rides_v2.findUnique.mockResolvedValue(
      baseRide({
        offers: Array.from({ length: 5 }, (_, i) =>
          failedOffer(`before-${i}`, before),
        ),
      }),
    );

    const dispatcher = new DispatcherService();
    const findCandidates = vi
      .spyOn(dispatcher as any, 'findCandidates')
      .mockResolvedValue([]);

    await dispatcher.dispatchRide('ride-window');

    expect(findCandidates).toHaveBeenCalledTimes(1);
  });

  it('permite continuar enquanto houver menos de 5 falhas depois do consentimento', async () => {
    const before = new Date('2026-09-16T02:50:00.000Z');
    const after = new Date('2026-09-16T03:05:00.000Z');

    prismaMock.rides_v2.findUnique.mockResolvedValue(
      baseRide({
        offers: [
          ...Array.from({ length: 5 }, (_, i) =>
            failedOffer(`before-${i}`, before),
          ),
          ...Array.from({ length: 4 }, (_, i) =>
            failedOffer(`after-${i}`, after),
          ),
        ],
      }),
    );

    const dispatcher = new DispatcherService();
    const findCandidates = vi
      .spyOn(dispatcher as any, 'findCandidates')
      .mockResolvedValue([]);

    await dispatcher.dispatchRide('ride-window');

    expect(findCandidates).toHaveBeenCalledTimes(1);
  });

  it('encerra a segunda janela após 5 falhas ocorridas depois do consentimento', async () => {
    const before = new Date('2026-09-16T02:50:00.000Z');
    const after = new Date('2026-09-16T03:05:00.000Z');

    prismaMock.rides_v2.findUnique.mockResolvedValue(
      baseRide({
        offers: [
          ...Array.from({ length: 5 }, (_, i) =>
            failedOffer(`before-${i}`, before),
          ),
          ...Array.from({ length: 5 }, (_, i) =>
            failedOffer(`after-${i}`, after),
          ),
        ],
      }),
    );

    const dispatcher = new DispatcherService();
    const findCandidates = vi
      .spyOn(dispatcher as any, 'findCandidates')
      .mockResolvedValue([]);

    await dispatcher.dispatchRide('ride-window');

    expect(findCandidates).not.toHaveBeenCalled();
    expect(prismaMock.rides_v2.update).toHaveBeenCalledWith({
      where: { id: 'ride-window' },
      data: { status: 'no_driver' },
    });
  });

  it('sem fallback ativo mantém o limite normal de 5 tentativas', async () => {
    const before = new Date('2026-09-16T02:50:00.000Z');

    prismaMock.rides_v2.findUnique.mockResolvedValue(
      baseRide({
        outside_fallback_allowed: false,
        outside_fallback_consented_at: null,
        offers: Array.from({ length: 5 }, (_, i) =>
          failedOffer(`normal-${i}`, before),
        ),
      }),
    );

    const dispatcher = new DispatcherService();
    const findCandidates = vi
      .spyOn(dispatcher as any, 'findCandidates')
      .mockResolvedValue([]);

    await dispatcher.dispatchRide('ride-window');

    expect(findCandidates).not.toHaveBeenCalled();
  });
});
