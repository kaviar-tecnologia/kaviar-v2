# CARE-514 - checklist executavel de dry-run interno

## Decisao

Este documento transforma o inventario CARE-513 em checklist executavel para um dry-run interno do CARE.

O checklist e somente read-only. Ele serve para guiar coleta de evidencias, decisao tecnica e registro de go, no-go ou pendente.

Este contrato nao autoriza CARE publico, CARE oficial, corrida real, dispatcher real, aceite real, cobranca, wallet ou repasse.

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

## Checklist executavel

| Ordem | Checagem | Evidencia | Resultado permitido |
| --- | --- | --- | --- |
| 1 | Confirmar main e commit | HEAD, origin/main, PRs | go, no-go ou pendente |
| 2 | Confirmar checks remotos | GitHub Actions | go, no-go ou pendente |
| 3 | Confirmar ausencia de deploy | runs do commit e workflows deploy | go, no-go ou pendente |
| 4 | Rodar typecheck | saida local | go, no-go ou pendente |
| 5 | Rodar testes CARE | saida local | go, no-go ou pendente |
| 6 | Coletar readiness admin | relatorio read-only | go, no-go ou pendente |
| 7 | Verificar flags fail-closed | flags e policy | go, no-go ou pendente |
| 8 | Verificar bloqueio de criacao | rota rides-v2 | go, no-go ou pendente |
| 9 | Verificar dispatcher bloqueado | evidencia read-only | go, no-go ou pendente |
| 10 | Verificar aceite bloqueado | evidencia read-only | go, no-go ou pendente |
| 11 | Verificar wallet bloqueada | evidencia read-only | go, no-go ou pendente |
| 12 | Verificar territorio e regulacao | registro administrativo | go, no-go ou pendente |
| 13 | Verificar seguro | registro administrativo | go, no-go ou pendente |
| 14 | Verificar motorista e veiculo | leitura de qualificacao | go, no-go ou pendente |
| 15 | Verificar pricing sem discriminacao | simulacao read-only | go, no-go ou pendente |
| 16 | Registrar rollback | plano documentado | go, no-go ou pendente |
| 17 | Registrar decisao final | ata ou comentario de PR | go, no-go ou pendente |

## Regras de execucao

Cada checagem deve registrar:

- data e hora;
- ambiente;
- commit;
- responsavel;
- comando ou fonte consultada;
- evidencia observada;
- resultado: go, no-go ou pendente;
- motivo do resultado;
- confirmacao de ausencia de side effects.

## Proibicoes

Durante o dry-run e proibido:

- criar corrida real;
- alterar passageiro;
- alterar motorista;
- alterar veiculo;
- alterar territorio;
- alterar requisito CARE;
- chamar dispatcher real;
- permitir aceite real;
- gerar cobranca;
- movimentar wallet;
- disparar pagamento;
- fazer deploy sem autorizacao expressa.

## Criterio de saida

O dry-run interno so pode sair como go quando todas as checagens estiverem go.

Qualquer no-go bloqueia a proxima fase.

Qualquer pendente mantem CARE bloqueado.

Mesmo com resultado go, a proxima fase exige PR proprio, checks verdes, validacao pos-merge e autorizacao expressa.

## Fora de escopo

Este PR nao altera backend operacional, app mobile, Prisma schema, migrations, infra, workflows, secrets, producao, dispatcher, aceite, pricing, wallet ou pagamentos.

Este PR nao habilita CARE publico ou oficial.

## Decisao final

CARE-514 cria um checklist executavel para dry-run interno, mas nao executa nem autoriza operacao real.

O CARE permanece fechado ate nova autorizacao expressa.
