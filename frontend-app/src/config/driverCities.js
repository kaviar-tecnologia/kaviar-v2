/**
 * Configuração de cidades para landing localizada de motoristas.
 * Para adicionar uma nova cidade, basta adicionar um novo entry aqui.
 */
export const DRIVER_CITY_CONFIG = {
  'santa-cruz-das-palmeiras-sp': {
    name: 'Santa Cruz das Palmeiras',
    state: 'SP',
    status: 'implantacao',
  },
};

export function getCityBySlug(slug) {
  return DRIVER_CITY_CONFIG[slug] || null;
}

export function isValidCitySlug(slug) {
  return slug in DRIVER_CITY_CONFIG;
}
