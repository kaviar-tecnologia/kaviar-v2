# CARE-525 — auditoria de coerência territorial CARE

## Escopo autorizado

Auditoria, testes de caracterização e proposta de correção da coerência entre:

- governança de cobertura territorial;
- bairro e geofence;
- hierarquia `city -> region -> neighborhood`;
- `care-operational-evidence`;
- `care-verified-scope-evidence`.

Este trabalho não autoriza merge, deploy, alteração de banco de produção, ativação CARE, criação de corrida, dispatcher, oferta, aceite, pricing, wallet, cobrança, repasse ou pagamento.

## Base auditada

Base da branch: `6c48ab3e8a370f625556a5c7e3904bad5e3b2548`.

### Evidência read-only de produção em 07/10/2026

Candidato do piloto:

- cidade: Rio de Janeiro/RJ;
- território municipal ativo: `a69da815-b012-40b5-b888-b246151d6ce4`, nível `city`;
- região: Barra da Tijuca, `4094386a-6978-48c5-a07d-4cda238ff163`, nível `region`;
- bairro do motorista: Itanhangá, `c1b26451-9ff1-45f7-a5b0-6c7865f975f9`;
- hierarquia observada: Rio de Janeiro `city` -> Barra da Tijuca `region` -> Itanhangá;
- Rio ativo e Barra ativa;
- `coverage_status=NOT_LOADED` tanto na cidade quanto na região;
- Itanhangá `is_active=true`, `is_verified=false`;
- geofence de Itanhangá existe, é válida e tem SRID 4326;
- fonte observada da geofence de Itanhangá: `PCRJ OpenData`;
- 172 bairros oficiais ativos na cidade;
- 161 bairros com geofence válida;
- 0 bairros com `is_verified=true`;
- nenhum registro `municipal_regulations` CARE para Rio;
- nenhuma `municipal_authorizations` CARE para o motorista candidato.

A diferença de 11 entre bairros oficiais e geofences válidas precisa ser identificada antes de qualquer homologação municipal `COMPLETE`.

## Achado principal

Existem hoje dois contratos territoriais incompatíveis.

### Contrato A — governança territorial administrativa

A rota de governança em `backend/src/routes/admin-ai.ts`:

1. resolve exclusivamente um território de nível `city`;
2. conta bairros oficiais da cidade e de regiões filhas;
3. permite transições:
   - `NOT_LOADED -> AWAITING_REVIEW`;
   - `AWAITING_REVIEW -> COMPLETE`;
   - `COMPLETE -> AWAITING_REVIEW`;
4. grava `coverage_status`, `coverage_reviewed_at` e `coverage_reviewed_by` no território municipal;
5. hoje impede revisão/homologação somente quando o total de bairros oficiais é zero.

Portanto, a unidade de homologação desse fluxo é municipal.

### Contrato B — gate CARE

Os resolvers CARE em:

- `backend/src/services/care/care-operational-evidence.ts`;
- `backend/src/services/care/care-verified-scope-evidence.ts`;

leem o território diretamente relacionado ao bairro e exigem, para uma decisão positiva:

- bairro ativo;
- `neighborhood.is_verified=true`;
- `verified_by` e `verified_at`;
- território diretamente relacionado ao bairro ativo;
- `territory.status='active'`;
- `territory.coverage_status='COMPLETE'`;
- `coverage_reviewed_by` e `coverage_reviewed_at`.

No Rio observado, Itanhangá aponta para Barra da Tijuca, que é `region`, não para o território `city`.

Assim, homologar apenas Rio de Janeiro/`city` pelo fluxo administrativo atual não satisfaz o gate CARE da região Barra.

## Consequência

O item 12 do checklist CARE permanece `NO-GO`.

Não é aceitável resolver o problema por:

- marcar regiões como `COMPLETE` manualmente sem um contrato explícito de governança;
- marcar os 172 bairros como verificados em massa;
- alterar somente os dados do piloto para atravessar o gate;
- tratar a existência de uma geofence como equivalência automática a revisão humana;
- remover as exigências fail-closed do CARE;
- reutilizar permissão genérica de CAR como evidência CARE;
- inventar registro municipal ou seguro.

## Segundo achado — critério de COMPLETE insuficiente

O fluxo administrativo atual só exige `officialNeighborhoods > 0` para permitir entrada em revisão ou homologação.

