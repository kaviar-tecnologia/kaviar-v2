# Runbook — aquisição territorial por município

## Quando usar este runbook

Use este procedimento quando:

- o frontend não consegue preparar bairros de um município;
- a aquisição retorna poucos/muitos bairros;
- aparecem vilas/localidades no lugar de bairros;
- há geometrias inválidas;
- o OSM/Overpass falha ou fica inconsistente;
- um município novo precisa ser habilitado;
- for necessário decidir entre fonte oficial e fallback.

O objetivo é resolver o problema pela fonte correta, sem gambiarra por cidade e sem escrever geofences antes da revisão.

---

## 1. Confirmar o escopo

Registrar:

- município;
- UF;
- `territory_id`;
- objetivo da divisão: bairros, distritos, regiões administrativas etc.;
- se a ação é investigação, aquisição DRAFT, PREVIEW ou APPLY.

**Não executar APPLY durante diagnóstico.**

---

## 2. Verificar se já existe fonte oficial configurada

Arquivo:

`backend/src/services/territory/providers/official-territorial-sources.ts`

Se a cidade/UF já estiver cadastrada:

1. usar o provider oficial;
2. não consultar OSM como substituto silencioso;
3. se a fonte oficial falhar, investigar a fonte;
4. manter falha fechada até resolver ou remover conscientemente a configuração em mudança revisada.

Se a cidade não estiver cadastrada, seguir para descoberta.

---

## 3. Procurar primeiro uma fonte oficial

Priorizar canais do próprio poder público:

- portal GIS/geoprocessamento da prefeitura;
- portal de dados abertos municipal;
- ArcGIS REST Services Directory;
- MapServer/FeatureServer;
- OGC WFS;
- GeoJSON publicado;
- download oficial de shapefile/geopackage;
- órgão estadual/federal competente quando a divisão for oficialmente mantida por ele.

### ArcGIS

Indícios comuns:

```text
/server/rest/services/
/MapServer
/FeatureServer
```

Inspecionar a camada e confirmar:

- geometria Polygon/MultiPolygon;
- descrição da camada;
- campo que contém o nome do bairro;
- código oficial quando existir;
- SR/CRS;
- quantidade de features;
- endpoint `/query`;
- suporte a `f=geojson`.

Não escolher uma camada apenas pelo nome parecido.

Exemplos de camadas que **não** são equivalentes a bairros:

- setores censitários;
- zonas de planejamento;
- regiões;
- distritos;
- loteamentos;
- pontos de referência;
- localidades.

---

## 4. Fazer prova somente leitura

Antes de alterar catálogo ou banco:

1. consultar a API diretamente;
2. solicitar somente os campos necessários;
3. obter geometrias;
4. contar features;
5. listar os nomes;
6. validar formato e CRS;
7. não criar dataset persistido nesta etapa se a prova puder ser feita diretamente no provider.

Para ArcGIS, preferir:

- HTTPS;
- GET;
- `where=1=1`;
- `returnGeometry=true`;
- `outSR=4326`;
- `f=geojson`.

---

## 5. Validar a qualidade territorial

A fonte precisa ser plausível **e** estruturalmente válida.

### Validar pelo menos

- FeatureCollection válida;
- Polygon/MultiPolygon válidos;
- nomes não vazios;
- cidade/UF corretas;
- duplicidades;
- IDs/códigos estáveis;
- quantidade de bairros;
- geometrias fora do município;
- sobreposição relevante entre bairros;
- lacunas relevantes;
- cobertura do limite municipal, quando disponível.

### Comparação com limite municipal

Quando houver limite oficial:

1. validar a geometria municipal;
2. unir os bairros;
3. comparar área da união com área municipal;
4. medir:
   - área faltante;
   - área fora do limite;
   - sobreposições;
5. inspecionar diferenças relevantes.

Pequenos resíduos de borda podem decorrer de precisão cartográfica. Não corrigi-los artificialmente apenas para obter 100%.

---

## 6. Decidir o tipo de provider

### Se for ArcGIS REST

Reutilizar:

`OfficialArcGisProvider`

Adicionar somente uma configuração em:

`official-territorial-sources.ts`

Não criar `DiademaProvider`, `CidadeXProvider` etc.

### Se for formato ainda não suportado

Criar um provider reaproveitável por protocolo/formato, por exemplo:

- `OfficialWfsProvider`;
- `OfficialGeoJsonProvider`.

A cidade deve entrar como configuração desse provider.

---

## 7. Registrar proveniência

A aquisição deve preservar, quando disponíveis:

- provider;
- URL;
- nome do órgão;
- método;
- data de coleta;
- IDs/códigos da fonte;
- observações;
- natureza oficial ou comunitária.

### Regra crítica

`isOfficial` e `source_verified` não são sinônimos.

Mesmo após adquirir de uma prefeitura:

```text
is_official = true
source_verified = false
```

até a revisão humana/administrativa apropriada.

---

## 8. Regras de fallback

### Fonte oficial configurada

Se existe uma fonte oficial configurada e ela falha:

```text
FALHAR FECHADO
```

Não consultar OSM silenciosamente para produzir um dataset que pareça equivalente.

