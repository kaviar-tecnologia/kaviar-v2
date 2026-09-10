# KAVIAR DR Bootstrap (Cutoff 2026-09-10)

Uso exclusivo para banco vazio em Disaster Recovery e novos ambientes locais.

Nao executar em producao existente.
Nao executar sobre banco com dados.
Nao adicionar esta baseline dentro de `backend/prisma/migrations`.

## Snapshot

- Branch de referencia: `main`
- Commit de referencia: `b1c4497c`
- Baseline gerada com fonte canônica:
  - `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
- Ultima migration incorporada no cutoff: `20260909222000_add_ar_places_admin_base`
- Total de migrations incorporadas no cutoff: 139 (somente diretorios timestampados com `migration.sql`)

## Divergencias intencionais e versionadas

- Objetos do `post-prisma-objects.sql` continuam fora do datamodel Prisma por decisao explicita (auditoria/legado operacional/triggers), e por isso aparecem no diff como drops esperados quando comparado apenas contra `schema.prisma`.

## Fluxo esperado

1. Aplicar `pre-bootstrap.sql` (extensoes obrigatorias)
2. Aplicar `baseline.sql` (DDL derivado do schema Prisma atual)
3. Aplicar `post-prisma-objects.sql` (objetos essenciais fora do datamodel)
4. Registrar migrations do cutoff como `applied` com `prisma migrate resolve`
5. Executar `prisma migrate deploy`
6. Executar `prisma migrate status`
7. Executar `prisma migrate diff` contra `prisma/schema.prisma`
8. Validar objetos obrigatorios do `post-prisma-objects.sql`

## Arquivos

- `pre-bootstrap.sql`
- `baseline.sql`
- `post-prisma-objects.sql`
- `migration-cutoff.txt`
