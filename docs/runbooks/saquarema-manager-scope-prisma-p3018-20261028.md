# Saquarema: recuperação da migração de escopo financeiro do gestor (#801)

## Estado e causa

- Deploy Backend #801, SHA `65aed97c53f79987568edfbedcdcc2dc5d6ab35f`, **falhou antes do deploy do serviço**.
- Migração: `20261028203000_manager_neighborhood_scope_versions`.
- Erro PostgreSQL `42P07`, Prisma `P3018`: os nomes dos índices `...effective_from_key` e `...effective_from_idx` colidiram após o truncamento de identificadores a 63 bytes.
- O workflow criou e validou um snapshot privado RDS **antes** da tentativa de migração. Confirmar ID e disponibilidade nos logs de #801/AWS antes da recuperação.
- O PostgreSQL pode ter persistido a tabela e o primeiro índice antes do erro, mesmo que o Prisma tenha marcado a migração como falha.

**Não executar** re-run de #801, `prisma migrate deploy`, `db push`, `migrate reset`, `DROP TABLE`, nem restore de snapshot sem inspeção e autorização específica. Não ativar operações remuneradas de Jorge Regis antes das demais condições de ativação.

## Correção de código

O hotfix remove o índice secundário redundante (a chave única já suporta leituras ordenadas) e torna a migração segura para instalação limpa **ou** para repetição sobre a tabela e o índice único parcialmente criados. Uma transação `BEGIN/COMMIT` mantém futuras execuções atômicas.

## Procedimento autorizado de recuperação (operador com acesso auditável ao RDS)

1. Confirmar que não existe outro deploy ou migração em execução e que o snapshot privado pré-#801 está `available`. Registrar o identificador e o commit exato do hotfix.
2. Efetuar somente inspeção de leitura, em sessão autenticada e segura na rede do RDS, sem imprimir senhas em logs:

   ```sql
   SELECT migration_name, started_at, finished_at, rolled_back_at,
          left(coalesce(logs, ''), 500) AS log_excerpt
   FROM _prisma_migrations
   WHERE migration_name = '20261028203000_manager_neighborhood_scope_versions'
   ORDER BY started_at DESC;

   SELECT to_regclass('public.territory_manager_neighborhood_scope_versions') AS scope_table;

   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'territory_manager_neighborhood_scope_versions';

   SELECT conname, contype, pg_get_constraintdef(oid) AS definition
   FROM pg_constraint
   WHERE conrelid = to_regclass('public.territory_manager_neighborhood_scope_versions');

   SELECT count(*) FROM public.territory_manager_neighborhood_scope_versions;
   ```

3. **Parar e escalar** se o registro Prisma não estiver `failed`, se a tabela tiver linhas (alteração operacional inesperada), se a estrutura não corresponder à migração, se houver outro índice conflitante ou se o snapshot não estiver disponível. Não mascarar discrepâncias com `IF NOT EXISTS`.
4. Com aprovação explícita do responsável e usando a imagem/credenciais confinadas à task ECS, apontadas ao **mesmo RDS**, executar apenas:

   ```sh
   npx prisma migrate resolve --rolled-back 20261028203000_manager_neighborhood_scope_versions
   ```

   Isso resolve o *registro de migração falha* e **não remove** a tabela nem seus dados. Não usar `--applied`, pois a chave estrangeira pode não existir.
5. Confirmar que a resolução consta em `_prisma_migrations`. Fazer merge do hotfix com CI verde e, **somente depois**, disparar um novo `Deploy Backend` pelo workflow protegido apontado ao novo SHA. A migração corrigida deve completar e o deploy publicar o backend atualizado.
6. Verificar `prisma migrate status`, existência da FK, índices esperados, endpoint de saúde e versão efetivamente ativa. Só depois executar o deploy do frontend e validar a guia `Gestão de bairros` no admin. O gestor continua com escopo financeiro original até que uma versão seja explicitamente criada e entre em vigor.

## Observações de segurança

- Sem autorização separada para `migrate resolve`, a correção fica **apenas em PR**.
- Não automatizar recuperação a partir de mera presença do código do hotfix: a verificação do estado real do banco é obrigatória.
- O processo é prospectivo: não recalcular nem transferir créditos de corridas passadas.
