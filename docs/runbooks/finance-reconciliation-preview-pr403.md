# Financeiro Premium — PR #403, fase 1: prévia de conciliação (sem baixa)

## Objetivo e limite
Criar uma porta de entrada **somente de leitura** para análise de extratos **normalizados**,
sem assumir campos/semântica dos exports nativos da SumUp ou Asaas. A prévia fica apenas
em memória durante a requisição; não persiste o arquivo, não grava vínculo, não altera
status, não reconhece receita, não credita wallet, não agenda POST e não movimenta dinheiro.
Ela não é uma conciliação contábil concluída.

## Endpoint
\`POST /api/admin/finance/reconciliation/preview\` (auth de administrador + perfil
\`FINANCE\` ou \`SUPER_ADMIN\`). Corpo JSON estrito:
\`{"provider":"SUMUP|ASAAS","account_id":"UUID","legal_entity_id":"UUID","csv":"..."}\`.

A conta deve estar ativa, em BRL, ser tipo BANK/PIX_WALLET/CLEARING e estar vinculada
àquele **mesmo CNPJ**. Falta de vínculo bloqueia a consulta. Consultas de candidatos
limitadas a \`financial_transactions\` com o mesmo account_id, legal_entity_id,
provider, referência exata e status POSTED/RECONCILED/CLOSED. A ausência de candidato
nunca é interpretada como movimento inexistente no banco/provedor: exige análise.

## Contrato CSV NORMALIZADO (UTF-8, vírgula, coluna e ordem exatas)
\`\`\`csv
external_id,occurred_on,direction,amount_cents,currency,external_reference
sumup_001,2026-09-26,IN,2500,BRL,wallet_v2:001
asaas_002,2026-09-26,OUT,1500,BRL,obligation:002
\`\`\`
Usar um arquivo por provedor e conta. \`amount_cents\` é **inteiro positivo**
em centavos, sem sinal, ponto, vírgula decimal ou separador de milhar.
\`direction\` é IN/OUT; \`occurred_on\` é data civil ISO. \`external_id\` deve
ser identificador seguro e único no arquivo. \`external_reference\` pode estar
vazia, caso em que a linha fica pendente de revisão manual.

Até 100 linhas/64 KiB; sem colunas extras, texto livre, CPF, Pix key, dados bancários,
nome de beneficiário, multilinhas ou fórmula. O hash SHA-256 é informativo para
identificar a amostra local; **não** prova autenticidade bancária. Não registrar o
CSV em logs nem copiá-lo para chamados.

## Resultado
\`PREVIEW_ONLY\` e status por linha:
- CANDIDATE_FOR_REVIEW: um lançamento com referência, direção e valor idênticos.
  Isto **não significa** conciliação confirmada, liquidação ou pagamento.
- DUPLICATE_SOURCE_ID / DUPLICATE_REFERENCE: possível duplicidade dentro do arquivo.
- MISSING_REFERENCE / UNMATCHED: não há vínculo conclusivo.
- AMBIGUOUS_LEDGER_REFERENCE: mais de um lançamento na referência.
- AMOUNT_MISMATCH / DIRECTION_MISMATCH: divergência explícita.
- ALREADY_RECONCILED: não conciliar outra vez uma linha já reconhecida.

## Próxima etapa, somente após revisão própria
Definir adaptadores a partir de **amostras reais verificadas** de exportação SumUp/Asaas,
importação persistente com hash/idempotência, origem, competência, instituição,
regras de taxa/estorno/MED, trilha de auditoria, visibilidade por estabelecimento e
conciliação com aprovação e reversão autorizadas. Schema e migration deverão
entrar em PR próprio, com teste real de PostgreSQL e autorização separada para deploy.
Até lá, **nenhum** callback, flag de payout ou transferência é alterado neste PR.
