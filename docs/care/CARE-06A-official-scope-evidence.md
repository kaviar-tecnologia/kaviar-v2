# CARE-06A — prova estruturada nas fontes oficiais existentes

## Objetivo

Fechar a lacuna principal dos gates externos: nenhuma autorização CARE pode ser
representada por um boolean solto sem origem. A entrega evolui, de forma
**aditiva**, as fontes oficiais já existentes de regulação municipal e seguro.

Não cria segundo dispatcher, cadastro regulatório paralelo, apólice paralela,
wallet, ledger ou motor de preço. As ações administrativas adicionadas ficam
nos módulos oficiais já existentes de regulação e seguro; não existe API pública
CARE nem endpoint de liberação. O CARE-04A continua
incondicional e nenhuma corrida CARE é liberada por esta PR.

## Regulação municipal oficial

O enum `MunicipalServiceModality` passa a representar explicitamente:

- `CARE_ASSISTED`
- `CARE_FOLDING_WHEELCHAIR`
- `CARE_ADAPTED_WHEELCHAIR`

A tabela existente `municipal_regulations` recebe metadados de revisão
específica do escopo CARE:

- `care_scope_verified`
- `care_scope_verified_at`
- `care_scope_verified_by_admin_id`
- `care_scope_document_url`

Um registro CARE ativo só pode satisfazer o contrato do banco quando existir
documento oficial, revisão administrativa identificável e posição municipal
definida como `REGULATED` ou `NOT_REGULATED`. A ausência de regra cadastrada
para CAR comum não vira autorização CARE.

Quando a regra municipal exigir aprovação individual, a fonte existente
`municipal_authorizations` precisa possuir autorização `APPROVED_BY_CITY_HALL`,
documento, aprovador e vigência válida para a **mesma modalidade CARE**.

## Seguro oficial

A tabela existente `operational_insurance_coverages` passa a aceitar os três
modos CARE e recebe metadados de revisão explícita do escopo:

- `care_scope_verified`
- `care_scope_verified_at`
- `care_scope_verified_by_admin_id`

Um registro CARE `ACTIVE` exige território específico, documento de apólice/
endosso e revisão administrativa. Cobertura genérica `CAR_PASSENGER`/APP,
`notes`, texto livre ou simples status `ACTIVE` não satisfazem o gate.

`driver_insurance_enrollments` recebe `operational_coverage_id` e a proveniência
`operational_coverage_linked_at` / `operational_coverage_linked_by_admin_id`,
ligando explicitamente motorista/placa à cobertura operacional exata. Assim,
uma inscrição genérica no provedor não pode ser promovida automaticamente para
CARE e um vínculo sem revisor identificado continua inválido. Como
`provider_reference` registra o `NumSeguro` retornado pela Previlemos, o
vínculo e o resolver exigem igualdade exata com o `policy_number` de cobertura
CARE do tipo `APP`. Se apólice-mestra e certificado tiverem números distintos,
não se presume equivalência: será necessário modelar/revisar a relação oficial
antes de permitir o vínculo, sem interpretar nomes/textos livres.

## Evidência tipada e vinculada à corrida

`resolveVerifiedCareScopeEvidence` é read-only e consulta somente as fontes
oficiais existentes. Um resultado positivo contém, em um único bundle:

- corrida, motorista, modalidade CARE e placa;
- território, bairro de origem e revisão territorial;
- coordenada real do embarque coberta pela geofence PostGIS do bairro (ST_Covers, SRID 4326, sem fallback);
- município/UF, registro regulatório, documento e revisão;
- autorização municipal individual quando exigida;
- cobertura, apólice/endosso, documento, vigência e revisão;
- enrollment do motorista ligado à cobertura exata.

O resultado é tipado como `VerifiedCareScopeEvidence` e carrega uma marca de
proveniência em runtime emitida somente pelo próprio resolver. O adaptador
`evaluateCareEligibilityFromDb` deixa de aceitar
`{ municipalAuthorized: true, territoryEligible: true,
insuranceConfirmedForMode: true }` ou objeto plano equivalente construído
livremente e exige o bundle efetivamente emitido pelo resolver. Também revalida
ride, driver, modo, placa e instante da evidência. O instante deve corresponder
exatamente ao momento da decisão: um bundle anterior não pode ser reutilizado
em oferta/aceite posterior, especialmente após revogação.

## Limites que permanecem

Esta entrega ainda **não conecta** o resolver ao dispatcher ou ao aceite,
porque CARE-04A bloqueia antes e a integração operacional positiva exige os
demais gates completos. Não altera pricing, settlement, rotas, wallet,
pagamentos ou workers.

O ponto de embarque agora é verificado com `ST_Covers` no PostGIS pelo mesmo
cliente Prisma de leitura da evidência. Geofence ausente, inválida, fora da área
ou falha de leitura rejeita o bundle. A revisão cadastral, isoladamente, nunca
autoriza a operação. Ainda é necessária homologação territorial real por
modalidade, sem aproveitar fallback de 800 metros da corrida convencional.

A política de preço permanece: nenhuma diferença por idade, deficiência,
mobilidade reduzida, cadeira de rodas, cão-guia, acompanhante necessário ou
tempo extra de embarque. O motor de preço oficial não é alterado nesta PR.

## Migração

`20260929115000_care_official_scope_evidence` é aditiva:

- estende enum oficial;
- adiciona colunas e índices;
- adiciona FKs para fontes oficiais;
- adiciona constraints fail-closed;
- não executa seed;
- não ativa nenhum registro;
- não altera dados financeiros;
- não habilita CARE.

**Não executar a migração em produção nesta etapa.** Deploy e migração exigem
autorização separada após revisão e testes.

## Próximos gates após esta PR

1. Geofence real do ponto de embarque contra território CARE homologado.
2. Fonte oficial de tarifa comparável/paritária e lock antes de qualquer oferta.
3. Integração positiva em banco descartável, exercitando criação, quote, oferta,
   aceite, concorrência, expiração, cancelamento, redispatch e revogação.
4. Parecer jurídico/regulatório, seguradora, operação, privacidade e release.
5. PR isolada futura para qualquer mudança do CARE-04A.
