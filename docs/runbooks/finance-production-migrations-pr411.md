# PR #411 — segurança da implantação financeira no RDS

As migrations `20260927013000` (#407), `20260927021000` (#408)
e `20260927023500` (#409) são aditivas, mas precisam ser executadas
em ordem em um PostgreSQL descartável antes da implantação.

A suíte `Finance E2E Integrated` passa os **três SQL originais em ordem**
no mesmo schema de teste, além dos testes Prisma com `db push`.

O workflow `deploy-prisma-migrations.yml` agora:
1. **Recusa execução direta por `workflow_dispatch`**: só executa se
   `deploy-backend.yml` passar `orchestrated_by_backend=true`.
2. Antes de construir a imagem ou iniciar a tarefa de migração, confirma
   que o RDS está disponível, cria snapshot manual identificado pelo run
   e aguarda `available`. Confere identifier e ARN.
3. Se faltar IAM para snapshot, o RDS não estiver disponível ou a cópia
   falhar, **a migração e o deploy não prosseguem**.
4. Publica ID de snapshot no resumo do Actions para recuperação humana.
   **Rollback automático da aplicação não reverte migrations.**
5. Mantém o fluxo existente de validação do commit, ECS, migração e
   health check. Não configura nem liga `FINANCE_OFFICIAL_ARCHIVE_ENABLED`.

**Operação:** somente lançar `Deploy Backend` com commit exato da
`main`, `confirmation=DEPLOY_PRODUCTION` e
`prisma_confirmation=APPLY_PRISMA_MIGRATIONS`, depois de verificar
preflight real do banco, RDS, serviço ECS e migration ledger. Jamais usar
`NO_PRISMA_CHANGES` para a primeira implantação das migrations financeiras.

Como a infraestrutura AWS não é acessível diretamente pelos conectores
de consulta do chat, validar no workflow e conferir saída/estado real antes
de declarar produção implantada. Nenhum arquivo SumUp/Asaas real foi fornecido.
