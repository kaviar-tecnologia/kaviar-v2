import { pool } from '../../db';

export type DriverCityLandingItem = {
  city: string;
  state: string;
  slug: string;
  publicStatus: string;
  landingEnabled: boolean;
  url: string;
};

export type DriverCityLandingsData = {
  available: boolean;
  total: number;
  active: number;
  matched: number;
  items: DriverCityLandingItem[];
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Consulta read-only das landing pages de captação de motoristas por cidade.
 *
 * A pergunta original é usada somente para localizar uma cidade citada
 * e/ou restringir a landings ativas.
 */
export async function getDriverCityLandings(
  args?: Record<string, string>
): Promise<{ tool: 'driver_city_landings'; data: DriverCityLandingsData }> {
  const result = await pool.query<{
    city: string;
    state: string;
    slug: string;
    public_status: string;
    landing_enabled: boolean;
  }>(`
    SELECT city, state, slug, public_status, landing_enabled
    FROM driver_city_landings
    ORDER BY state ASC, city ASC
  `);

  const allItems: DriverCityLandingItem[] = result.rows.map((row) => ({
    city: row.city,
    state: row.state,
    slug: row.slug,
    publicStatus: row.public_status,
    landingEnabled: row.landing_enabled,
    url: `https://kaviar.com.br/motorista/cidade/${row.slug}`,
  }));

  let items = [...allItems];
  const question = normalizeText(args?.question ?? '');

  if (question) {
    const cityMatches = allItems.filter((item) => {
      const city = normalizeText(item.city);
      const slug = normalizeText(item.slug);
      return question.includes(city) || question.includes(slug);
    });

    const tokens = new Set(
      question.split(/[^a-z0-9]+/).filter(Boolean)
    );

    const listIntent =
      ['quais', 'listar', 'liste', 'todas', 'todos'].some((token) =>
        tokens.has(token)
      ) || tokens.has('landings');

    const specificLookupIntent =
      /\blanding(?: page)?\s+(?:de|da|do|em|para)\b/.test(question) ||
      (/\b(?:link|url)\b/.test(question) && question.includes('landing'));

    if (cityMatches.length > 0) {
      items = cityMatches;
    } else if (specificLookupIntent && !listIntent) {
      items = [];
    }

    const activeOnly = [
      'ativa',
      'ativas',
      'ativo',
      'ativos',
      'habilitada',
      'habilitadas',
      'habilitado',
      'habilitados',
    ].some((token) => tokens.has(token));

    if (activeOnly) {
      items = items.filter((item) => item.landingEnabled);
    }
  }

  return {
    tool: 'driver_city_landings',
    data: {
      available: true,
      total: allItems.length,
      active: allItems.filter((item) => item.landingEnabled).length,
      matched: items.length,
      items,
    },
  };
}