Isso é insuficiente para uma cidade com cobertura parcial de geofences.

No snapshot read-only do Rio:

- bairros oficiais ativos: 172;
- geofences válidas: 161;
- diferença: 11.

Logo, uma homologação municipal `COMPLETE` não deve ocorrer sem uma regra explícita para os 11 bairros faltantes.

## Proposta de correção

### Princípio 1 — manter a governança municipal

`coverage_status` deve continuar sendo homologado no território `city`, porque o fluxo de governança, o painel territorial e a avaliação de completude trabalham no município.

Não duplicar o mesmo estado administrativo em cada região filha.

### Princípio 2 — resolver o ancestral municipal no CARE

O CARE deve preservar o bairro/região para matching e geofence, mas obter a homologação de cobertura do território municipal ancestral ativo.

Para um bairro ligado a uma região:

`neighborhood -> region -> city`

o gate deve exigir:

- bairro ativo e revisado;
- geofence exata válida;
- região ativa;
- cidade ancestral ativa;
- cidade ancestral `coverage_status=COMPLETE`;
- cidade ancestral com `coverage_reviewed_at/by` válidos.

Para um bairro já ligado diretamente a `city`, o comportamento deve permanecer equivalente.

Nenhum fallback por nome deve conceder autorização positiva em runtime CARE.

### Princípio 3 — bairro continua sendo evidência específica

O requisito de bairro revisado não deve desaparecer.

A proposta é criar um fluxo explícito de revisão de bairro/geofence, auditável, em vez de inferir `is_verified=true` automaticamente porque `geom` existe.

### Princípio 4 — COMPLETE deve ser fail-closed

Antes de `city.coverage_status=COMPLETE`, a governança deve validar no mínimo:

- existência de bairros oficiais ativos;
- cada bairro oficial ativo incluído no escopo tem geofence;
- geofence não nula;
- `ST_IsValid(geom)=true`;
- `ST_SRID(geom)=4326`;
- política explícita para qualquer bairro sem geofence;
- revisão humana/auditável da base.

Enquanto houver 11 bairros sem geofence válida no Rio, o resultado recomendado é no máximo `AWAITING_REVIEW`.

### Princípio 5 — preservar ST_Covers

A checagem de uma corrida CARE deve continuar usando a coordenada real de origem e `ST_Covers` na geofence do bairro.

Não substituir por centro do bairro, raio fixo ou `ST_DWithin`.

## Mudança de código proposta para fase posterior

Nenhuma destas mudanças é implementada neste PR de auditoria.

Uma implementação futura deve preferencialmente:

1. criar helper read-only para resolver cadeia territorial `neighborhood -> region? -> city`;
2. rejeitar hierarquia quebrada, múltipla ou inativa;
3. fazer os dois resolvers CARE consumirem a mesma resolução canônica;
4. manter o `territoryId` de evidência coerente com a unidade utilizada por regulação e seguro;
5. alinhar as rotas administrativas de seguro para a mesma resolução territorial;
6. fortalecer a transição `AWAITING_REVIEW -> COMPLETE` com métricas de geofence;
7. adicionar rota/ação auditável específica para revisão de bairro/geofence;
8. adicionar regressão para bairro ligado diretamente a `city`;
9. adicionar regressão para bairro ligado a `region` filha de `city`;
10. manter fail-closed para geofence ausente, inválida ou SRID diferente de 4326.

## Questão de identidade territorial para seguro/regulação

Hoje `care-verified-scope-evidence` usa `origin.territory_id` como território de evidência e também como chave de `operational_insurance_coverages.territory_id`.

Se a governança de cobertura é municipal, a implementação precisa decidir explicitamente se seguro CARE será cadastrado por:

- município; ou
- região.

A decisão não pode ser implícita.

Para o piloto RJ, a proposta preferencial é município como unidade regulatória/seguro, mantendo a região apenas como escopo operacional/matching, salvo exigência contratual expressa da seguradora.

## Critérios de aceite para uma implementação posterior

Uma correção futura só poderá ser considerada apta quando testes provarem:

