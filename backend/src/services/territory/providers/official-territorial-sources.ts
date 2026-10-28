export interface ArcGisOfficialSource {
  id: string;
  city: string;
  uf: string;
  layerUrl: string;
  source: string;
  nameField: string;
  /** Camada independente de limite municipal, identificada por código IBGE. */
  municipalBoundary?: {
    layerUrl: string;
    codeField: string;
    municipalityCode: string;
    nameField: string;
    ufField: string;
  };
  /** Correções documentadas para nome de exibição; mantém o campo da fonte intacto. */
  nameOverrides?: Readonly<Record<string, string>>;
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
  {
    id: 'geosaqua-bairros',
    city: 'Saquarema',
    uf: 'RJ',
    municipalBoundary: {
      layerUrl: 'https://services8.arcgis.com/5BwCrbm6qPzGdhUo/ArcGIS/rest/services/Limite_Municipal/FeatureServer/0',
      codeField: 'CD_MUN',
      municipalityCode: '3305505',
      nameField: 'NM_MUN',
      ufField: 'SIGLA',
    },
    layerUrl:
      'https://services8.arcgis.com/5BwCrbm6qPzGdhUo/ArcGIS/rest/services/Limites_de_Bairros___Saquarema_WFL1_view/FeatureServer/0',
    source: 'Prefeitura de Saquarema — GeoSaquá / Secretaria Municipal de Urbanismo',
    nameField: 'Name',
    // Art. 11 da Lei Municipal 2.405/2023 (Diário Oficial, edição 1192-5).
    // Apenas grafia: sem mudança de FID, distrito ou geometria.
    nameOverrides: {
      "Caixa d' Água": 'Caixa d’Água',
      "Rio d' Areia": 'Rio d’Areia',
      Basileia: 'Basiléa',
      'Serra de Mato Grosso': 'Serra do Mato Grosso',
      Tinguí: 'Tingui',
    },
    objectIdField: 'FID',
    outFields: ['FID', 'Name', 'dsdist'],
    areaType: 'BAIRRO_OFICIAL',
    notes:
      'Limites de bairros publicados pelo GeoSaquá. Conferir grafias com o Anexo II da Lei Municipal 2.405/2023 antes do APPLY.',
  },
];
