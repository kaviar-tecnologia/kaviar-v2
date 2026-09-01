# Como preparar uma nova cidade (onboarding territorial)

Guia curto para replicar o onboarding territorial usado em **Cariacica/ES**.
O fluxo é **idempotente**, **não ativa** a cidade e **não libera** modalidades
bloqueadas por compliance. Toda gravação em produção exige confirmação do Super Admin.

## Visão geral

O onboarding importa os **bairros** de uma cidade (com limites geográficos) para as
tabelas existentes:

- `neighborhoods` — um registro por bairro (`area_type = 'BAIRRO_OFICIAL'`), vinculado
  ao território via `territory_id`.
- `neighborhood_geofences` — o polígono de cada bairro (`coordinates` em GeoJSON +
  `geom` PostGIS em SRID 4326).

Reusa o território operacional **já existente** (não cria território duplicado) e o
gestor territorial já vinculado.

## Pré-requisitos

1. **Território existente** para a cidade em `operational_territories`
   (`level = 'city'`, `uf` preenchida). Se não existir, crie-o antes pela tela de
   Territórios (o onboarding **não** cria território automaticamente).
2. **Arquivo GeoJSON** dos bairros versionado em `backend/data/geojson/<cidade>_bairros.geojson`.

## Passo 1 — Obter o GeoJSON dos bairros

Fonte recomendada: **OpenStreetMap** (limites frequentemente derivados do IBGE) via
Overpass API, ou malha oficial do IBGE / prefeitura.

Exemplo (Overpass — troque `Cariacica` pela cidade):

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

O arquivo final deve ser uma `FeatureCollection` com, por feature:

- `properties.name` — nome do bairro;
- `properties.city` — nome da cidade (deve bater com o território);
- `properties.uf`, `properties.area_type = "BAIRRO_OFICIAL"`;
- `properties.center_lat` / `center_lng` (centroide);
- `geometry` — `Polygon`/`MultiPolygon` em **WGS84 / EPSG:4326** (ordem `lon,lat`),
  anéis fechados (≥ 4 pontos), sem duplicidade de nomes.

Documente a fonte em `backend/data/geojson/<cidade>_bairros.SOURCE.md`
(veja `cariacica_bairros.SOURCE.md` como modelo).

## Passo 2 — Registrar o arquivo no manifesto (config, sem código)

Adicione uma entrada em `backend/data/geojson/territorial-datasets.json`:

```json
{
  "city": "Nova Cidade",
  "uf": "XX",
  "file": "novacidade_bairros.geojson",
  "areaType": "BAIRRO_OFICIAL",
  "sourceVerified": false,
  "notes": "Origem e ressalvas do dataset."
}
```

O onboarding é **dirigido por dados/config**: registrar a entrada + colocar o
arquivo em `backend/data/geojson/` é suficiente. **Nenhuma lógica de backend ou
frontend precisa mudar** — a resolução do dataset é feita por `(city, uf)` no
registro genérico (`territorial-dataset-registry.ts`), usado igualmente pela CLI
e pelos endpoints administrativos.

> `sourceVerified: false` sinaliza malha não oficialmente validada; os bairros
> são importados com `is_verified=false` até revisão da gestão territorial.

## Passo 3 — Dry-run (prévia, sem gravar)

### Pela interface (recomendado)

1. Admin → **Pessoas e Território → Territórios** → abra o território da cidade.
2. Clique em **Preparar cidade** (visível apenas para Super Admin).
3. A prévia mostra: cidade, UF, território, gestor, totais (válidos, com geofence,
   duplicidades, inválidos, a criar, a atualizar, a vincular) e riscos/pendências.
   **Nada é gravado** nesta etapa.

### Pela linha de comando (CLI genérica)

```bash
cd backend
DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/<db>" \
  npx tsx src/scripts/prepare-city.ts --city "Nova Cidade" --uf XX --dry-run
```

> Compatibilidade: o script antigo `import-cariacica-neighborhoods.ts` continua
> funcionando como wrapper (delega à CLI genérica com `--city "Cariacica" --uf ES`).

## Passo 4 — Confirmar e importar (grava em produção)

Só execute após revisar a prévia e as pendências.

### Pela interface

Marque o checkbox de confirmação e clique em **Confirmar e importar**. A operação é
idempotente (reexecutar não duplica) e registra **auditoria** (`prepare_city_execute`).

### Pela linha de comando

```bash
cd backend
DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/<db>" \
  npx tsx src/scripts/prepare-city.ts --city "Nova Cidade" --uf XX --apply
```

## Passo 5 — Verificar

- **Admin → Bairros:** a cidade aparece com a contagem de bairros e geofences.
- **Ficha do território → aba Bairros:** mostra a quantidade e a lista de bairros vinculados.

## O que o onboarding NÃO faz (por design)

- **Não** cria território duplicado (reusa o existente).
- **Não** ativa a cidade nem o perfil do gestor — a cidade permanece no status atual
  (ex.: *Planejamento*) até aprovação administrativa/regulatória.
- **Não** libera modalidades bloqueadas por compliance municipal.
- **Não** altera bairros/geofences/territórios de **outras cidades** (isolamento por `city`).

## Idempotência

- Bairros: chave única `(name, city)` → cria ou atualiza, nunca duplica.
- Geofences: chave única `(neighborhood_id)` → `ON CONFLICT DO UPDATE`.
- Reexecutar o mesmo arquivo resulta em `created = 0` e apenas atualizações.

## Endpoints (Super Admin)

- `POST /api/admin/territories/:id/prepare-city/dry-run` → retorna o plano (sem gravar).
- `POST /api/admin/territories/:id/prepare-city/confirm` → body `{ "confirm": true }`
  (confirmação explícita obrigatória); executa a importação e audita.