- cidade `COMPLETE` não basta se bairro não foi revisado;
- bairro revisado não basta se geofence é inválida;
- região `NOT_LOADED` não bloqueia por si só quando o contrato canônico é cobertura municipal e o ancestral `city` está corretamente homologado;
- região inativa continua bloqueando;
- cidade ancestral não homologada continua bloqueando;
- hierarquia sem ancestral municipal continua bloqueando;
- geofence precisa cobrir exatamente o ponto de origem;
- regulação CARE exata continua obrigatória;
- seguro CARE exato e vínculo do motorista continuam obrigatórios;
- CAR_NORMAL/MOTO/Premium permanecem sem alteração.

## Estado dos itens do dry-run após esta auditoria

- item 14 — motorista + veículo: `GO` para CARE_ASSISTED simples, conforme evidência read-only e correção auditada de placa;
- item 12 — território + regulação: `NO-GO`;
- item 13 — seguro: `PENDING`;
- item 6 — readiness operacional: `PENDING`;
- item 16 — rollback: `GO`;
- item 17 — decisão final: `PENDING`.

## Proibições desta branch

Esta branch não pode:

- alterar dados de produção;
- marcar bairro como verificado;
- alterar `coverage_status`;
- criar registro municipal;
- criar autorização;
- criar cobertura de seguro;
- alterar feature flag;
- habilitar CARE;
- liberar corrida real;
- chamar dispatcher;
- ofertar ou aceitar corrida;
- alterar pricing;
- movimentar wallet;
- cobrar;
- fazer repasse;
- fazer deploy;
- fazer merge sem nova autorização expressa.

## Próxima evidência read-only necessária

Listar nominalmente os 11 bairros oficiais do Rio que não possuem geofence válida `SRID=4326`, classificando a causa:

- sem linha em `neighborhood_geofences`;
- `geom IS NULL`;
- geometria inválida;
- SRID diferente de 4326.

Essa leitura não autoriza correção automática.


## Evidência detalhada dos 11 gaps do Rio

Leitura read-only executada em produção em 07/10/2026 classificou exatamente 11 bairros oficiais ativos que não satisfazem o requisito de geofence válida SRID 4326:

| Bairro | Território atual | Diagnóstico |
| --- | --- | --- |
| Caju | Centro | `GEOM_INVALID` |
| Castelo | Centro | `NO_GEOFENCE_ROW` |
| Cinelândia | Centro | `NO_GEOFENCE_ROW` |
| Freguesia | sem território | `NO_GEOFENCE_ROW` |
| Furnas | Tijuca | `NO_GEOFENCE_ROW` |
| Mata Machado | Tijuca | `NO_GEOFENCE_ROW` |
| Morro do Banco | Tijuca | `NO_GEOFENCE_ROW` |
| Oswaldo Cruz | Madureira | `NO_GEOFENCE_ROW` |
| Santana | Centro | `NO_GEOFENCE_ROW` |
| Tijuquinha | Tijuca | `NO_GEOFENCE_ROW` |
| Turiaçu | Madureira | `NO_GEOFENCE_ROW` |

Resumo objetivo:

- 10 registros sem linha em `neighborhood_geofences`;
- 1 registro com geometria existente porém inválida: Caju;
- nenhum caso desta lista foi classificado como `GEOM_NULL`;
- nenhum caso desta lista apresentou SRID diferente de 4326.

### Histórico já existente no repositório

O documento `docs/GEOFENCE_GAP_REPORT_2026-02-06.md` já registrava seis bairros sem geofence:

- Castelo;
- Cinelândia;
- Freguesia;
- Oswaldo Cruz;
- Santana;
- Turiaçu.

O mesmo relatório já registrava uma geometria inválida no conjunto de geofences do Rio. A leitura atual identifica Caju como o registro inválido.

Portanto, estes sete problemas não devem ser tratados como falha transitória recém-criada.

### Sinal de problema de classificação, não apenas de geometria

O repositório contém evidência histórica de que alguns nomes hoje presentes como `BAIRRO_OFICIAL` foram tratados em outros fluxos como comunidades/localidades:

- `backend/scripts/seed_rj_zone_oeste.js` lista Tijuquinha como comunidade sob Barra da Tijuca;
- o mesmo script lista Mata Machado e Furnas como comunidades sob Alto da Boa Vista;
- `backend/scripts/seed-local-operators-crm.ts` descreve Morro do Banco como comunidade de Itanhangá;
- `backend/scripts/import-neighborhoods-rds.ts` usa `Freguesia (Jacarepaguá)` e `Freguesia (Ilha)`, não um bairro municipal genérico chamado apenas `Freguesia`.

