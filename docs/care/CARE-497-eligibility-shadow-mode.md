# CARE-497 — Eligibility shadow mode

## Estado

Este documento registra o primeiro shadow mode de elegibilidade do CARE.

Este PR não libera CARE oficial, não habilita CARE público, não cria corrida CARE real, não envia oferta para motorista, não permite aceite CARE real, não altera pricing, não altera wallet, não cria migration, não altera app, não altera variáveis de produção e não faz deploy.

## Objetivo

Permitir uma avaliação interna, explícita e fail-closed da elegibilidade CARE usando o adaptador read-only já existente.

O resultado serve para observação, auditoria técnica e testes. Ele não autoriza operação real.

## Serviço criado

Arquivo:

- `backend/src/services/care/care-eligibility-shadow-mode.ts`

Função principal:

- `evaluateCareEligibilityShadowMode`

Flag interna:

- `CARE_ELIGIBILITY_SHADOW_ENABLED`

A flag é desligada por padrão. Mesmo quando ligada em teste ou ambiente controlado, ela não permite operação real.

## Garantia operacional

A resposta do shadow mode sempre mantém:

- `shadowOnly: true`;
- `operationAllowed: false`;
- `dispatchAllowed: false`;
- `acceptanceAllowed: false`;
- `walletAllowed: false`;
- `publicCode: CARE_SERVICE_NOT_AVAILABLE`.

## O que o shadow mode faz

Quando chamado explicitamente e com a flag interna ligada, ele:

- normaliza `rideId`;
- normaliza `driverId`;
- valida relógio;
- chama `evaluateCareEligibilityFromDb`;
- retorna a decisão de elegibilidade;
- adiciona o motivo `CARE_SHADOW_ONLY_NOT_OPERATIONAL`;
- gera um `auditEvent` estruturado.

## O que o shadow mode não faz

Ele não:

- abre rota pública;
- altera `rides-v2`;
- cria corrida;
- cria `care_trip_requirements`;
- chama dispatcher;
- cria oferta;
- permite aceite;
- chama pricing;
- chama wallet;
- faz settlement;
- faz payout;
- altera produção;
- altera variáveis de produção;
- faz deploy.

## Motivos internos adicionados

- `CARE_SHADOW_DISABLED`;
- `CARE_SHADOW_INPUT_INVALID`;
- `CARE_SHADOW_EVALUATION_EXCEPTION`;
- `CARE_SHADOW_ONLY_NOT_OPERATIONAL`.

## Relação com #496

A matriz #496 exige que shadow mode sem rastro seja tratado como risco. Este PR começa o rastro técnico com um `auditEvent` retornado pela função, sem persistência e sem migration.

Persistência futura, se necessária, deve ser outro PR específico e autorizado.

## Critério de aceite

O #497 só está correto se:

- shadow mode estiver desligado por padrão;
- o serviço não estiver ligado a rota pública;
- o serviço não estiver ligado ao dispatcher;
- o serviço não estiver ligado ao aceite;
- o serviço não estiver ligado ao pricing;
- o serviço não estiver ligado ao wallet;
- `operationAllowed` for sempre `false`;
- `dispatchAllowed` for sempre `false`;
- `acceptanceAllowed` for sempre `false`;
- `walletAllowed` for sempre `false`;
- a resposta pública permanecer `CARE_SERVICE_NOT_AVAILABLE`;
- os testes provarem que nenhum fluxo real foi aberto.

## Fora de escopo

Ficam fora deste PR:

- operação CARE oficial;
- botão público;
- corrida CARE real;
- oferta real;
- aceite real;
- pricing CARE oficial;
- wallet CARE;
- settlement CARE;
- payout CARE;
- persistência de auditoria;
- migration;
- deploy;
- produção.
