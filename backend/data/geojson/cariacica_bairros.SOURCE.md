# Fonte — `cariacica_bairros.geojson`

## Cidade
- **Município:** Cariacica
- **UF:** Espírito Santo (ES)
- **Código IBGE do município:** 3201308
- **Bairros no arquivo:** 98 (`area_type = BAIRRO_OFICIAL`)

## Origem das geometrias (leia com atenção)
- **Origem real:** **OpenStreetMap (OSM)** — fronteiras administrativas
  (`boundary=administrative`, `admin_level=9/10`, `place=suburb/neighbourhood`),
  extraídas via **Overpass API** em 2026-09-01.
- **Licença:** ODbL — © OpenStreetMap contributors.

### Esclarecimento OSM × IBGE (importante)
Durante a pesquisa, **os distritos** de Cariacica no OSM (`admin_level=9`:
"Cariacica" e "Itaquari") traziam tags `source=IBGE` e `IBGE:GEOCODIGO`. **Esses
distritos foram EXCLUÍDOS** deste arquivo (não são bairros).

Verificação sobre os **98 bairros** efetivamente incluídos:
- **0 (zero)** dos 98 bairros carrega tag `IBGE:GEOCODIGO`.
- Portanto, as geometrias dos bairros são **fronteiras administrativas do OSM**,
  **e não** uma malha cadastral municipal/IBGE baixada diretamente da prefeitura
  ou do IBGE.

> Em resumo: "OSM com tags de fonte IBGE" (que apareceu apenas nos distritos)
> **não** é o mesmo que "malha oficial de bairros baixada do IBGE/prefeitura".
> Este arquivo é **OSM**. Cada feature está marcada com
> `provenance = "osm_admin_boundary"` e `verified = false`.

## Consequência para uso
- Os 98 registros entram como `BAIRRO_OFICIAL` porque essa é a categoria de
  esquema para áreas do tipo bairro (em oposição a `FAVELA`/`COMUNIDADE`/`DISTRITO`).
  **Isso NÃO afirma validação cadastral oficial.**
- No banco, os bairros importados ficam com `is_verified = false` até revisão.
- **Recomendação:** a gestão territorial/regulatória deve **conferir os 98 bairros**
  (nomes e limites) antes da ativação operacional da cidade. A importação **não**
  ativa a cidade.

## Consulta Overpass utilizada
```overpassql
[out:json][timeout:180];
rel["name"="Cariacica"]["admin_level"="8"]["boundary"="administrative"];
map_to_area->.c;
(
  way["place"~"suburb|neighbourhood|quarter"](area.c);
  relation["place"~"suburb|neighbourhood|quarter"](area.c);
  relation["boundary"="administrative"]["admin_level"~"9|10"](area.c);
);
out geom;
```

## Processamento aplicado
1. Montagem das geometrias de relação (ways `outer`/`inner`) em anéis fechados → `Polygon`/`MultiPolygon`.
2. **Filtragem:** mantidos apenas bairros (`place=suburb|neighbourhood|quarter` ou
   `admin_level=10`). **Descartados os distritos `admin_level=9`** ("Cariacica",
   "Itaquari") — inclusive os que traziam tag IBGE.
3. **Deduplicação** por nome (removida 1 ocorrência duplicada de "Tiradentes").
4. Centroide (`center_lat`/`center_lng`) via fórmula do polígono (shoelace) sobre o maior anel.
5. **Validação:** WGS84 / EPSG:4326 (CRS84, ordem lon,lat), anéis fechados (≥4 pontos),
   dentro do bounding box de Cariacica/ES (lat -20.40..-20.24, lon -40.46..-40.35),
   sem nomes duplicados.

## Propriedades por feature
`name`, `city="Cariacica"`, `uf="ES"`, `area_type="BAIRRO_OFICIAL"`,
`source="OpenStreetMap — limites administrativos (admin_level 9/10)"`,
`source_url`, `source_detail` (ressalva de que NÃO é malha IBGE),
`provenance="osm_admin_boundary"`, `verified=false`, `center_lat`, `center_lng`,
`osm_type`, `osm_id`.

## CRS
`urn:ogc:def:crs:OGC:1.3:CRS84` (equivalente a EPSG:4326, ordem longitude/latitude),
compatível com `ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)` no PostGIS.