Isso não prova sozinho que os registros atuais estejam errados, mas torna inseguro preencher automaticamente geofences para esses nomes.

Antes de qualquer importação ou homologação, deve ser decidido para cada registro se ele é:

1. bairro oficial municipal;
2. comunidade/localidade interna a um bairro oficial;
3. alias/registro legado de outro bairro;
4. duplicata que deve ser reconciliada.

### Caju

Para Caju, não executar `ST_MakeValid` automaticamente em produção como solução final.

Uma correção geométrica automática pode tornar a geometria tecnicamente válida sem provar que o polígono resultante ainda representa o limite oficial correto.

A correção deve comparar o polígono com a fonte oficial, registrar a proveniência e só então substituir a geometria de forma auditável.

### Consequência para COMPLETE

O Rio não pode ser homologado como `COMPLETE` enquanto:

- os 10 registros sem geofence não forem classificados;
- Caju não tiver geometria oficial válida/revisada;
- não existir uma regra explícita para comunidades/localidades classificadas erroneamente como `BAIRRO_OFICIAL`;
- a revisão dos bairros/geofences continuar em zero.

A próxima etapa recomendada continua sendo somente leitura: inspecionar metadados e possíveis aliases/duplicatas dos 11 registros antes de qualquer correção de dados.


## Classificação pública preliminar dos 11 gaps

A classificação abaixo usa fontes oficiais da Prefeitura do Rio apenas para decidir **o que precisa ser investigado**. Ela não autoriza mutação do banco.

### Bairros oficiais confirmados

- **Caju** — aparece como bairro na abrangência oficial da GLF Centro e em camada oficial municipal de limites de bairros. Portanto o problema é geométrico, não de classificação.
- **Oswaldo Cruz** — aparece como bairro na abrangência oficial da GLF Madureira.
- **Turiaçu** — aparece como bairro na abrangência oficial da GLF Madureira.

Tratamento proposto: obter/validar geometria oficial e preservar o registro como `BAIRRO_OFICIAL`.

### Registro genérico ambíguo

- **Freguesia** — o banco também contém `Freguesia (Ilha)` e `Freguesia (Jacarepaguá)`, ambos tratados como bairros em fontes oficiais da Prefeitura. O registro genérico sem território não deve receber geofence até ser reconciliado com um dos bairros canônicos ou classificado como legado/alias.

Tratamento proposto: não criar polígono para o registro genérico; primeiro auditar referências e origem do registro.

### Localidades/comunidades que não devem ser promovidas automaticamente a bairro oficial

- **Tijuquinha** — a Prefeitura a descreve explicitamente como **comunidade da Tijuquinha, no Itanhangá**.
- **Morro do Banco** — a Prefeitura o localiza **no Itanhangá** e o trata em contexto comunitário.
- **Mata Machado** — fontes municipais a localizam **no Alto da Boa Vista**; documentação municipal de distribuição territorial também associa Mata Machado ao bairro Alto da Boa Vista.
- **Furnas** — documentação municipal a associa ao **Alto da Boa Vista**, não como bairro municipal autônomo.

Tratamento proposto: revisar `area_type`, bairro-pai canônico e referências antes de qualquer geofence de bairro oficial.

### Áreas do Centro que não aparecem na lista oficial de bairros da GLF Centro

- **Castelo**
- **Cinelândia**
- **Santana**

A Prefeitura lista os bairros da GLF Centro sem esses três nomes. Em material institucional do programa Centro para Todos, **Castelo** e **Cinelândia** aparecem como áreas da região do Centro Histórico, e **Campo de Santana** é tratado como espaço/área no bairro Centro.

Tratamento proposto: tratar os três como registros suspeitos de área/localidade/alias, não como bairros oficiais confirmados, até reconciliação com a camada canônica de limites municipais.

### Fontes oficiais consultadas

