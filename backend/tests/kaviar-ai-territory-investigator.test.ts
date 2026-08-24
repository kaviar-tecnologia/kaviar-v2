import { describe, expect, it } from 'vitest';
import {
  isTerritoryManagerInvestigation,
  formatTerritoryManagerInvestigation,
  type TerritoryManagerInvestigationData,
} from '../src/services/ai/kaviar-ai.territory-investigator';

describe('Territory Manager Investigator v1', () => {
  it('reconhece pergunta investigativa sobre gestor', () => {
    expect(
      isTerritoryManagerInvestigation(
        'Investigue por que Salvador/BA está sem gestor.'
      )
    ).toBe(true);
  });

  it('explica ausência de histórico e recomenda vincular gestor', () => {
    const data: TerritoryManagerInvestigationData = {
      available: true,
      found: true,
      city: 'Salvador',
      uf: 'BA',
      coverage: {
        available: true,
        found: true,
        city: 'Salvador',
        uf: 'BA',
        territory: {
          id: 'territory-1',
          name: 'Salvador',
          status: 'active',
          isActive: true,
        },
        coverageStatus: 'AWAITING_REVIEW',
        officialNeighborhoods: 8,
        activeRegions: 1,
        managers: [],
        uncoveredRegions: [{ id: 'region-1', name: 'Beiru/Tancredo Neves' }],
        neighborhoodsPerManager: 20,
        recommendedByNeighborhoods: 1,
        recommendedManagers: 1,
        additionalManagers: 1,
        hasRoomForMoreManagers: true,
        provisional: true,
        referenceTime: '2026-08-23 23:30',
      },
      history: [],
    };

    const answer = formatTerritoryManagerInvestigation(data);

    expect(answer).toContain('Nenhum assignment de gestor encontrado');
    expect(answer).toContain('Vincular um gestor ativo');
    expect(answer).toContain('homologar a cobertura territorial');
  });

  it('identifica assignment ativo ligado a admin inativo', () => {
    const base: TerritoryManagerInvestigationData = {
      available: true,
      found: true,
      city: 'Salvador',
      uf: 'BA',
      coverage: {
        available: true,
        found: true,
        city: 'Salvador',
        uf: 'BA',
        territory: {
          id: 'territory-1',
          name: 'Salvador',
          status: 'active',
          isActive: true,
        },
        coverageStatus: 'COMPLETE',
        officialNeighborhoods: 8,
        activeRegions: 1,
        managers: [],
        uncoveredRegions: [],
        neighborhoodsPerManager: 20,
        recommendedByNeighborhoods: 1,
        recommendedManagers: 1,
        additionalManagers: 1,
        hasRoomForMoreManagers: true,
        provisional: false,
        referenceTime: '2026-08-23 23:30',
      },
      history: [{
        assignmentId: 'assignment-1',
        assignmentStatus: 'active',
        startedAt: '2026-01-01T00:00:00.000Z',
        endedAt: null,
        endReason: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
        adminId: 'admin-1',
        adminName: 'Gestor Teste',
        adminActive: false,
        territoryName: 'Salvador',
        territoryLevel: 'city',
        territoryActive: true,
      }],
    };

    const answer = formatTerritoryManagerInvestigation(base);

    expect(answer).toContain('admin está inativo');
    expect(answer).toContain('Regularizar/encerrar o assignment inconsistente');
  });
});
