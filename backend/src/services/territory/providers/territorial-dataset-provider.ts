/**
 * Contratos comuns e registro de providers de dataset territorial (Fase 0).
 *
 * Objetivo: permitir aquisição AUTOMÁTICA e GENÉRICA do dataset de bairros de
 * uma cidade, sem lógica hardcoded por cidade. Providers concretos (oficiais ou
 * OSM) implementam esta interface e são resolvidos por prioridade.
 *
 * IMPORTANTE (segurança): providers fazem apenas LEITURA externa. Nada aqui
 * grava em banco. Fontes comunitárias (OSM) NUNCA são marcadas como oficiais e
 * têm sourceVerified=false por padrão.
 */
import type { NeighborhoodFeatureCollection } from '../city-preparation.core';

/** Proveniência obrigatória de todo dataset adquirido. */
export interface DatasetProvenance {
  /** id do provider que obteve o dado (ex.: 'osm-overpass', 'ibge-malhas'). */
  providerId: string;
  /** Rótulo humano da fonte. */
  source: string;
  /** URL/endpoint de origem. */
  sourceUrl: string | null;
  /** Método de obtenção (ex.: 'overpass-api', 'wfs-geojson'). */
  method: string;
  /** Data/hora ISO da coleta. */
  collectedAt: string;
  /** true SOMENTE se a fonte é oficial (governo). OSM => false. */
  isOfficial: boolean;
  // OBS: `sourceVerified` NÃO faz parte da proveniência do provider.
  // Verificação de fonte é decisão HUMANA/administrativa (fluxo de revisão),
  // nunca um valor retornado pela aquisição. A persistência força false.
  /** Query/consulta usada (ex.: OverpassQL), quando aplicável. */
  query?: string | null;
  /** IDs de origem (ex.: OSM relation/way ids), quando aplicável. */
  sourceIds?: string[];
  /** Observações livres (limitações, cobertura, etc.). */
  notes?: string | null;
}

/** Estatísticas de qualidade da coleta (para prévia/rastreabilidade). */
export interface AcquisitionStats {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  outOfBBox: number;
}

/**
 * Resultado de uma aquisição:
 *  - rawSource: resposta BRUTA original da fonte (ex.: JSON do Overpass), para
 *    rastreabilidade — persistida como raw.json;
 *  - featureCollection: FeatureCollection NORMALIZADA — persistida como normalized.geojson;
 *  - provenance: metadados de origem — persistida como provenance.json;
 *  - stats: qualidade da coleta.
 */
export interface AcquiredDataset {
  /** Resposta bruta original da fonte (sem normalização). */
  rawSource: unknown;
  featureCollection: NeighborhoodFeatureCollection;
  provenance: DatasetProvenance;
  stats: AcquisitionStats;
}

/** Opções passadas ao provider na aquisição. */
export interface AcquisitionOptions {
  /** Timeout total (ms) para chamadas externas. */
  timeoutMs?: number;
  /** area_type técnico do schema a aplicar às features (não afirma verificação). */
  areaType?: string;
  /** Injeção de fetch para teste (default: fetch global). */
  fetchImpl?: typeof fetch;
  /** Sinal de abort opcional. */
  signal?: AbortSignal;
  /**
   * bbox esperado por CHAMADA (tem precedência sobre a config do provider).
   * Permite ao serviço injetar o bbox municipal resolvido genericamente.
   */
  bbox?: import('../city-preparation.core').CityBoundingBox | null;
}

/** Contexto de resolução (cidade/UF). Genérico — sem cidade hardcoded. */
export interface CityRef {
  city: string;
  uf: string;
}

/**
 * Interface de um provider de dataset territorial.
 * Concretizações: OpenStreetMapProvider (fallback comunitário), OfficialDatasetProvider.
 */
export interface TerritorialDatasetProvider {
  /** Identificador estável do provider. */
  readonly id: string;
  /** true se a fonte é oficial (governo). OSM = false. */
  readonly isOfficial: boolean;
  /**
   * Prioridade de tentativa (menor = maior prioridade). Fontes oficiais devem
   * ter prioridade sobre OSM.
   */
  readonly priority: number;
  /** Diz se o provider consegue atender (city, uf). Somente leitura. */
  supports(ref: CityRef): Promise<boolean> | boolean;
  /** Busca e normaliza o dataset. Somente LEITURA externa; não grava nada. */
  fetchDataset(ref: CityRef, opts?: AcquisitionOptions): Promise<AcquiredDataset>;
}

// ─── Registro / prioridade ────────────────────────────────────────────────────

const registry: TerritorialDatasetProvider[] = [];

/** Registra um provider (idempotente por id). */
export function registerProvider(provider: TerritorialDatasetProvider): void {
  const existing = registry.findIndex((p) => p.id === provider.id);
  if (existing >= 0) registry[existing] = provider;
  else registry.push(provider);
}

/** Remove todos os providers (uso em testes). */
export function clearProviders(): void {
  registry.length = 0;
}

/** Retorna os providers ordenados por prioridade (oficiais primeiro). */
export function getProvidersByPriority(): TerritorialDatasetProvider[] {
  return [...registry].sort((a, b) => {
    // Oficiais primeiro; depois por priority; empate por id.
    if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Seleciona o primeiro provider (por prioridade) que suporta (city, uf).
 * Não faz fetch — apenas resolve qual provider tentar primeiro.
 */
export async function selectProvider(ref: CityRef): Promise<TerritorialDatasetProvider | null> {
  for (const provider of getProvidersByPriority()) {
    // eslint-disable-next-line no-await-in-loop
    if (await provider.supports(ref)) return provider;
  }
  return null;
}