### Sem fonte oficial configurada

OSM/Overpass pode ser usado como fallback para aquisição preliminar, sujeito à validação e revisão.

OSM não deve ser apresentado automaticamente como divisão municipal oficial.

---

## 9. O que fazer quando o OSM estiver quebrado

Problemas comuns:

- relation incompleta;
- ways que não fecham;
- membros ausentes;
- endpoint 406/429/5xx;
- mistura de `boundary=administrative` com `place=*`;
- bairros e vilas no mesmo conjunto;
- nomes duplicados;
- limites que atravessam o município.

### Não fazer

- snap artificial entre endpoints;
- fechar polígono manualmente sem fonte;
- apagar features até “ficar bonito”;
- escolher uma geometria apenas porque ela renderiza;
- reduzir validações para permitir APPLY.

Quando a fonte comunitária se mostrar inadequada, procurar a fonte oficial antes de alterar a geometria.

---

## 10. Testes obrigatórios ao adicionar uma cidade oficial

Adicionar/ajustar testes que provem:

1. `supports({city, uf})`;
2. URL/query correta;
3. mapeamento do campo de nome;
4. proveniência;
5. geometria inválida rejeitada;
6. duplicidade tratada;
7. roteamento escolhe provider oficial antes do OSM;
8. bbox OSM não é consultado quando desnecessário;
9. erro da fonte oficial não gera fallback silencioso;
10. fluxos OSM existentes continuam funcionando para cidade sem fonte oficial.

Bateria territorial de referência:

```bash
cd backend

npx vitest run \
  tests/territorial-dataset-acquisition.test.ts \
  tests/territorial-official-arcgis-provider.test.ts \
  tests/territorial-official-acquisition-routing.test.ts \
  tests/territorial-dataset-apply.test.ts \
  tests/city-preparation.test.ts

npm run build
```

Também executar:

```bash
git diff --check
```

Não usar uma suíte completa pesada como substituto da bateria diretamente afetada sem entender os requisitos de banco/ambiente.

---

## 11. Fluxo operacional seguro

### Etapa A — código e testes

- descobrir fonte;
- implementar/configurar provider;
- testes;
- build;
- revisão.

### Etapa B — aquisição

Após deploy autorizado, aquisição pode criar um dataset em `DRAFT`.

### Etapa C — PREVIEW

Gerar PREVIEW e revisar:

- quantidade de bairros;
- nomes;
- creates/updates;
- links;
- geometrias;
- proveniência;
- source verification.

### Etapa D — APPLY

Somente após autorização explícita.

APPLY é a etapa que pode alterar bairros/geofences e deve ser tratada separadamente de aquisição/PREVIEW.

---

## 12. Critérios para interromper o processo

Bloquear avanço quando houver:

- fonte oficial ambígua;
- camada errada;
- geometria inválida material;
- bairros ausentes;
- duplicidades não explicadas;
- sobreposição territorial relevante;
- cobertura municipal incoerente;
- proveniência incerta;
- fallback silencioso;
- testes territoriais vermelhos;
- diferença inesperada no PREVIEW.

Não “compensar” um bloqueio reduzindo a validação.

---

## 13. Caso de estudo — Diadema/SP

### Sintoma

A aquisição via OSM retornava um conjunto plausível, porém não seguro para uso oficial:

- mistura de bairros e localidades/vilas;
- multipolígonos problemáticos;
- instabilidade dos mirrors Overpass.

### Diagnóstico correto

Foi encontrada a fonte municipal GeoDiadema, publicada pela Prefeitura de Diadema/SEPLAGE via ArcGIS REST.

### Resultado

Camada oficial de bairros:

- 11 bairros;
- 11 geometrias válidas;
- nomes oficiais coerentes;
- sem duplicidade;
- cobertura geométrica praticamente integral do município.

### Decisão arquitetural

Em vez de corrigir Diadema com código especial:

1. foi criado um provider ArcGIS genérico;
2. foi criado um catálogo de fontes por cidade/UF;
3. Diadema virou uma entrada de configuração;
4. fonte oficial ganhou precedência;
5. falha oficial passou a falhar fechada;
6. OSM continuou como fallback para cidades sem fonte oficial.

Esse é o padrão a repetir.

---

## 14. Checklist rápido para a próxima cidade

```text
[ ] Município e UF confirmados
[ ] Tipo de divisão confirmado
[ ] Catálogo atual consultado
[ ] Fonte oficial pesquisada
[ ] Camada correta identificada
[ ] Query read-only testada
[ ] Nomes conferidos
[ ] Geometrias válidas
[ ] Duplicidades checadas
[ ] Limite municipal comparado, se disponível
[ ] Provider genérico reutilizado
[ ] Configuração adicionada
[ ] Proveniência preservada
[ ] source_verified continua false
[ ] Testes de roteamento adicionados
[ ] Regressões OSM verdes
[ ] Build verde
[ ] DRAFT/PREVIEW revisados
[ ] APPLY ainda bloqueado até autorização
```

## Referência

Ver também:

- `docs/territory/TERRITORIAL_DATASET_SOURCES.md`
- `backend/src/services/territory/AGENTS.md`