- Prefeitura do Rio / Desenvolvimento Urbano — Unidades de Licenciamento e Fiscalização: https://desenvolvimentourbano.prefeitura.rio/unidades-de-licenciamento-e-fiscalizacao-licenciamento-urbanistico/
- Prefeitura do Rio / ArcGIS — camada municipal `Bairros_Censo_2022`: https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Censo/Limites_administrativos_Censo_2022/MapServer/2
- Prefeitura do Rio — Centro para Todos / áreas do Centro Histórico: https://www.rio.rj.gov.br/web/guest/exibeconteudo?id=6588718
- Prefeitura do Rio — Tijuquinha no Itanhangá: https://prefeitura.rio/comlurb/comunidade-da-tijuquinha-recebeu-campanha-de-conscientizacao-da-comlurb-nesta-sexta-feira/
- Prefeitura do Rio — regularização da Tijuquinha no Itanhangá: https://prefeitura.rio/habitacao/prefeitura-entrega-mais-de-150-termos-de-reconhecimento-de-moradia-na-tijuquinha-e-inicia-obras-nas-zonas-norte-e-oeste/
- Prefeitura do Rio — Morro do Banco no Itanhangá: https://saude.prefeitura.rio/noticias/prefeitura-do-rio-inaugura-clinica-da-familia-no-morro-do-banco/
- Prefeitura do Rio — Mata Machado no Alto da Boa Vista: https://prefeitura.rio/educacao/prefeitura-inaugura-novos-ginasios-experimentais-tecnologicos-no-alto-da-boa-vista-e-na-lagoa/
- Prefeitura do Rio — Ecoponto Mata Machado / Alto da Boa Vista: https://prefeitura.rio/comlurb/comlurb-inaugura-o-ecoponto-de-mata-machado-na-estrada-de-furnas-no-alto-da-boa-vista/
- Prefeitura do Rio / Assistência Social — Freguesia (Jacarepaguá) em lista de bairros: https://assistenciasocial.prefeitura.rio/cras/

## Decisão técnica após a classificação preliminar

O gap de 11 não deve ser resolvido como um lote único de importação.

A estratégia recomendada é separar:

1. **geometria oficial faltante/inválida**: Caju, Oswaldo Cruz, Turiaçu;
2. **alias/duplicata a reconciliar**: Freguesia genérica;
3. **comunidades/localidades a reclassificar**: Furnas, Mata Machado, Morro do Banco, Tijuquinha;
4. **áreas/localidades do Centro a reconciliar**: Castelo, Cinelândia, Santana.

Antes de qualquer reclassificação/desativação, é obrigatório medir todas as referências desses IDs em tabelas de motoristas, passageiros, corridas e demais chaves estrangeiras.


## Proveniência histórica no Git para registros suspeitos

A auditoria do histórico do repositório encontrou evidência adicional de que alguns nomes atuais de `neighborhoods` nasceram em fluxos antigos de teste/comunidade, não como cadastro canônico de bairro oficial:

- commit `9d00e0948344b18d4f5a26958ff4b2002b26b658` — “FASE 4A: Admin funcional - Dashboard e Bairros implementados” — declara explicitamente **dados de teste** com cinco “bairros”, incluindo **Mata Machado** e **Furnas**;
- commit `12dfcb43a5d25d915d8b7a09d8f6f81a5065fec3` repete esses nomes como **seeds de teste**;
- commit `7d2a7ab93f21dcb2ff93d55731074e2d7d665a95` descreve **Furnas, Agrícola e Mata Machado** como `test communities`;
- commit `de6f6a223622c6ba0226f99e3e0f62b77a671137` classifica explicitamente **Tijuquinha** entre “7 new communities”, enquanto os bairros adicionados separadamente eram Barra da Tijuca, Itanhangá, Anil, Jacarepaguá e Alto da Boa Vista.

Essa evidência histórica não prova, sozinha, qual script gerou os registros atuais de `neighborhoods` em 13/06/2026, mas reforça que **Mata Machado, Furnas e Tijuquinha não devem ser promovidos automaticamente como BAIRRO_OFICIAL**.

O fato de Furnas, Mata Machado, Morro do Banco e Tijuquinha terem exatamente o mesmo `created_at = 2026-06-13T02:30:26.724Z` no banco atual indica forte probabilidade de carga em lote. A origem exata dessa carga ainda deve ser identificada antes de qualquer mutação.


## Regra de domínio KAVIAR — Tijuquinha

Para o modelo territorial operacional da KAVIAR, **Tijuquinha deve ser tratada como comunidade da Zona Oeste vinculada à Barra da Tijuca**, e não como bairro oficial autônomo nem como região `Tijuca`.

