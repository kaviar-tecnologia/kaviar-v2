# Financeiro Premium — PR #405: staging persistente SOMENTE no PostgreSQL descartável de testes

## Premissa operacional
A KAVIAR ainda não faturou via SumUp/Asaas em produção. O projeto pode ser
homologado tecnicamente com cenários sintéticos, mas esses valores **não** devem
aparecer como receita real, saldo bancário, repasse ou pagamento da KAVIAR.

## Escopo seguro
Este PR adiciona:
- DDL isolado em `backend/tests/fixtures/finance/synthetic-staging.sql`;
- serviço de persistência em `backend/tests/support/finance/`;
- teste real de PostgreSQL e de rollback;
- CI obrigatório e runbook.

**Não adiciona schema/migration Prisma, rota HTTP, tela, seed de produção,
chamada a provedor, alteração no livro `financial_transactions`, saldo de
carteira, baixa de obrigação ou instrução Pix.** O DDL está fora da árvore
`backend/prisma/migrations`: só é aplicado pelo teste no PostgreSQL descartável.
Não existe deploy desse simulador como serviço de produção.

Guardas independentes: exige `NODE_ENV=test`, `DATABASE_URL` local
(`localhost`, `127.0.0.1` ou `[::1]`) e nome de banco com `test`;
além da guarda financeira central de rejeição a RDS/produção. A verificação
ocorre antes de abrir uma conexão. A conta deve estar ativa, em BRL,
ser conta bancária/clearing/carteira Pix e pertencer ao CNPJ indicado.

## Tabelas de teste
- `synthetic_finance_import_batches`: lote, provedor, conta, CNPJ, hash
  SHA-256, contadores, modo explícito `SYNTHETIC_TEST_ONLY`;
- `synthetic_finance_import_entries`: evento sintético imutável com índice
  único composto `(provider, legal_entity_id, account_id, external_id)`;
- `synthetic_finance_import_audit`: um registro por linha/tentativa, com
  fingerprint, resultado e referência ao lote. Não contém CSV bruto, nomes,
  CPF/CNPJ literal, chave Pix ou identificação de beneficiário.

As três tabelas são distintas do livro financeiro, dos pagamentos de saída
e do registro de recargas. Uma ocorrência STAGED quer dizer "evento sintético
armazenado para revisão", **não** conciliação contábil, crédito ou dinheiro pago.

## Integridade e casos de homologação
- validação integral do CSV antes da transação;
- transação única: lote, entradas, auditoria e contadores; falha faz ROLLBACK;
- repetição do mesmo arquivo registra nova tentativa auditada, sem duplicar evento;
- ID reutilizado com conteúdo alterado vira CONFLICTING_PREVIOUS_IMPORT,
  nunca sobrescreve a primeira ocorrência;
- duplicidade dentro do arquivo fica auditada e não é armazenada como entrada;
- unicidade em PostgreSQL resiste a duas importações concorrentes;
- escopo por conta/CNPJ/provedor é obrigatório; comparação com livro somente
  de leitura; período sem movimento grava lote de zero entradas;
- regressões SumUp/Asaas, testes do PR #403, typecheck e E2E seguem obrigatórios.

## Execução no CI
O workflow `Finance E2E Integrated` sobe `kaviar_e2e_test` local/descartável,
executa Prisma db push de teste e roda:
```bash
cd backend
NODE_ENV=test npx vitest run tests/finance-synthetic-staging.integration.test.ts
```
O teste aplica `synthetic-staging.sql` nesse banco e remove suas próprias
fixtures ao final. Não executar o SQL manualmente em produção.

## Próximo marco
Modelagem de staging **para dados verificados reais** e adaptadores dos CSVs
oficiais são decisões separadas, com migração revisada, upload privado, controle
de acesso, prova de origem e homologação do contador. Nenhum artefato sintético
deverá ser promovido ao livro da empresa. A operação real com dinheiro exige
autorização específica e conferência com extrato verdadeiro.
