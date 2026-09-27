# Financeiro Premium — PR #407: revisão interna auditável da competência

## Natureza: NÃO é fechamento financeiro definitivo
Este PR cria uma trilha persistente, versionada e auditada da **revisão interna**
de uma competência. `INTERNAL_REVIEW_APPROVED` aprova somente a conferência
interna de dados registrados. NÃO equivale a encerramento fiscal/contábil,
comprovação de faturamento zero, verificação dos extratos SumUp/Asaas,
bloqueio de livro nem aprovação de pagamento.

O PR #406 continua oferecendo a prévia READ ONLY. A fotografia JSON da prévia
é registrada sem modificar lançamentos ou saldos. `review_reasons` retém
explicitamente `EXTERNAL_STATEMENT_AND_ACCOUNTANT_EVIDENCE_MISSING`.

## Máquina de estados
- `DRAFT` → `IN_REVIEW`: FINANCE ou SUPER_ADMIN.
- `IN_REVIEW` → `INTERNAL_REVIEW_APPROVED`: apenas SUPER_ADMIN, período encerrado
  e sem outras pendências internas, fotografia ainda igual à prévia atual.
- `INTERNAL_REVIEW_APPROVED` → `REOPENED`: apenas SUPER_ADMIN, motivo (10–500 chars).
- `REOPENED` permite nova preparação da mesma competência, **versão +1**.
- Versões anteriores permanecem consultáveis; não são editadas nem apagadas.
- Não existe estado `CLOSED` nem endpoint de fechamento definitivo neste PR.
  Integração de comprovantes externos, bloqueio de escrita e homologação real
  são requisitos futuros antes de habilitar o fechamento definitivo.

## API
Base autenticada: `/api/admin/finance/monthly-close`, papéis FINANCE/SUPER_ADMIN.
- `GET /preview?legal_entity_id=...&year=2026&month=8` (PR #406)
- `GET /reviews?legal_entity_id=...&year=2026&month=8`
- `POST /reviews/prepare` com `{legal_entity_id,year,month}`
- `POST /reviews/:id/submit`
- `POST /reviews/:id/approve-internal` (SUPER_ADMIN)
- `POST /reviews/:id/reopen` com `{reason}` (SUPER_ADMIN)
As respostas expõem `finalClosing=false`, `externalStatementsVerified=false`,
`zeroRevenueVerified=false`. Uso `Cache-Control: no-store`.

## Garantias e limites
Unique por CNPJ/competência/versão, transições condicionais CAS (conflitos 409),
trilha `admin_audit_logs` gravada na MESMA transação. Erro na auditoria aciona
rollback da transição. Revisão de outra empresa ou versão histórica não pode ser
alterada. Hash SHA-256 da fotografia exige reconferência antes da aprovação.
Não há pagamentos, baixa, alterações no livro, integração externa, flags ou saldos.
A fotografia verifica alterações antes da aprovação; ela **não** impede alterações
posteriores no livro, por isso este PR não implementa fechamento definitivo.

## Banco
Nova tabela isolada; migration e Prisma schema incluídos **para revisão**.
NÃO executar `prisma migrate deploy`, `prisma db push` nem deploy em RDS produção
sem autorização específica. O CI utiliza apenas Postgres descartável.

## Homologação
`NODE_ENV=test npx vitest run tests/finance-monthly-close-review.test.ts tests/finance-monthly-close-review.integration.test.ts`
deve usar banco local `_test` e a guarda `assertSafeFinanceDatabase()`.
