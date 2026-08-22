/**
 * City Opening Overview — visão operacional consolidada de abertura de cidade.
 * Reutiliza tools existentes + queries simples para motoristas/leads.
 * Estritamente read-only.
 */
import { pool } from '../../db';
import {
  getTerritoryOnboardingStatus,
  getTerritoryActivationReadiness,
} from './kaviar-ai.tools';
import { getTerritoryManagerCoverage } from './kaviar-ai.command-center';
import { getDriverCityLandings } from './kaviar-ai.city-landings';
import type {
  TerritoryOnboardingStatusData,
  TerritoryActivationReadinessData,
} from './kaviar-ai.tools';
import type { TerritoryManagerCoverageData } from './kaviar-ai.command-center';
import type { DriverCityLandingsData } from './kaviar-ai.city-landings';

/**
 * Mínimo operacional de motoristas cadastrados para considerar
 * um território pronto para ativação.
 * NÃO relacionado ao MIN_DRIVERS de detect-communities.ts (clustering).
 */
export const MIN_DRIVERS_FOR_TERRITORY_ACTIVATION = 3;

export type CityOpeningOverviewData = {
  available: boolean;
  city: string;
  uf: string;
  territory: {
    found: boolean;
    id: string | null;
    name: string | null;
    status: string | null;
  };
  regulatory: {
    available: boolean;
    status: string | null;
    notes: string | null;
  };
  manager: {
    available: boolean;
    hasManager: boolean;
    managerName: string | null;
    coverageStatus: string | null;
    activeManagers: number;
  };
  landing: {
    available: boolean;
    enabled: boolean;
    url: string | null;
    publicStatus: string | null;
  };
  drivers: {
    available: boolean;
    total: number;
    operationalCount: number;
    byStatus: Record<string, number>;
  };
  leads: {
    available: boolean;
    total: number;
    byStatus: Record<string, number>;
  };
  activation: {
    available: boolean;
    ready: boolean;
    operationalReady: boolean | null; // null = cannot confirm
    reasons: string[];
  };
  pendencies: string[];
  nextAction: string;
};

/**
 * Determina a próxima ação recomendada com base nas pendências reais.
 * Prioridade: território → regulatório → gestor → landing → readiness reasons → motoristas → pronta.
 * Não inventa thresholds; usa os dados de territory_activation_readiness como fonte principal.
 */
function determineNextAction(data: CityOpeningOverviewData): string {
  // 1. Território inexistente
  if (!data.territory.found) {
    return 'Cadastrar o território no sistema (status: planning).';
  }

  // 2. Regulatório bloqueado ou não avaliado
  const reg = data.regulatory.status?.toLowerCase() ?? '';
  if (reg === 'blocked' || reg === 'suspended') {
    return 'Resolver situação regulatória antes de qualquer outra ação.';
  }
  if (reg === 'not_evaluated') {
    return 'Iniciar pesquisa regulatória municipal.';
  }

  // 3. Gestor ausente
  if (!data.manager.hasManager) {
    return 'Cadastrar e atribuir gestor territorial.';
  }

  // 4. Landing necessária e desabilitada
  if (!data.landing.enabled) {
    return 'Liberar landing page de captação de motoristas.';
  }

  // 5. Usar readiness reasons como fonte principal para demais blockers
  if (data.activation.available && !data.activation.ready) {
    // readiness reasons já cobrem: status território, regulatório, gestor, moto compliance
    const topReason = data.activation.reasons[0] || '';
    return `Resolver pendência de ativação: ${topReason}`;
  }

  // 6. Motoristas abaixo do mínimo operacional
  if (data.drivers.available && data.drivers.operationalCount < MIN_DRIVERS_FOR_TERRITORY_ACTIVATION) {
    return `Recrutar motoristas até atingir o mínimo operacional de ${MIN_DRIVERS_FOR_TERRITORY_ACTIVATION} aptos.`;
  }

  // 7. Drivers indisponíveis — não é possível confirmar
  if (!data.drivers.available && data.activation.available && data.activation.ready) {
    return 'Verificar quantidade de motoristas cadastrados na cidade.';
  }

  // 8. Cidade pronta
  if (data.activation.operationalReady === true) {
    return 'Cidade pronta para ativação. Aguardando decisão administrativa de SUPER_ADMIN.';
  }

  return 'Verificar pendências restantes manualmente.';
}

/**
 * Executa a visão operacional consolidada para abertura de cidade.
 * Chama tools existentes em paralelo + queries simples.
 */
