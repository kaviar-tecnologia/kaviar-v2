# CARE-503 — leitura administrativa da trilha shadow audit

## Objetivo

Adicionar uma consulta administrativa, read-only, para o SUPER_ADMIN visualizar
registros CARE shadow audit já gravados em `admin_audit_logs`.

Endpoint:

- `GET /api/admin/care-shadow/audit`

## Escopo permitido

A rota pode ler somente registros com:

- `action = CARE_ELIGIBILITY_SHADOW_DECISION`
- `entity_type = care_eligibility_shadow`

Filtros aceitos:

- `rideId`
- `driverId`
- `adminId`
- `status`
- `limit`
- `offset`

## Garantias

A resposta é sempre marcada como read-only e mantém:

- `operationAllowed=false`
- `dispatchAllowed=false`
- `acceptanceAllowed=false`
- `walletAllowed=false`
- `publicCode=CARE_SERVICE_NOT_AVAILABLE`

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

A consulta é específica para CARE shadow audit e não substitui a auditoria
administrativa geral.
