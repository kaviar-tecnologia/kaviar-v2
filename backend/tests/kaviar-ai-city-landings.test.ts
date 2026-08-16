import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

import { getDriverCityLandings } from '../src/services/ai/kaviar-ai.city-landings';
import { routeByRules } from '../src/services/ai/kaviar-ai.router';

const rows = [
  {
    city: 'Santa Cruz das Palmeiras',
    state: 'SP',
    slug: 'santa-cruz-das-palmeiras-sp',
    public_status: 'IMPLANTACAO',
    landing_enabled: true,
  },
  {
    city: 'Tambaú',
    state: 'SP',
    slug: 'tambau-sp',
    public_status: 'RECRUTAMENTO',
    landing_enabled: true,
  },
  {
    city: 'Pirassununga',
    state: 'SP',
    slug: 'pirassununga-sp',
    public_status: 'IMPLANTACAO',
    landing_enabled: false,
  },
];

describe('driver_city_landings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('roteia perguntas sobre landing de motoristas para a tool correta', () => {
    expect(
      routeByRules('Qual é a landing de Tambaú?').toolsToCall
    ).toEqual(['driver_city_landings']);

    expect(
      routeByRules('Quais cidades têm landing ativa?').toolsToCall
    ).toEqual(['driver_city_landings']);

    expect(
      routeByRules('Libere a landing de Araraquara/SP').toolsToCall
    ).toEqual(['territory_onboarding_status', 'driver_city_landings']);
  });

  it('localiza cidade citada e devolve URL pública real', async () => {
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await getDriverCityLandings({
      question: 'Qual é a landing de Tambaú?',
    });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].city).toBe('Tambaú');
    expect(result.data.items[0].url).toBe(
      'https://kaviar.com.br/motorista/cidade/tambau-sp'
    );
    expect(result.data.items[0].landingEnabled).toBe(true);
  });

  it('retorna vazio quando a cidade solicitada não possui landing cadastrada', async () => {
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await getDriverCityLandings({
      question: 'Qual é a landing de Campinas?',
    });

    expect(result.data.matched).toBe(0);
    expect(result.data.items).toEqual([]);
  });

  it('lista somente landings habilitadas quando solicitado', async () => {
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await getDriverCityLandings({
      question: 'Quais cidades têm landing ativa?',
    });

    expect(result.data.total).toBe(3);
    expect(result.data.active).toBe(2);
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items.every((item) => item.landingEnabled)).toBe(true);
  });
});
