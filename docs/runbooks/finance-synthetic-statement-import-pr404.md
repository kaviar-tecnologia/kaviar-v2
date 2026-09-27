# Financeiro Premium — PR #404: homologação com extratos 100% sintéticos

## Situação real da KAVIAR
A empresa informou que ainda não começou a receber valores reais pelas contas
SumUp ou Asaas. Portanto, **nenhum** dado artificial pode ser inserido no ambiente
de produção ou apresentado como receita, caixa, saldo, repasse ou pagamento real.

## Entrega
Importação em memória de arquivos CSV sintéticos, explicitamente separados dos exports
dos provedores. Reusa a validação e a prévia somente de leitura do PR #403.
Classifica eventos por lançamento, CNPJ/conta/provedor informado pelo teste,
incluindo repetição de ID entre importações. As "receipts" retornadas são
candidatas simuladas para a próxima importação; não são gravações no banco.

**Não há** rota HTTP nova, schema, migration, escrita no banco, chamada a
SumUp/Asaas, emissão fiscal, crédito de carteira, repasse ou baixa contábil.
A função falha se `NODE_ENV` for diferente de `test`.

## Contrato da SIMULAÇÃO — não é formato nativo dos provedores
Cabeçalho exato, UTF-8, delimitado por vírgulas:
```csv
event_id,occurred_on,event_type,direction,amount_cents,currency,external_reference
su_credit_001,2026-09-26,CREDIT,IN,10000,BRL,sim:su:credit:001
su_fee_001,2026-09-26,FEE,OUT,300,BRL,sim:su:fee:001
```
- `amount_cents`: valor absoluto do **movimento simulado da conta**, em centavos
  inteiros positivos (sem decimal). Taxas são eventos OUT próprios: não somar
  a taxa duas vezes, nem presumir que crédito de wallet seja dinheiro no Asaas.
- `event_type`: CREDIT, PAYOUT, FEE, REFUND ou REVERSAL. CREDIT só IN;
  PAYOUT e FEE só OUT; REFUND e REVERSAL precisam indicar direção explicitamente.
- Uma amostra por conta/provedor/CNPJ. Identificadores simulados e referências
  seguros, sem nomes, CPF/CNPJ, dados bancários ou chaves Pix.
- Até 100 eventos / 64 KiB, sem células multilinhas, fórmulas ou campos extras.
- Arquivo apenas com cabeçalho é **mês sem movimentação**: sem receita inventada.

## Casos cobertos
1. SumUp: crédito, taxa separada, estorno sem lançamento correspondente e
   divergência em centavos.
2. Asaas: saída, taxa separada e reversão sem referência conciliada.
3. Mesmo event_id e payload em lote posterior: DUPLICATE_PREVIOUS_IMPORT.
4. Mesmo event_id com payload alterado: CONFLICTING_PREVIOUS_IMPORT.
5. ID igual em outra conta, provedor ou CNPJ: não há falso conflito.
6. Duplicidade dentro do próprio arquivo e múltiplos lançamentos candidatos
   continuam exigindo revisão, jamais geram baixa.
7. Mês vazio e validação estrita de dados e direção.

## Executar DEMO offline (somente repositório local)
**NO TERMINAL**:
```bash
cd /home/goes/kaviar/backend
NODE_ENV=test npx vitest run tests/finance-synthetic-statement-import.test.ts
NODE_ENV=test npx tsx scripts/finance/synthetic-statement-demo.ts
```
A demo usa apenas arquivos versionados em
`backend/tests/fixtures/finance/synthetic-*.csv`.
Não lê `DATABASE_URL`, não importa o cliente de banco, não faz requisição de rede,
não usa credenciais e não altera registros reais.

## Limites de interpretação
`CANDIDATE_FOR_REVIEW` significa **comparação sintética compatível**, não prova
de pagamento, saldo bancário, autenticação de provedor nem conciliação concluída.
Os recibos/fingerprints em memória não fornecem idempotência persistente entre
processos. Os saldos SumUp e Asaas não podem ser somados por inferência.

## Próxima fase técnica (outro PR, sem produção automática)
Com amostras verificadas dos verdadeiros formatos de exportação, definir adaptadores
por provedor, tabela de staging com origem, hash, constraints e index composto
`(provider, legal_entity_id, account_id, external_id)`, arquivo privado,
auditoria, verificação de CNPJ, reconciliação de taxas/estornos/MED e tratamento
de divergências. Validação em PostgreSQL e operação aprovadora antes de qualquer
baixa. Homologação real, se ocorrer, exige autorização específica e comprovante.
Os flags de saída Asaas seguem desativados.