Essa regra de domínio foi confirmada pelo proprietário do projeto durante a auditoria CARE-525.

Consequências para a correção futura:

- o registro atual de Tijuquinha em `neighborhoods` com `area_type=BAIRRO_OFICIAL` é incompatível com o modelo desejado;
- o vínculo atual com o território regional `Tijuca` também é incompatível;
- a correção não deve criar uma geofence de **bairro oficial** para Tijuquinha apenas para satisfazer o gate CARE;
- antes de qualquer mutação, devem ser auditadas todas as referências ao ID atual e definido o registro canônico de comunidade/localidade sob Barra da Tijuca;
- qualquer divergência entre a classificação operacional da KAVIAR e nomenclatura de fontes municipais deve ficar explícita no mapeamento, sem ser resolvida por inferência silenciosa.


## Auditoria de referências dos 11 registros

Leitura read-only das chaves estrangeiras para `neighborhoods(id)` em produção mostrou as seguintes tabelas relacionadas:

- `community_leaders.neighborhood_id`;
- `drivers.neighborhood_id`;
- `kaviar_groups.neighborhood_id`;
- `lab_maturity_snapshots.neighborhood_id`;
- `match_logs.neighborhood_id`;
- `neighborhood_geofences.neighborhood_id`;
- `passengers.neighborhood_id`;
- `rides_v2.origin_neighborhood_id`;
- `rides_v2.dest_neighborhood_id`.

### Referências efetivamente encontradas

Foram encontradas referências somente em:

- `lab_maturity_snapshots`:
  - Caju: 1;
  - Castelo: 1;
  - Cinelândia: 1;
  - Freguesia: 1;
  - Oswaldo Cruz: 1;
  - Santana: 1;
  - Turiaçu: 1;
- `neighborhood_geofences`:
  - Caju: 1.

Nenhum dos 11 IDs aparece atualmente como referência em:

- `drivers`;
- `passengers`;
- `rides_v2.origin_neighborhood_id`;
- `rides_v2.dest_neighborhood_id`;
- `community_leaders`;
- `kaviar_groups`;
- `match_logs`.

### Consequência operacional

Isso reduz significativamente o risco de reconciliar os registros suspeitos, mas **não autoriza mutação ainda**.

Em particular, os quatro registros:

- Furnas;
- Mata Machado;
- Morro do Banco;
- Tijuquinha;

não possuem nenhuma referência por chave estrangeira nas tabelas auditadas.

Antes de reclassificar, desativar ou substituir qualquer um deles, ainda é necessário:

1. verificar se já existe registro canônico correspondente em `communities`/estrutura de comunidades;
2. verificar geofence comunitária existente;
3. confirmar parent/bairro canônico correto;
4. procurar referências não protegidas por FK, incluindo campos textuais/JSON relevantes;
5. definir tratamento dos `lab_maturity_snapshots` dos sete registros que possuem snapshot;
6. preservar Caju como bairro oficial e corrigir apenas sua geometria/proveniência, sem apagar o registro.

A ausência de referências em motorista/passageiro/corrida significa que nenhuma migração de usuários ou corridas é necessária para esses 11 registros no estado observado em 07/10/2026.


## Auditoria de comunidades canônicas em produção

Leitura read-only em produção procurou registros em `communities` pelos nomes:

- Tijuquinha;
- Morro do Banco;
- Furnas;
- Mata Machado.

Resultado: **nenhum registro correspondente foi encontrado**.

Portanto, a hipótese anterior de que já existiria uma comunidade canônica pronta para substituir os registros incorretos de `neighborhoods` não se confirmou.

### Consequência arquitetural

O schema atual separa `communities` de `neighborhoods`, mas não possui uma chave estrangeira direta de comunidade para bairro.

O `territory-resolver.service.ts` resolve primeiro comunidade e depois bairro por interseção espacial independente:

1. `community_geofences.geom` via `ST_Covers`;
2. `neighborhood_geofences.geom` via `ST_Covers`.

Assim, uma futura correção de Tijuquinha/Morro do Banco/Furnas/Mata Machado não deve simplesmente criar comunidades por nome. É preciso definir:

