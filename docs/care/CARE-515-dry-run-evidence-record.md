# CARE-515 - registro de evidencias do dry-run interno

## Decisao

Este documento define o modelo de registro das evidencias do dry-run interno do CARE.

Ele transforma o checklist CARE-514 em uma ata tecnica preenchivel.

Este documento nao executa o dry-run, nao autoriza CARE real e nao altera estado operacional.

## Estado atual obrigatorio

CARE continua bloqueado.

- `CARE_SERVICE_NOT_AVAILABLE`
- `CARE_REQUIREMENTS_MISSING`
- `releaseReady=false`
- `publicCareAvailable=false`
- `officialCareAvailable=false`
- `operationAllowed=false`
- `dispatchAllowed=false`
- `acceptanceAllowed=false`
- `walletAllowed=false`

## Cabecalho obrigatorio

Todo registro de dry-run deve conter:

- data e hora;
- ambiente;
- commit da main;
- PRs CARE considerados;
- responsavel administrativo;
- responsavel tecnico;
- comandos ou fontes consultadas;
- confirmacao de ausencia de deploy nao autorizado;
- decisao final: `go`, `no-go` ou `pendente`.

## Registro das evidencias

| Ordem | Item CARE-514 | Evidencia coletada | Resultado | Motivo | Side effects |
| --- | --- | --- | --- | --- | --- |
| 1 | main e commit | pendente | pendente | pendente | nenhum |
| 2 | checks remotos | pendente | pendente | pendente | nenhum |
| 3 | ausencia de deploy | pendente | pendente | pendente | nenhum |
| 4 | typecheck | pendente | pendente | pendente | nenhum |
| 5 | testes CARE | pendente | pendente | pendente | nenhum |
| 6 | readiness admin | pendente | pendente | pendente | nenhum |
| 7 | flags fail-closed | pendente | pendente | pendente | nenhum |
| 8 | bloqueio de criacao | pendente | pendente | pendente | nenhum |
| 9 | dispatcher bloqueado | pendente | pendente | pendente | nenhum |
| 10 | aceite bloqueado | pendente | pendente | pendente | nenhum |
| 11 | wallet bloqueada | pendente | pendente | pendente | nenhum |
| 12 | territorio e regulacao | pendente | pendente | pendente | nenhum |
| 13 | seguro | pendente | pendente | pendente | nenhum |
| 14 | motorista e veiculo | pendente | pendente | pendente | nenhum |
| 15 | pricing sem discriminacao | pendente | pendente | pendente | nenhum |
| 16 | rollback | pendente | pendente | pendente | nenhum |
| 17 | decisao final | pendente | pendente | pendente | nenhum |

## Regras de preenchimento

Resultado permitido:

- `go`: evidencia suficiente e sem bloqueio;
- `no-go`: evidencia mostra risco ou bloqueio;
- `pendente`: evidencia ausente ou inconclusiva.

Qualquer `no-go` bloqueia a proxima fase.

Qualquer `pendente` mantem CARE bloqueado.

Todos os itens devem confirmar ausencia de side effects.

## Proibicoes

O registro nao pode ser usado para:

- liberar CARE publico;
- liberar CARE oficial;
- criar corrida real;
- chamar dispatcher real;
- permitir aceite real;
- gerar cobranca;
- movimentar wallet;
- disparar pagamento;
- fazer deploy sem autorizacao expressa.

## Fora de escopo

Este PR nao altera backend operacional, app mobile, Prisma schema, migrations, infra, workflows, secrets, producao, dispatcher, aceite, pricing, wallet ou pagamentos.

## Decisao final

CARE-515 cria o modelo auditavel de registro do dry-run interno.

O CARE permanece fail-closed ate nova autorizacao expressa.
