# CARE-513 - inventario de evidencias para dry-run

## Decisao

Este documento define o inventario minimo de evidencias para preparar o primeiro dry-run interno do CARE.

O dry-run aqui descrito e somente read-only. Ele serve para observar prontidao, lacunas e riscos antes de qualquer liberacao operacional.

Este contrato nao autoriza CARE publico, CARE oficial, corrida real, despacho real, aceite real, cobranca, wallet ou repasse.

## Estado atual obrigatorio

CARE continua bloqueado.

- `CARE_SERVICE_NOT_AVAILABLE`
- `CARE_REQUIREMENTS_MISSING`
- `releaseReady=false`
- `publicCareAvailable=false`
- `officialCareAvailable=false`
- `operationAllowed=false`
- `dispatchAllowed=false`
- `acceptanceAllowed=false`
- `walletAllowed=false`

## Inventario minimo

O primeiro dry-run interno precisa registrar evidencias sobre:

- GitHub: PRs, commits, checks e ausencia de deploy;
- readiness admin read-only;
- contratos CARE-508, CARE-510, CARE-511 e CARE-512;
- passageiro e escopo de elegibilidade;
- territorio, municipio, regulacao, cobertura e seguro;
- motorista e qualificacao CARE;
- veiculo e capacidade CARE;
- pricing sem discriminacao por idade, deficiencia ou morbidade;
- dispatcher somente simulado;
- aceite somente simulado;
- wallet e repasse bloqueados;
- observabilidade, auditoria e rollback.

## Proibicoes

O dry-run nao pode:

- criar corrida real;
- chamar dispatcher real;
- oferecer corrida a motorista;
- permitir aceite real;
- gerar cobranca;
- movimentar wallet;
- disparar pagamento;
- alterar passageiro, motorista, veiculo, territorio ou requisito CARE.

## Criterios de aceite

Um dry-run interno so pode ser considerado pronto quando houver:

- commit da main identificado;
- PRs CARE relacionados identificados;
- checks remotos verdes;
- testes locais relevantes verdes;
- ausencia de deploy para o HEAD validada;
- readiness admin read-only coletado;
- flags fail-closed confirmadas;
- rotas de criacao, dispatcher, aceite e wallet bloqueadas;
- territorio, seguro e regulacao registrados;
- motorista e veiculo avaliados somente por leitura;
- pricing validado sem discriminacao;
- rollback descrito;
- decisao final registrada como go, no-go ou pendente.

## Fora de escopo

Este PR nao altera backend operacional, app mobile, Prisma schema, migrations, infra, workflows, secrets, producao, dispatcher, aceite, pricing, wallet ou pagamentos.

Este PR nao habilita CARE publico ou oficial.

## Decisao final

CARE-513 prepara o inventario do primeiro dry-run interno, mas mantem o produto real fechado.

O objetivo e reduzir incerteza antes de operar, nao operar.