- identidade canônica da comunidade;
- geofence comunitária válida;
- proveniência da geometria;
- relação operacional esperada com o bairro-pai;
- mecanismo auditável para impedir divergência espacial entre comunidade e bairro.

### Estado atual desses quatro nomes

No snapshot de produção auditado:

- existem como registros de `neighborhoods`;
- não possuem referências por FK em motoristas, passageiros ou corridas;
- não possuem registros homônimos em `communities`;
- não possuem geofence de bairro;
- pelo menos Tijuquinha tem classificação de domínio KAVIAR como comunidade da Barra da Tijuca.

Isso torna a correção factível, mas ela exige uma etapa explícita de modelagem/carga de comunidade antes de remover ou desativar o registro incorreto em `neighborhoods`.


## Reavaliação arquitetural — escopo regional para o piloto CARE

A evidência acumulada muda a recomendação inicial desta auditoria.

O piloto CARE não precisa provar cobertura territorial de **todo o município do Rio de Janeiro** para operar apenas no escopo Barra da Tijuca. Obrigar `city.coverage_status=COMPLETE` faria 11 inconsistências de outras regiões bloquearem um piloto regional mesmo quando o ponto de origem, o bairro e a região do piloto estiverem corretamente revisados.

Ao mesmo tempo, os resolvers CARE atuais já usam o `territory_id` diretamente ligado ao bairro. Para Itanhangá, isso é a região **Barra da Tijuca**.

### Recomendação preferencial atual

Preservar duas granularidades de governança, com semântica explícita:

- `city.coverage_status`: completude municipal, usada para visão geral/planejamento da cidade;
- `region.coverage_status`: completude operacional daquela região, utilizável como pré-requisito de um piloto regional CARE.

Para o piloto Barra:

`Itanhangá -> Barra da Tijuca (region)`

o gate CARE deve continuar exigindo que:

- Itanhangá esteja ativo e revisado;
- a geofence de Itanhangá seja válida e cubra o ponto real;
- Barra da Tijuca esteja ativa;
- Barra da Tijuca tenha `coverage_status=COMPLETE` com revisão auditável;
- regulação municipal CARE continue sendo verificada para Rio de Janeiro;
- seguro CARE continue sendo vinculado ao escopo definido pelo contrato de seguro.

### Mudança de conclusão em relação à hipótese anterior

A proposta anterior de fazer o CARE herdar obrigatoriamente o `coverage_status` do ancestral municipal não é mais a opção preferencial para o piloto.

Motivos:

1. aumentaria desnecessariamente o blast radius do piloto;
2. acoplaria Barra a inconsistências de Centro, Tijuca, Madureira e outras regiões;
3. o schema já possui `coverage_status` em `operational_territories` independentemente do nível;
4. o runtime CARE já trabalha com o território direto do bairro;
5. a lacuna principal está no fluxo administrativo, que atualmente só permite governança por cidade.

### Correção de código proposta para fase posterior

A implementação deve preferir generalizar a governança de cobertura para um território explícito `city` ou `region`, sem alterar a máquina de estados.

Requisitos mínimos:

- SUPER_ADMIN;
- `territory_id` explícito ou resolução inequívoca;
- apenas territórios ativos em nível `city` ou `region`;
- `expected_status` compare-and-set;
- mesma máquina `NOT_LOADED -> AWAITING_REVIEW -> COMPLETE`;
- contagem e validação de bairros restritas ao território solicitado;
- para `region`, considerar apenas bairros vinculados àquela região;
- `COMPLETE` deve exigir todos os bairros oficiais ativos do escopo com geofence válida SRID 4326 e revisão explícita;
- auditoria deve registrar `territory_id`, nível e quantidade de bairros;
- o frontend não deve inferir região a partir do nome da cidade.

O fluxo atual de cobertura de gestores por cidade pode continuar existindo para planejamento municipal; uma ação regional deve ser explícita para não mudar silenciosamente a semântica já existente.

### Próxima evidência necessária

Antes de implementar qualquer alteração, auditar somente a região Barra da Tijuca:

- total de bairros oficiais ativos diretamente vinculados à região;
- lista nominal;
- geofence presente/válida/SRID;
- `is_verified`, `verified_at`, `verified_by`;
- eventuais bairros sem geofence ou com geometria inválida.

Se o escopo Barra estiver geometricamente íntegro, o CARE-525 poderá propor uma correção pequena e regional em vez de uma limpeza municipal completa como pré-condição do piloto.


