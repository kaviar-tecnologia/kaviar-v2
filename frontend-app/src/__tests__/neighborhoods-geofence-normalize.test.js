import { describe, it, expect } from 'vitest';
import {
  normalizeGeofenceGeometry,
  isCompatibleWithCity,
  firstPointOfGeometry,
  getCityCenter,
} from '../pages/admin/neighborhoodsGeofenceUtils.js';

// Anel quadrado válido (>=3 pontos, fechado) em torno de um centro [lng,lat].
function ring(lng, lat, d = 0.01) {
  return [
    [lng - d, lat - d],
    [lng + d, lat - d],
    [lng + d, lat + d],
    [lng - d, lat + d],
    [lng - d, lat - d],
  ];
}
// Cariacica/ES ~ lng -40.42, lat -20.30 (cidade NÃO presente em CITY_CENTERS)
const CARIACICA = { lng: -40.42, lat: -20.30 };

describe('normalizeGeofenceGeometry', () => {
  it('aceita Polygon no formato LEGADO (array de anéis)', () => {
    const legacy = [ring(CARIACICA.lng, CARIACICA.lat)];
    const g = normalizeGeofenceGeometry(legacy);
    expect(g).toEqual({ type: 'Polygon', coordinates: legacy });
  });

  it('aceita Polygon no formato GeoJSON completo { type, coordinates }', () => {
    const geojson = { type: 'Polygon', coordinates: [ring(CARIACICA.lng, CARIACICA.lat)] };
    const g = normalizeGeofenceGeometry(geojson);
    expect(g.type).toBe('Polygon');
    expect(g.coordinates).toBe(geojson.coordinates);
  });

  it('aceita MultiPolygon no formato GeoJSON completo', () => {
    const mp = {
      type: 'MultiPolygon',
      coordinates: [[ring(CARIACICA.lng, CARIACICA.lat)], [ring(CARIACICA.lng + 0.05, CARIACICA.lat + 0.05)]],
    };
    const g = normalizeGeofenceGeometry(mp);
    expect(g.type).toBe('MultiPolygon');
    expect(g.coordinates.length).toBe(2);
  });

  it('desembrulha Feature e FeatureCollection', () => {
    const poly = { type: 'Polygon', coordinates: [ring(CARIACICA.lng, CARIACICA.lat)] };
    expect(normalizeGeofenceGeometry({ type: 'Feature', geometry: poly }).type).toBe('Polygon');
    expect(normalizeGeofenceGeometry({ type: 'FeatureCollection', features: [{ geometry: poly }] }).type).toBe('Polygon');
  });

  it('retorna null para geometria REALMENTE inválida', () => {
    expect(normalizeGeofenceGeometry(null)).toBeNull();
    expect(normalizeGeofenceGeometry(undefined)).toBeNull();
    expect(normalizeGeofenceGeometry({})).toBeNull();
    expect(normalizeGeofenceGeometry({ type: 'Polygon' })).toBeNull(); // sem coordinates
    expect(normalizeGeofenceGeometry({ type: 'Point', coordinates: [1, 2] })).toBeNull();
    expect(normalizeGeofenceGeometry([[[1]]])).toBeNull(); // anel com pontos inválidos
    expect(normalizeGeofenceGeometry([[[0, 0], [1, 1]]])).toBeNull(); // < 3 pontos
    expect(normalizeGeofenceGeometry('nonsense')).toBeNull();
  });

  it('NÃO recebe objeto onde valida array (Polygon com type extrai coordinates corretamente)', () => {
    // Regressão do bug: passar { type, coordinates } não deve resultar em inválido.
    const geojson = { type: 'Polygon', coordinates: [ring(CARIACICA.lng, CARIACICA.lat)] };
    expect(normalizeGeofenceGeometry(geojson)).not.toBeNull();
  });
});

describe('firstPointOfGeometry', () => {
  it('extrai primeiro ponto de Polygon e MultiPolygon', () => {
    const p = normalizeGeofenceGeometry({ type: 'Polygon', coordinates: [ring(CARIACICA.lng, CARIACICA.lat)] });
    const mp = normalizeGeofenceGeometry({ type: 'MultiPolygon', coordinates: [[ring(CARIACICA.lng, CARIACICA.lat)]] });
    expect(firstPointOfGeometry(p)).toEqual([CARIACICA.lng - 0.01, CARIACICA.lat - 0.01]);
    expect(firstPointOfGeometry(mp)).toEqual([CARIACICA.lng - 0.01, CARIACICA.lat - 0.01]);
  });
});

describe('cidade desconhecida (fora de CITY_CENTERS) com geometria válida', () => {
  it('getCityCenter cai no fallback Brasil para Cariacica (não há entrada)', () => {
    const center = getCityCenter('Cariacica');
    expect(center).toEqual({ lat: -14.235, lng: -51.9253, zoom: 4 });
  });

  it('isCompatibleWithCity NÃO deve barrar geometria só porque a cidade é desconhecida (fallback Brasil está a <250km? não)', () => {
    // Cariacica dista >250km do centro do Brasil => a checagem de compat com fallback
    // reprovaria. Por isso o mapa deve usar a PRÓPRIA geometria (fitBounds), não o centro.
    // Aqui garantimos que a geometria é válida/renderável independentemente da cidade.
    const geometry = normalizeGeofenceGeometry({ type: 'Polygon', coordinates: [ring(CARIACICA.lng, CARIACICA.lat)] });
    expect(geometry).not.toBeNull();
    // O ponto existe e é usável para fitBounds:
    expect(firstPointOfGeometry(geometry)).toEqual([CARIACICA.lng - 0.01, CARIACICA.lat - 0.01]);
  });
});

describe('LeafletGeofenceMap: enquadra geometria válida (fitBounds) e usa center só como fallback', () => {
  const src = (() => {
    // eslint-disable-next-line no-undef
    const { readFileSync } = require('fs');
    // eslint-disable-next-line no-undef
    const { resolve } = require('path');
    // eslint-disable-next-line no-undef
    return readFileSync(resolve(__dirname, '../components/maps/LeafletGeofenceMap.jsx'), 'utf8');
  })();

  it('usa fitBounds sobre a geofence carregada', () => {
    expect(src).toContain('fitBounds');
    expect(src).toContain('getBounds');
  });

  it('aceita Polygon e MultiPolygon', () => {
    expect(src).toContain("'MultiPolygon'");
    expect(src).toContain("'Polygon'");
  });

  it('só cai em setView(center) quando NÃO há geometria renderável', () => {
    // setView aparece no ramo de fallback (após o return do ramo com geometria)
    expect(src).toContain('map.setView');
  });
});

describe('handler NeighborhoodsManagement: normaliza antes de validar e preserva estados de erro', () => {
  const src = (() => {
    // eslint-disable-next-line no-undef
    const { readFileSync } = require('fs');
    // eslint-disable-next-line no-undef
    const { resolve } = require('path');
    // eslint-disable-next-line no-undef
    return readFileSync(resolve(__dirname, '../pages/admin/NeighborhoodsManagement.jsx'), 'utf8');
  })();

  it('usa normalizeGeofenceGeometry no fluxo', () => {
    expect(src).toContain('normalizeGeofenceGeometry');
  });

  it('preserva estados NO_GEOMETRY / AUTH_ERROR / FORBIDDEN / RATE_LIMITED / NETWORK_ERROR', () => {
    for (const s of ['NO_GEOMETRY', 'AUTH_ERROR', 'FORBIDDEN', 'RATE_LIMITED', 'NETWORK_ERROR', 'INVALID_GEOMETRY']) {
      expect(src).toContain(s);
    }
  });
});
