# CARE-504 — relatório administrativo read-only de readiness CARE

## Objetivo

Adicionar um relatório administrativo, read-only, para o SUPER_ADMIN consultar o
estado consolidado do CARE sem liberar operação real.

Endpoint:

- `GET /api/admin/care-shadow/readiness`

## O que o relatório mostra

- flags oficiais CARE lidas do ambiente;
- release flags obrigatórias;
- flags obrigatórias ausentes;
- estado da política pública atual;
- bloqueadores de liberação;
- contagem de audit logs CARE shadow;
- últimos audit logs CARE shadow.

## Garantias

A resposta mantém:

- `releaseReady=false`
- `publicCareAvailable=false`
- `officialCareAvailable=false`
- `operationAllowed=false`
- `dispatchAllowed=false`
- `acceptanceAllowed=false`
- `walletAllowed=false`
- `publicCode=CARE_SERVICE_NOT_AVAILABLE`

Mesmo se todas as release flags estiverem `true`, o relatório continua indicando
que a política atual permanece bloqueada até implementação, revisão e autorização
explícita do fluxo oficial CARE.

## Fora de escopo

Este PR não cria corrida CARE.

Este PR não executa harness.

Este PR não aciona dispatcher.

Este PR não permite aceite de motorista.

Este PR não altera pricing.

Este PR não altera wallet.

Este PR não altera app passageiro.

Este PR não altera app motorista.

Este PR não cria migration.

Este PR não altera produção.

Este PR não faz deploy.

## Segurança

A rota usa a proteção existente de `/api/admin/care-shadow`:

- `authenticateAdmin`
- `requireSuperAdmin`

O relatório é observabilidade administrativa. Ele não é um controle de liberação
operacional.