## Evidência read-only — escopo regional Barra da Tijuca

Auditoria read-only em produção da região `4094386a-6978-48c5-a07d-4cda238ff163` confirmou:

- nome: Barra da Tijuca;
- nível: `region`;
- território ativo;
- `coverage_status=NOT_LOADED`;
- `coverage_reviewed_at=null`;
- `coverage_reviewed_by=null`.

Foram encontrados exatamente **8 bairros oficiais ativos** diretamente vinculados à região:

1. Barra da Tijuca;
2. Camorim;
3. Grumari;
4. Itanhangá;
5. Joá;
6. Recreio dos Bandeirantes;
7. Vargem Grande;
8. Vargem Pequena.

### Integridade geométrica

Resultado:

- bairros no escopo: 8;
- com geofence válida: 8;
- geofences ausentes ou inválidas: 0;
- todos os oito registros observados usam fonte `PCRJ OpenData`;
- todas as geometrias observadas estão válidas;
- todas têm SRID 4326.

Isso significa que o **escopo geográfico bruto da região Barra está completo para os oito bairros atualmente vinculados**, sem depender dos 11 gaps existentes em outras regiões do Rio.

### Revisão humana/auditável

Apesar da integridade geométrica:

- `is_verified=true`: 0/8;
- `verified_at`: nulo em 8/8;
- `verified_by`: nulo em 8/8.

Portanto, a Barra **ainda não está homologada**. A evidência positiva é apenas de integridade técnica das geometrias, não de revisão administrativa.

### Consequência para CARE-525

O bloqueio territorial do piloto pode ser reduzido ao escopo Barra sem exigir saneamento prévio de todo o município, desde que uma implementação posterior forneça governança regional explícita e auditável.

A sequência segura proposta é:

1. adicionar suporte administrativo explícito a cobertura de `region`, preservando a máquina de estados atual;
2. adicionar uma ação explícita de revisão/homologação de bairros/geofences dentro daquela região;
3. impedir `region -> COMPLETE` enquanto qualquer bairro oficial ativo do escopo:
   - não possuir geofence;
   - possuir geometria inválida;
   - tiver SRID diferente de 4326;
   - não estiver revisado;
4. preservar `ST_Covers` no runtime para o ponto real da corrida;
5. manter regulação municipal CARE e seguro como gates independentes.

### Estado do item 12 após esta evidência

- **geometria do escopo Barra**: `GO` técnico, 8/8 válidas;
- **revisão/homologação dos bairros**: `NO-GO`, 0/8 revisados;
- **coverage_status da região**: `NO-GO`, ainda `NOT_LOADED`;
- **regulação municipal CARE**: `NO-GO/PENDING`, nenhum registro estruturado positivo encontrado.

Consequentemente, o item 12 do dry-run permanece `NO-GO`, mas o bloqueio territorial está agora bem delimitado e não depende dos 11 gaps fora da Barra.


## Lacuna administrativa — revisão de bairros

A inspeção da `main` atual encontrou UI e endpoint de revisão de **geofences de comunidades** em:

- `frontend-app/src/pages/admin/GeofenceManagement.jsx`;
- `PATCH /api/admin/communities/:id/geofence-review`.

Esse fluxo trabalha com `communities/community_geofences`, não com `neighborhoods/neighborhood_geofences`.

Não foi encontrado na `main` um fluxo administrativo equivalente que grave em `neighborhoods`:

- `is_verified`;
- `verified_at`;
- `verified_by`.

Portanto, para os 8 bairros da região Barra, não existe hoje um caminho administrativo canônico identificado para produzir a evidência que o gate CARE exige.

### Implicação

Não usar atualização SQL direta dos oito bairros como solução operacional.

Uma implementação posterior deve criar um fluxo explícito de revisão de bairro/geofence, com:

- SUPER_ADMIN;
- validação de geometria existente;
- `ST_IsValid`;
- SRID 4326;
- proveniência/source;
- gravação atômica de `is_verified`, `verified_at`, `verified_by`;
- audit log;
- possibilidade de revogação/reabertura;
- proteção contra marcar como verificado um registro sem geometria válida.

Esse fluxo deve ser separado da revisão de `community_geofences` para não misturar os dois modelos territoriais.
