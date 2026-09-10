# Database Bootstrap - Disaster Recovery (Local Validation)

Escopo: reconstruir banco vazio para novos ambientes e DR sem alterar historico de migrations em producao existente.

## Principios

- Nao editar migrations historicas.
- Nao criar baseline em backend/prisma/migrations.
- Nao executar bootstrap em producao existente.
- Nao usar banco nao vazio.
- Nao usar host nao local durante validacao.

## Pacote local

- backend/prisma/bootstrap/20260910_current/pre-bootstrap.sql
- backend/prisma/bootstrap/20260910_current/baseline.sql
- backend/prisma/bootstrap/20260910_current/post-prisma-objects.sql
- backend/prisma/bootstrap/20260910_current/migration-cutoff.txt
- backend/scripts/bootstrap-new-database.sh
- backend/scripts/check-bootstrap-package.sh

## Fluxo

1. Aplicar extensoes obrigatorias (pre-bootstrap.sql)
2. Aplicar baseline Prisma atual (baseline.sql), gerada de `schema.prisma` via `prisma migrate diff --from-empty --to-schema-datamodel`
3. Aplicar objetos essenciais fora do datamodel (post-prisma-objects.sql)
4. Registrar migrations do cutoff via prisma migrate resolve --applied
5. Rodar prisma migrate deploy
6. Rodar prisma migrate status
7. Rodar prisma migrate diff contra schema e exigir diff vazio
8. Validar objetos extras obrigatorios por nome e predicado

## Observacoes de reproducibilidade

- Nao usar banco local mutado como fonte canonica de baseline.
- Divergencias intencionais devem ser explicitas e versionadas (sem ocultar drift generico).

## Extensoes obrigatorias

- postgis
- pgcrypto

## Objetos extras obrigatorios

- municipal_regulatory_driver_protocols_case_driver_null_modality
- municipal_authorizations_open_manual_draft_key

## Aviso

Este procedimento e para banco vazio de DR. Producoes existentes continuam no fluxo normal de migrations historicas.
