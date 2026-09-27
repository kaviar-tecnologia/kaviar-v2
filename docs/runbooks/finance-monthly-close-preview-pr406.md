# Financeiro Premium — PR #406: prévia de fechamento mensal sem receita registrada

## Escopo
Este PR **não fecha competência**: oferece uma leitura segura para conferir
o mês por CNPJ, com obrigações de duas origens separadas e controles de
atribuição. Não grava saldo, fechamento, baixa, lançamento, comprovante
ou aprovação contábil; não mexe em SumUp/Asaas e não altera flags.

Endpoint autenticado com perfis FINANCE/SUPER_ADMIN:

`GET /api/admin/finance/monthly-close/preview?legal_entity_id=<UUID>&year=2026&month=8`

Retorno sempre declara `mode=PREVIEW_ONLY`, `closingStatus=NOT_CLOSED`,
`readyForFinalClosing=false`, `externalStatementsVerified=false`,
`zeroRevenueVerified=false` e cabeçalho `Cache-Control: no-store`.

## O que significa mês sem faturamento no teste
`ledgerEvidence=NO_POSTED_INCOME_IN_SCOPED_LEDGER` significa somente que
não foram encontrados lançamentos IN/INCOME em estado
POSTED/RECONCILED/CLOSED no livro financeiro da empresa e competência
consultadas. Não prova faturamento zero, ausência de receitas externas,
saldo zero nem situação tributária. A conta pode ter saldo de abertura,
despesas ou contas a pagar mesmo sem receita registrada.

Até o encerramento do mês de calendário, `PERIOD_NOT_ENDED` é
impedimento explícito; os filtros das datas de competência usam intervalo
UTC [primeiro dia, primeiro dia seguinte), mas a conclusão do mês no
calendário usa **meia-noite de America/Sao_Paulo**, não meia-noite UTC. O teste de agosto de 2026 já está encerrado e
setembro de 2026 ainda não estava encerrado em 26/09/2026.

## Dados separados por origem
- `ledger.postedIncomeEntries`: contagem e soma em centavos **dos
  lançamentos IN/INCOME finalizados no livro** (não um extrato bancário);
- `ledger.nonFinalTransactionCount`: DRAFT/PENDING/BLOCKED;
- `ledger.unassignedTransactionCount`: lançamentos cuja conta está
  atribuída ao CNPJ, mas o próprio lançamento não tem CNPJ;
- `ledger.mismatchedAccountTransactionCount`: lançamento do CNPJ com
  conta que pertence a outro CNPJ (ou não consta entre contas atribuídas);
- `ledger.unallocatedBusinessUnitCount`: sem unidade de negócio;
- `obligations.finance` e `obligations.accountantPortal`: volumes
  separados por status e valores registrados. As duas origens **podem
  representar a mesma dívida**; não somar cegamente os subtotais.

Nenhum valor das duas fontes é transformado em receita ou saldo bancário.

## Pendências de revisão
Mesmo com tudo vazio, a prévia mantém
`EXTERNAL_STATEMENT_AND_ACCOUNTANT_EVIDENCE_MISSING`. Outras condições:
competência ainda não encerrada, falta de conta vinculada, atribuição
CNPJ/unidade pendente, divergência de conta e obrigações pendentes.
O fechamento definitivo com bloqueio/reabertura e evidência de provedor
fica para outro PR, após definição do processo e aprovação.

## Homologação (PostgreSQL descartável)
Os testes montam empresas e contas **sintéticas no banco local de teste**,
incluindo conta com saldo de abertura não zero, competência sem receita mas
com obrigações financeira e contábil, lançamentos futuros/de outro mês,
lançamento sem CNPJ e com conta de outra empresa. Conferem que não há
alteração do estado/valor das contas e lançamentos.

```bash
cd /home/goes/kaviar/backend
NODE_ENV=test npx vitest run tests/finance-monthly-close-preview.test.ts \
  tests/finance-monthly-close-preview.integration.test.ts
```

A suíte integrada de CI provê um PostgreSQL de teste descartável e executa
essa validação junto às regressões dos PRs #403, #404, #405 e dos provedores.
**Nunca** apontar a suíte a RDS ou banco de produção.
