# Prisma migrations em producao

## Regra de credenciais

O backend em producao deve continuar usando o usuario de runtime `kaviar_app` via `DATABASE_URL` da task `kaviar-backend`.

Migrations de banco nao devem usar `kaviar_app`. Elas precisam usar uma credencial separada, com permissao para DDL e controle de `_prisma_migrations`, exposta somente para o workflow/task de migration.

Parametro esperado:

```text
/kaviar/prod/migration_database_url
```

Esse valor deve ser um SSM SecureString e nao deve aparecer em logs, summaries, overrides plaintext ou arquivos do repositorio.

## Workflow oficial

Use o workflow manual:

```text
.github/workflows/deploy-prisma-migrations.yml
```

O workflow:

1. Resolve a task definition atual do servico `kaviar-backend-service` para reutilizar a mesma imagem deployada.
2. Registra uma task definition temporaria `kaviar-prisma-migration`.
3. Substitui somente o secret `DATABASE_URL` pelo parametro SSM `/kaviar/prod/migration_database_url`.
4. Executa `npx --yes prisma migrate deploy` em uma task ECS Fargate one-off.

Nao troque o `DATABASE_URL` do backend runtime para uma credencial admin.

## Banco novo vs banco existente

- Banco existente (incluindo producao): continuar usando `prisma migrate deploy` no fluxo oficial acima.
- Banco novo/vazio (DR, cold start local, CI bootstrap): usar `backend/scripts/bootstrap-new-database.sh`.

Baseline atual para bootstrap de banco novo:

- `backend/prisma/bootstrap/20260910_current`

As migrations historicas em `backend/prisma/migrations` permanecem preservadas e nao devem ser reescritas para esse fluxo.

## Validacoes antes de rodar

Confirmar que o backend atual esta saudavel:

```bash
curl -i https://api.kaviar.com.br/api/health
```

Confirmar que o parametro de migration existe, sem imprimir o valor:

```bash
aws ssm get-parameter \
  --name /kaviar/prod/migration_database_url \
  --region us-east-2 \
  --query 'Parameter.ARN' \
  --output text
```

Confirmar que o workflow nao coloca `DATABASE_URL` em environment plaintext. O valor deve estar em `containerDefinitions[].secrets`.

## Validacoes depois de rodar

Validar historico Prisma:

```sql
SELECT migration_name, finished_at, rolled_back_at, logs
FROM _prisma_migrations
ORDER BY started_at DESC
LIMIT 10;
```

Validar tabelas esperadas:

```sql
SELECT to_regclass('public.kaviar_groups');
SELECT to_regclass('public.kaviar_group_invites');
SELECT to_regclass('public.kaviar_group_members');
```

Validar API publica:

```bash
curl -i https://api.kaviar.com.br/api/groups/invites/CODIGO_TESTE
```

Resultado esperado para convite inexistente:

```json
{"success":false,"error":"Convite nao encontrado"}
```

## Migration rolled_back

Se uma migration ficou `rolled_back`, nao rode `prisma migrate resolve --applied` automaticamente.

Use `resolve --applied` somente quando:

1. O estado real do banco ja corresponde ao conteudo atual da migration.
2. A migration foi revisada para representar o estado desejado.
3. As validacoes de schema foram executadas.
4. Nao ha comandos pendentes que falhariam ou criariam drift.

Comando, quando aprovado:

```bash
npx --yes prisma migrate resolve --applied <nome_da_migration>
```

Para `20260629120000_kaviar_groups`, a Fase 1A atual inclui apenas as tabelas e indices de grupos. `rides_v2.group_id` e `rides_v2.group_source` ficam adiados para uma migration futura.

## Futuro group_id em rides_v2

Quando o produto decidir rastrear corridas por grupo, criar uma migration separada, por exemplo:

```text
202607xx_add_ride_group_tracking
```

Essa migration deve adicionar:

```sql
ALTER TABLE rides_v2 ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE rides_v2 ADD COLUMN IF NOT EXISTS group_source TEXT;
CREATE INDEX IF NOT EXISTS idx_rides_v2_group_id ON rides_v2(group_id);
```

Essa mudanca deve acontecer somente depois que o runner de migration com credencial propria estiver validado.

## Cuidados

- Nunca imprimir `DATABASE_URL` ou senha em logs.
- Nunca usar credencial admin no backend runtime.
- Nunca rodar migration manual diretamente no banco sem registrar o estado no Prisma.
- Conferir health e endpoint publico depois de qualquer migration.
- Manter app passageiro, app motorista, dispatch e frontend admin fora desse processo.
