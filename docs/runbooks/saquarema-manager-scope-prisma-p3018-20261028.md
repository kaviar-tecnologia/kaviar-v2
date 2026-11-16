# Recuperação isolada da migração de escopo de gestores (#801)

## Evidência e alcance

- Deploy #801, commit `65aed97c53f79987568edfbedcdcc2dc5d6ab35f`: falha antes da publicação do backend.
- Migração `20261028203000_manager_neighborhood_scope_versions`: `P3018` / PostgreSQL `42P07`. Os nomes dos dois índices originais foram truncados aos mesmos 63 bytes: `territory_manager_neighborhood_scope_versions_assignment_id_eff`.
- O modo para tabela ausente exige uma única tentativa falha com checksum `bef0f3b23cf61ea503a79888660a96180e1636ded16bd6f471cca0af3c27cc85`, `finished_at` e `rolled_back_at` nulos, `applied_steps_count=0`, log da colisão e ausência da tabela e objetos de prefixo em `public`.
- A correção existente (`d9b2a56a`) tem checksum `607ac2f7b56b2b8f1a33acec4d7ce72ba7dd835c2a93c7e81cfa30109455987b`: transação explícita, 11 colunas, chave primária, três checks, índice único de atribuição/data e FK para atribuições. O índice secundário colidente foi removido.
- O preflight anterior exigia tabela parcial por precaução contra DDL persistente em falhas Prisma/PostgreSQL. Prisma 5.22/PostgreSQL 16 descartável reproduziu o erro e reverteu a DDL inteira; não extrapolar essa observação a todas as versões ou falhas.
- Código que consulta versões em liquidação `wallet-v2`/shadow não deve ser implantado com a tabela ausente. A tabela vazia não ativa participação e preserva o escopo financeiro legado até uma versão explícita vigente. Não recalcular, transferir ou excluir histórico.

## Limitações e critérios obrigatórios

Isto **não é autorização** para alterar produção, publicar código ou modificar finanças. O trabalho local usa somente a main-base e a migração antiga, sem a migração de regularização de gestores. Antes de qualquer ação:

1. Obter autorização específica para revisão, push/merge e execução da recuperação; congelar alterações concorrentes na main e assegurar que nenhum outro processo possa executar migrações ou DDL durante toda a janela. A serialização dos workflows GitHub não impede tarefas manuais ou externas. O preflight encerra sua transação antes de `resolve` e `deploy`: não existe lock/atomicidade entre essas etapas.
2. Revisar CI, o SHA exato e as diferenças com a main, confirmar que a imagem usa o código aprovado e a migration SQL com checksum corrigido acima. O workflow exige que o SHA seja o HEAD atual da main e que haja alteração Prisma em relação ao backend implantado; conferir esse requisito antes de prosseguir.
3. Consultar novamente, em transação `READ ONLY`, histórico Prisma, checksum, demais migrações, catálogo, estrutura da tabela pai e situação financeira, sem exibir credenciais ou dados sensíveis. Exigir exatamente o estado vazio documentado, nenhum outro registro falho e nenhuma outra migração pendente no pacote. O `migrate deploy` aplica **todas** as migrações disponíveis; se houver qualquer outra pendente, parar e isolar a entrega, nunca contornar o preflight.
4. Verificar RDS saudável e plano de restauração, inclusive impacto de perda de alterações posteriores. O workflow cria um novo snapshot privado e aguarda `available` antes de qualquer migração; disponibilidade não equivale a teste de restauração. Registrar seu identificador e verificar capacidade, acesso e responsabilidade operacional.
5. Planejar janela e monitorar aplicação, integridade e liquidação; confirmar que backend atual permanece compatível com a tabela adicional. Preservar todos os registros e documentos. Nunca usar `migrate reset`, `db push`, `DROP`, `--applied` ou restore em produção como atalho.

## Execução somente após autorização

Após CI e autorização separados, com esta alteração revisada na **main** e o SHA correspondente, disparar `Deploy Backend` em `main`:

| Input | Valor |
|---|---|
| `commit_sha` | SHA completo do HEAD aprovado |
| `confirmation` | `DEPLOY_PRODUCTION` |
| `prisma_confirmation` | `APPLY_PRISMA_MIGRATIONS` |
| `migration_recovery_confirmation` | `RECOVER_MANAGER_SCOPE_EMPTY_20261028` |

Apesar do nome e das confirmações legadas, nesse modo o job de publicação do backend é explicitamente bloqueado. O workflow constrói e envia uma imagem de migração ao ECR, cria o snapshot e executa uma task ECS de migração: são ações reais de infraestrutura e banco, não um dry-run. Não disparar com `NONE` nem com a confirmação de tabela parcial para este estado. O workflow de migração avulso rejeita execução não orquestrada.

O preflight confirma a tentativa falha única, erro, checksums, ausência da tabela e objetos de prefixo, e ausência de outras migrações pendentes/falhas. Só então `prisma migrate resolve --rolled-back 20261028203000_manager_neighborhood_scope_versions` registra que **a tentativa falha** foi revertida. Isso não marca a migração como aplicada. Após verificar esse registro, a task executa `prisma migrate deploy` para aplicar realmente o SQL corrigido.

Conferir logs, sucesso da task e, por consultas somente leitura: dois registros históricos (original `rolled_back_at` preenchido, novo `finished_at` preenchido e checksum corrigido), sem outras falhas; 11 colunas, PK, três checks, índice único e FK corretamente definidos; tabela vazia; ausência de mudanças em atribuições, dados financeiros e demais registros; backend ECS e versão anteriores inalterados. Comparar contagens e amostras agregadas pré/pós sem divulgar dados pessoais. Validar `prisma migrate status` na mesma imagem e conexão. Repetir `migrate deploy` em banco descartável foi idempotente; não repetir a opção de recuperação em produção.

## Falha e rollback

- Se preflight falhar, parar sem `resolve`; conferir logs e catálogo. Não enfraquecer as verificações para prosseguir.
- Se falhar após `resolve`, durante ou após `deploy`, interromper outras migrações, inspecionar histórico, catálogo, logs e snapshot; não repetir cegamente nem marcar `--applied`. Uma nova execução depende de plano e autorização para o estado efetivamente encontrado.
- O SQL corrigido é transacional; no teste descartável, uma falha na FK reverteu a DDL. Isso não elimina a necessidade de inspeção após falha operacional.
- Não existe rollback automático do banco. A tabela aditiva vazia pode permanecer sem alterar o backend antigo; a reversão da aplicação não reverte migrações. Uma reversão lógica ou restauração de snapshot/PITR requer plano específico, análise de dados posteriores e autorização própria. Nunca apagar registros de escopo ou financeiros para facilitar rollback.
- Neste modo não há publicação do backend nem frontend a reverter. Se uma implantação separada ocorrer futuramente, restaurar a revisão ECS/frontend anterior por seus procedimentos próprios; isso não restaura o banco.

## Teste automatizado descartável

`backend/tests/manager-neighborhood-recovery-postgres.integration.test.ts` exige opt-in `RUN_SCOPE_RECOVERY_PG_INTEGRATION=1`, banco vazio `scope_recovery_vitest` em `127.0.0.1:65433` e `data_directory` terminando em `/files/scope-recovery-pg`. Use exclusivamente um cluster descartável local nessa localização. O teste aplica baseline sintético, reproduz o SQL original, recupera com Prisma, testa histórico, dados, repetição, FK, checks, unicidade e rollback. Os demais testes de preflight e liquidação não precisam de banco real.
