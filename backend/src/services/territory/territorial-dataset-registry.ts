/**
 * Registro genérico de datasets territoriais.
 *
 * Resolve o arquivo GeoJSON de uma cidade por (city, uf) a partir de um
 * manifesto JSON versionado (`data/geojson/territorial-datasets.json`).
 *
 * Objetivo: onboardar uma nova cidade = adicionar uma entrada no manifesto +
 * colocar o arquivo em `data/geojson/`. NENHUMA lógica especial de cidade
 * espalhada pelo código (sem `if cidade === 'Cariacica'`).
 */
import * as fs from 'fs';
import * as path from 'path';

export interface TerritorialDataset {
  city: string;
  uf: string;
  file: string;
  areaType?: string;
  /** false quando a malha não é oficialmente validada (import mantém is_verified=false). */
  sourceVerified?: boolean;
  notes?: string;
}

export interface TerritorialManifest {
  version: number;
  datasets: TerritorialDataset[];
}

/** Diretório base dos assets (data/geojson). */
export const GEOJSON_DIR = path.join(__dirname, '../../../data/geojson');
const MANIFEST_PATH = path.join(GEOJSON_DIR, 'territorial-datasets.json');

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** Carrega o manifesto. Lança se malformado. */
export function loadManifest(manifestPath: string = MANIFEST_PATH): TerritorialManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifesto territorial não encontrado: ${manifestPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!parsed || !Array.isArray(parsed.datasets)) {
    throw new Error('Manifesto territorial inválido: campo "datasets" ausente.');
  }
  return parsed as TerritorialManifest;
}

/**
 * Resolve o dataset por (city, uf). Faz match case-insensitive.
 * UF é opcional no match: se `uf` for informado, precisa bater; se ambos os
 * lados tiverem UF, comparam-se; se o manifesto não tiver UF, casa só por city.
 */
export function resolveDataset(
  city: string,
  uf?: string | null,
  manifest?: TerritorialManifest,
): TerritorialDataset | null {
  const m = manifest ?? loadManifest();
  const c = norm(city);
  const u = norm(uf);
  // Preferir match exato city+uf; depois só city.
  const byCityUf = m.datasets.find((d) => norm(d.city) === c && (u ? norm(d.uf) === u : true));
  if (byCityUf) return byCityUf;
  return m.datasets.find((d) => norm(d.city) === c) ?? null;
}

/** Caminho absoluto do arquivo GeoJSON de um dataset. */
export function datasetFilePath(ds: TerritorialDataset): string {
  return path.join(GEOJSON_DIR, ds.file);
}

/**
 * Resolve o caminho do GeoJSON para uma cidade/uf. Retorna null se não houver
 * dataset registrado. Usado por rota e CLI — mesmo mecanismo, sem duplicação.
 */
export function resolveGeojsonPath(
  city: string,
  uf?: string | null,
  manifest?: TerritorialManifest,
): { dataset: TerritorialDataset; filePath: string } | null {
  const ds = resolveDataset(city, uf, manifest);
  if (!ds) return null;
  return { dataset: ds, filePath: datasetFilePath(ds) };
}