export async function getCityOpeningOverview(
  args?: Record<string, string>
): Promise<{ tool: 'city_opening_overview'; data: CityOpeningOverviewData }> {
  const city = (args?.city ?? '').trim();
  const uf = (args?.uf ?? '').trim().toUpperCase();

  if (!city || !uf || uf.length !== 2) {
    return {
      tool: 'city_opening_overview',
      data: {
        available: false,
        city, uf,
        territory: { found: false, id: null, name: null, status: null },
        regulatory: { available: false, status: null, notes: null },
        manager: { available: false, hasManager: false, managerName: null, coverageStatus: null, activeManagers: 0 },
        landing: { available: false, enabled: false, url: null, publicStatus: null },
        drivers: { available: false, total: 0, operationalCount: 0, byStatus: {} },
        leads: { available: false, total: 0, byStatus: {} },
        activation: { available: false, ready: false, operationalReady: false, reasons: ['Cidade ou UF inválida.'] },
        pendencies: ['Cidade ou UF inválida.'],
        nextAction: 'Informar cidade e UF válidas.',
      },
    };
  }

  // Call tools directly (not via registry) to avoid circular import
  const [onboardingResult, readinessResult, coverageResult, landingResult] = await Promise.all([
    getTerritoryOnboardingStatus(city, uf).catch(() => null),
    getTerritoryActivationReadiness(city, uf).catch(() => null),
    getTerritoryManagerCoverage({ city, uf }).catch(() => null),
    getDriverCityLandings({ question: `landing ${city}/${uf}` }).catch(() => null),
  ]);

  const onboarding = onboardingResult?.data as TerritoryOnboardingStatusData | null;
  const readiness = readinessResult?.data as TerritoryActivationReadinessData | null;
  const coverage = coverageResult?.data as TerritoryManagerCoverageData | null;
  const landing = landingResult?.data as DriverCityLandingsData | null;

  // Extract territory ID for driver/lead queries
  const territoryId = onboarding?.territory?.id ?? null;

  // Simple per-city driver count (by status)
  // Status 'approved' = motorista apto/ativo para operar
  let drivers: CityOpeningOverviewData['drivers'] = { available: false, total: 0, operationalCount: 0, byStatus: {} };
  if (territoryId) {
    try {
      const driverResult = await pool.query<{ status: string; cnt: number }>(`
        SELECT d.status, COUNT(*)::int AS cnt
        FROM drivers d
        INNER JOIN neighborhoods n ON n.id = d.neighborhood_id
        WHERE n.territory_id = $1
          AND d.deleted_at IS NULL
        GROUP BY d.status
      `, [territoryId]);

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of driverResult.rows) {
        byStatus[row.status] = row.cnt;
        total += row.cnt;
      }
      const operationalCount = byStatus['approved'] ?? 0;
      drivers = { available: true, total, operationalCount, byStatus };
    } catch {
      drivers = { available: false, total: 0, operationalCount: 0, byStatus: {} };
    }
  }

  // Simple per-city lead count
  let leads: CityOpeningOverviewData['leads'] = { available: false, total: 0, byStatus: {} };
  if (territoryId) {
    try {
      const leadResult = await pool.query<{ status: string; cnt: number }>(`
        SELECT status, COUNT(*)::int AS cnt
        FROM crm_leads
        WHERE territory_id = $1
          AND deleted_at IS NULL
        GROUP BY status
      `, [territoryId]);

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of leadResult.rows) {
        byStatus[row.status] = row.cnt;
        total += row.cnt;
      }
      leads = { available: true, total, byStatus };
    } catch {
      leads = { available: false, total: 0, byStatus: {} };
    }
  }

  // Build consolidated data
  const territoryData: CityOpeningOverviewData['territory'] = {
    found: onboarding?.found ?? false,
    id: onboarding?.territory?.id ?? null,
    name: onboarding?.territory?.name ?? null,
    status: onboarding?.territory?.status ?? null,
  };

  const regulatoryData: CityOpeningOverviewData['regulatory'] = {
    available: !!onboarding?.found,
    status: onboarding?.territory?.regulatory_status ?? null,
    notes: onboarding?.territory?.regulatory_notes ?? null,
  };

  const managerData: CityOpeningOverviewData['manager'] = {
    available: coverage !== null,
    hasManager: (coverage?.managers?.length ?? 0) > 0 || !!onboarding?.manager,
    managerName: coverage?.managers?.[0]?.name ?? onboarding?.manager?.name ?? null,
    coverageStatus: coverage?.coverageStatus ?? null,
    activeManagers: coverage?.managers?.length ?? 0,
  };

  const landingData: CityOpeningOverviewData['landing'] = (() => {
    if (!landing?.available) return { available: false, enabled: false, url: null, publicStatus: null };
    const cityLower = city.toLowerCase();
    const match = landing.items?.find(
      (item: any) => item.city?.toLowerCase() === cityLower && item.state?.toUpperCase() === uf
    );
    if (!match) return { available: true, enabled: false, url: null, publicStatus: null };
    return {
      available: true,
      enabled: match.landingEnabled ?? false,
      url: match.url ?? null,
      publicStatus: match.publicStatus ?? null,
    };
  })();

  const activationData: CityOpeningOverviewData['activation'] = {
    available: readiness !== null,
    ready: readiness?.ready ?? false,
    operationalReady: (() => {
      if (!readiness?.ready) return false;
      if (!drivers.available) return null; // cannot confirm without driver data
      return drivers.operationalCount >= MIN_DRIVERS_FOR_TERRITORY_ACTIVATION;
    })(),
    reasons: readiness?.reasons ?? [],
  };

  // Collect all pendencies
  const pendencies: string[] = [
    ...(onboarding?.pendencies ?? []),
  ];
  if (!landingData.enabled && territoryData.found) {
    pendencies.push('Landing page de motoristas não habilitada.');
  }
  if (drivers.available && drivers.operationalCount < MIN_DRIVERS_FOR_TERRITORY_ACTIVATION) {
    pendencies.push(`Motoristas aptos abaixo do mínimo operacional de ${MIN_DRIVERS_FOR_TERRITORY_ACTIVATION} (atual: ${drivers.operationalCount}).`);
  }

  const result: CityOpeningOverviewData = {
    available: true,
    city,
    uf,
    territory: territoryData,
    regulatory: regulatoryData,
    manager: managerData,
    landing: landingData,
    drivers,
    leads,
    activation: activationData,
    pendencies,
    nextAction: '',
  };

  result.nextAction = determineNextAction(result);

  return { tool: 'city_opening_overview', data: result };
}
