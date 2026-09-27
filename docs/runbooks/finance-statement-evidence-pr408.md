# PR #408 — comprovantes: registro sintético, pendências reais (sem atestar)

A KAVIAR ainda não possui movimentação financeira real homologada nas contas
SumUp e Asaas. **NÃO inserir vendas, saldos ou pagamentos fictícios.**

## O que este PR entrega
- Modelo isolado `finance_statement_evidence` para manifestos de TESTE,
  identificados `SYNTHETIC_FIXTURE / SYNTHETIC_RECORDED_UNVERIFIED`.
- CSV sintético com bytes exatos recebidos em memória, hash SHA-256 calculado
  NO SERVIDOR, quantidade de bytes, CNPJ, conta, provedor, competência,
  data e administrador que registrou. Conteúdo bruto descartado após análise:
  o hash NÃO é arquivo arquivado, portanto NÃO comprova origem oficial.
- `POST /api/admin/finance/monthly-close/evidence/synthetic`, somente em
  `NODE_ENV=test` + banco seguro. Corpo:
  `{legal_entity_id,account_id,provider,year,month,content_base64}`.
  O tipo é o CSV exclusivamente SINTÉTICO do PR #404; NÃO é um extrato
  nativo, não será habilitado em produção e nunca aceita documento real.
- Verifica conta ativa BRL do mesmo CNPJ, competência de cada evento,
  limites de tamanho, UTF-8, versão de conteúdo, conflitos/duplicados,
  prévia de reconciliação e auditoria atômica na transação.
- `GET /evidence` consulta manifestos sintéticos por CNPJ/competência.
  `GET /evidence/requirements` retorna pendências separadas de SUMUP,
  ASAAS e atestação contábil. A resposta SEMPRE indica
  `providerStatementsVerified=false`, `zeroRevenueVerified=false`,
  `readyForFinalClosing=false` e `finalClosing=false`.

## O que NÃO entrega
Arquivo oficial íntegro armazenado e reconsultável, adaptadores de extratos
nativos, autenticação de origem/assinatura, validação contábil, declaração de
faturamento zero, fechamento financeiro, alteração no ledger, pagamentos ou
consulta a APIs reais. O #406 e #407 seguem independentes; registros de teste
nunca removem o bloqueio de documentação externa.

Antes do registro documental REAL, projetar armazenamento privado durável
(com prova da origem, criptografia, retenção, política LGPD, hashes verificáveis
contra bytes arquivados), validação do extrato nativo de cada provedor,
autorização para operadores e homologação com dados oficiais. Não aprovar
fechamento definitivo usando esta tabela de teste.

## Banco/CI
Migration incluída **somente para revisão**, ainda não executada na produção.
CI usa PostgreSQL descartável; nenhuma alteração no RDS de produção.
