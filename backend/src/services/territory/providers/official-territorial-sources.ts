export interface ArcGisOfficialSource {
  id: string;
  city: string;
  uf: string;
  layerUrl: string;
  source: string;
  nameField: string;
  codeField?: string;
  objectIdField?: string;
  outFields?: readonly string[];
  areaType?: string;
  notes?: string;
}

/**
 * Catálogo de fontes territoriais oficiais conhecidas.
 *
 * Regra: configuração por município, sem lógica especial no provider.
 * Adicionar nova cidade = adicionar nova entrada neste catálogo.
 */
export const OFFICIAL_ARCGIS_SOURCES: readonly ArcGisOfficialSource[] = [
  {
    id: 'geodiadema-bairros',
    city: 'Diadema',
    uf: 'SP',
    layerUrl:
      'https://geo.diadema.sp.gov.br/server/rest/services/GeoDiadema/Limite_Territorial_Administrativo/MapServer/1',
    source: 'Prefeitura de Diadema — GeoDiadema / SEPLAGE',
    nameField: 'bairro',
    codeField: 'cod_bairro',
    objectIdField: 'objectid',
    outFields: ['objectid', 'cod_bairro', 'bairro'],
    areaType: 'BAIRRO_OFICIAL',
    notes:
      'Camada oficial Bairro do GeoDiadema. Fonte municipal de geoprocessamento.',
  },
];
