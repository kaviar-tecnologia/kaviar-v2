export const CITY_CENTERS = {
  'rio de janeiro': { lat: -22.9068, lng: -43.1729, zoom: 11 },
  'sao paulo': { lat: -23.5505, lng: -46.6333, zoom: 11 },
  tambau: { lat: -21.705, lng: -47.274, zoom: 13 }
};

export function normalizeCityKey(city) {
  return String(city || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Centro genérico (Brasil) — usado APENAS como fallback VISUAL do mapa quando
// não há geofence nem cidade conhecida. Nunca deve ser usado para REJEITAR
// geometria válida por incompatibilidade.
export const BRAZIL_FALLBACK_CENTER = { lat: -14.235, lng: -51.9253, zoom: 4 };

/**
 * Retorna o centro configurado da cidade OU null quando a cidade é desconhecida.
 * Genérico — não assume nenhuma cidade específica.
 */
export function getKnownCityCenter(city) {
  const key = normalizeCityKey(city);
  return CITY_CENTERS[key] || null;
}

/**
 * Centro para uso VISUAL (fallback de enquadramento quando não há geofence).
 * Cai no centro do Brasil se a cidade não for conhecida.
 */
export function getCityCenter(city) {
  return getKnownCityCenter(city) || BRAZIL_FALLBACK_CENTER;
}

export function isValidPolygonCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) return false;
  const ring = coordinates[0];
  if (!Array.isArray(ring) || ring.length < 3) return false;
  return ring.every((pair) => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
}

// Valida coordenadas de MultiPolygon: [ [ [ [lng,lat], ... ] ], ... ]
export function isValidMultiPolygonCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return false;
  return coordinates.every((polygon) => isValidPolygonCoordinates(polygon));
}

/**
 * Normaliza geometria de geofence para um objeto GeoJSON consistente
 * ({ type: 'Polygon' | 'MultiPolygon', coordinates }) ou retorna null se inválida.
 *
 * Genérico — aceita:
 *   1. Array legado de anéis:            [[[lng,lat], ...]]            -> Polygon
 *   2. GeoJSON Polygon completo:         { type:'Polygon', coordinates:[[[lng,lat],...]] }
 *   3. GeoJSON MultiPolygon completo:    { type:'MultiPolygon', coordinates:[[[[...]]]] }
 *   4. Feature / FeatureCollection que embrulhe (1..3) em .geometry / .features[0].geometry
 *
 * Não faz suposição de cidade. Serve para qualquer UF/cidade.
 */
export function normalizeGeofenceGeometry(payload) {
  if (payload == null) return null;

  // Desembrulha Feature / FeatureCollection, se vier assim.
  if (typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.type === 'FeatureCollection') {
      return normalizeGeofenceGeometry(payload.features?.[0]?.geometry ?? null);
    }
    if (payload.type === 'Feature') {
      return normalizeGeofenceGeometry(payload.geometry ?? null);
    }
  }

  // Caso 1: array legado de anéis -> Polygon.
  if (Array.isArray(payload)) {
    return isValidPolygonCoordinates(payload) ? { type: 'Polygon', coordinates: payload } : null;
  }

  // Casos 2/3: objeto GeoJSON com type + coordinates.
  if (typeof payload === 'object' && payload.type && payload.coordinates != null) {
    if (payload.type === 'Polygon') {
      return isValidPolygonCoordinates(payload.coordinates)
        ? { type: 'Polygon', coordinates: payload.coordinates }
        : null;
    }
    if (payload.type === 'MultiPolygon') {
      return isValidMultiPolygonCoordinates(payload.coordinates)
        ? { type: 'MultiPolygon', coordinates: payload.coordinates }
        : null;
    }
  }

  return null;
}

/** Extrai o primeiro ponto [lng,lat] de uma geometria Polygon ou MultiPolygon normalizada. */
export function firstPointOfGeometry(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  if (geometry.type === 'Polygon') {
    return geometry.coordinates?.[0]?.[0] ?? null;
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates?.[0]?.[0]?.[0] ?? null;
  }
  return null;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isCompatibleWithCity(geometryOrCoordinates, city) {
  // Cidade sem centro conhecido: não rejeitar geometria válida. O enquadramento
  // fica por conta do fitBounds sobre a própria geofence.
  const center = getKnownCityCenter(city);
  if (!center) return true;
  // Aceita geometria normalizada ({type,coordinates}) OU array legado de anéis.
  let firstPoint = null;
  if (geometryOrCoordinates && !Array.isArray(geometryOrCoordinates) && geometryOrCoordinates.type) {
    firstPoint = firstPointOfGeometry(geometryOrCoordinates);
  } else {
    firstPoint = geometryOrCoordinates?.[0]?.[0] ?? null;
  }
  if (!Array.isArray(firstPoint)) return false;
  return haversineKm(firstPoint[1], firstPoint[0], center.lat, center.lng) <= 250;
}

export function shouldFetchGeofence(neighborhood) {
  return neighborhood?.has_geofence === true;
}
