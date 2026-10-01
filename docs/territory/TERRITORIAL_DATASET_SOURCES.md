# Fontes de dados territoriais — política de aquisição

## Objetivo

Este documento define como a KAVIAR deve escolher, validar e registrar fontes de bairros e outras divisões territoriais municipais.

A regra central é:

> **Fonte oficial conhecida tem precedência. OSM é fallback, não autoridade oficial.**

O frontend não deve conhecer detalhes do fornecedor de dados. Ele solicita a aquisição para um município/UF; o backend decide qual provider usar.

## Fluxo de decisão

```text
município + UF
      |
      v
há fonte oficial configurada?
   |              |
  sim            não
   |              |
   v              v
provider       tentar fonte
oficial        comunitária/fallback
   |              |
   +-------> validação
              |
              v
            DRAFT
              |
              v
           PREVIEW
              |
              v
       revisão humana
              |
              v
   APPLY somente autorizado
```

### Regras obrigatórias

1. Uma fonte oficial configurada para a cidade/UF deve ser preferida antes de OSM.
2. Se a fonte oficial configurada falhar, a aquisição deve **falhar fechada**.
3. Não fazer downgrade silencioso de uma fonte oficial conhecida para OSM.
4. OSM pode ser usado quando não existe fonte oficial configurada.
5. Um provider com `isOfficial=true` não torna o dataset automaticamente verificado.
6. `source_verified` permanece `false` até revisão humana/administrativa.
7. Aquisição e PREVIEW não equivalem a APPLY.
8. APPLY exige revisão da prévia e autorização explícita.
9. Não corrigir geometria quebrada por aproximação, snap artificial ou fechamento manual sem uma fonte autoritativa que justifique a alteração.
10. Não criar lógica exclusiva por cidade dentro do provider quando a diferença puder ser expressa como configuração.

## Arquitetura atual

### Provider oficial ArcGIS

Arquivo:

`backend/src/services/territory/providers/official-arcgis-provider.ts`

Responsabilidades:

- consultar ArcGIS REST por HTTPS;
- solicitar GeoJSON em WGS84 (`outSR=4326`);
- mapear o campo oficial de nome para o contrato territorial interno;
- preservar proveniência;
- validar geometrias;
- remover duplicidades por nome normalizado;
- impor timeout, limite de resposta e bloqueio de redirects;
- identificar a KAVIAR nas requisições externas.

O provider é genérico. Ele não deve conter `if` específicos para Diadema ou para outra cidade.

### Catálogo de fontes ArcGIS oficiais

Arquivo:

`backend/src/services/territory/providers/official-territorial-sources.ts`

Uma cidade compatível deve ser adicionada ao catálogo com, no mínimo:

- `id`;
- `city`;
- `uf`;
- `layerUrl`;
- `source`;
- `nameField`.

Quando disponíveis, registrar também:

- `codeField`;
- `objectIdField`;
- `outFields`;
- `areaType`;
- `notes`.

Adicionar uma nova cidade ArcGIS normalmente deve significar **adicionar configuração**, e não duplicar provider.

## Ordem de preferência

A ordem conceitual é:

1. fonte municipal/estadual/federal oficial diretamente responsável pela divisão territorial;
2. serviço GIS oficial publicado pela prefeitura ou órgão competente;
3. outro dataset público oficial verificável;
4. OSM/Overpass como fallback comunitário quando não houver fonte oficial configurada;
5. fonte manual somente com documentação explícita de origem e revisão.

A existência de dados no OSM não prova que a divisão corresponde à nomenclatura oficial de bairros do município.

## Caso de referência: Diadema/SP

Diadema motivou esta política.

A consulta OSM conseguia retornar objetos territoriais, mas o conjunto incluía mistura de bairros oficiais com localidades/vilas e apresentava geometrias problemáticas. Portanto, não era seguro tratar o resultado como divisão oficial para APPLY.

Fonte adotada:

- órgão: Prefeitura de Diadema — GeoDiadema / SEPLAGE;
- serviço: ArcGIS REST;
- camada: bairros oficiais;
- provider: `official-arcgis`.

Validação realizada em 30/09/2026:

- 11 features;
- 11 válidas;
- 0 inválidas;
- 0 duplicadas;
- 0 fora da área esperada no teste do provider;
- 11 bairros oficiais:
  - Campanário
  - Canhema
  - Casa Grande
  - Centro
  - Conceição
  - Eldorado
  - Inamar
  - Piraporinha
  - Serraria
  - Taboão
  - Vila Nogueira

A validação geométrica separada contra o limite municipal oficial encontrou cobertura aproximada de 99,9956%, sem sobreposições relevantes; o pequeno resíduo observado estava na borda municipal.

Essa evidência explica por que **não se deve aceitar automaticamente o primeiro dataset OSM que pareça plausível**.

## Semântica de proveniência

Os campos abaixo respondem perguntas diferentes:

- `is_official=true`: a origem foi classificada pelo código como fonte governamental/oficial configurada.
- `provider_id`: qual provider técnico realizou a aquisição.
- `source_url`: endereço da camada/origem.
- `source_verified=false`: ainda não houve a etapa humana/administrativa de verificação exigida pelo fluxo.

Nunca transformar `is_official=true` em `source_verified=true` automaticamente.

## Quando surgir outro formato

Se a prefeitura não usar ArcGIS:

- GeoJSON HTTP: criar/reutilizar provider genérico para GeoJSON;
- OGC WFS: criar provider WFS reutilizável;
- shapefile/download estático: criar fluxo de importação controlado com proveniência;
- API própria: criar adapter/provider genérico quando houver padrão reaproveitável.

Evitar providers com nome de cidade. Prefira providers por **protocolo/formato** e configurações por cidade.

## Critérios mínimos para adicionar uma fonte oficial

Antes de cadastrar:

- confirmar que o domínio/serviço pertence ao órgão oficial ou é por ele publicado;
- confirmar que a camada representa bairros ou a divisão pretendida, e não pontos, localidades, setores censitários ou regiões administrativas diferentes;
- identificar o campo de nome;
- identificar código/ID estável quando existir;
- obter geometrias em EPSG:4326 ou transformá-las de forma determinística;
- validar FeatureCollection e geometrias;
- checar duplicidades;
- comparar cobertura com o limite municipal quando esse limite estiver disponível;
- verificar sobreposições e vazios relevantes;
- registrar a origem e observações no catálogo;
- adicionar testes de roteamento e provider.

## Anti-padrões

Não fazer:

- `if (city === 'X')` espalhado no serviço de aquisição;
- substituir fonte oficial por OSM quando a API oficial retorna 5xx;
- declarar dataset verificado porque a URL é governamental;
- fechar multipolígonos quebrados no olho;
- misturar bairro, vila, comunidade, distrito e região administrativa sem regra explícita;
- executar APPLY apenas porque o PREVIEW estrutural diz `canProceed=true`;
- transformar uma correção de uma cidade em refatoração ampla não necessária.

## Documentos relacionados

- `docs/territory/TERRITORIAL_ACQUISITION_RUNBOOK.md`
- `backend/src/services/territory/AGENTS.md`
