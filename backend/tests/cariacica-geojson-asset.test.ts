import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateNeighborhoodGeoJSON,
  computeBoundingBox,
  expandBoundingBox,
  type NeighborhoodFeatureCollection,
} from '../src/services/territory/city-preparation.core';

const GEOJSON_PATH = path.join(__dirname, '../data/geojson/cariacica_bairros.geojson');

describe('Asset: cariacica_bairros.geojson', () => {
  const fc: NeighborhoodFeatureCollection = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf-8'));

  it('é uma FeatureCollection com bairros', () => {
    expect(fc.type).toBe('FeatureCollection');
    expect(Array.isArray(fc.features)).toBe(true);
    expect(fc.features.length).toBeGreaterThan(50);
  });

  it('passa na validação completa (Cariacica/ES, WGS84, sem duplicidades)', () => {
    // bbox derivado do próprio arquivo (genérico) + margem — prova que a
    // checagem de coerência geográfica funciona sem constante de cidade.
    const computed = computeBoundingBox(fc);
    expect(computed).not.toBeNull();
    const bbox = expandBoundingBox(computed!, 0.5);

    const result = validateNeighborhoodGeoJSON(fc, {
      expectedCity: 'Cariacica',
      expectedUf: 'ES',
      bbox,
      defaultAreaType: 'BAIRRO_OFICIAL',
    });

    if (!result.ok) {
      // Ajuda diagnóstico se algum dia o arquivo for alterado
      console.error('Inválidos:', result.invalid.slice(0, 5));
      console.error('Duplicados:', result.duplicates);
    }
    expect(result.invalid).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
    expect(result.ok).toBe(true);
    // Todos como BAIRRO_OFICIAL, cidade Cariacica
    expect(result.valid.every((n) => n.areaType === 'BAIRRO_OFICIAL')).toBe(true);
    expect(result.valid.every((n) => n.city === 'Cariacica')).toBe(true);
    expect(result.valid.every((n) => n.uf === 'ES')).toBe(true);
    // Centroides presentes
    expect(result.valid.every((n) => n.centerLat != null && n.centerLng != null)).toBe(true);
  });
});
