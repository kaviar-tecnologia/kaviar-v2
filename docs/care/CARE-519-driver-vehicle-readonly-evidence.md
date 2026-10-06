# CARE-519 - evidencia read-only de motorista e veiculo candidato

## Decisao

Este documento define o contrato read-only para validar o motorista e o veiculo candidatos ao piloto CARE no Rio de Janeiro.

A composicao candidata permanece:

- Gestora territorial candidata: Fernanda.
- Motorista candidato: Aparecido.
- Territorio candidato: Rio de Janeiro, territorio operacional do Aparecido.
- Veiculo candidato: pendente de evidencia read-only.

Este documento nao autoriza CARE real, nao habilita CARE publico/oficial e nao altera producao.

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

## Evidencia minima do motorista

Antes de qualquer piloto operacional, a evidencia read-only do motorista deve confirmar:

- identificador do motorista no sistema;
- nome administrativo conferido;
- status ativo;
- documentos obrigatorios aprovados ou explicitamente pendentes;
- vinculo territorial com o territorio candidato;
- ausencia de bloqueio operacional;
- capacidade de receber somente simulacao CARE nesta etapa;
- ciencia de que o dry-run nao gera corrida, aceite, pagamento ou repasse.

## Evidencia minima do veiculo

Antes de qualquer piloto operacional, a evidencia read-only do veiculo deve confirmar:

- identificador do veiculo no sistema;
- vinculo do veiculo com o motorista candidato;
- status ativo ou pendente documentado;
- placa/modelo/categoria quando aplicavel;
- capacidade minima para o escopo CARE pretendido;
- restricoes conhecidas;
- que nenhuma capacidade especial sera presumida sem evidencia.

## Condicao de bloqueio

Se motorista ou veiculo nao tiverem evidencia suficiente, o resultado deve permanecer `pendente` ou virar `no-go`.

O piloto nao pode ser considerado `go` apenas porque existe uma pessoa disponivel.

O sistema deve exigir evidencia verificavel antes de qualquer fase operacional.

## Resultado atual

Resultado atual: `pendente`.

Motivo: Aparecido foi identificado como motorista candidato, mas ainda faltam evidencias read-only do cadastro real, status, documentos, vinculo territorial e veiculo candidato.

## Proibicoes

Este PR nao pode:

- ativar CARE publico;
- ativar CARE oficial;
- criar corrida CARE real;
- acionar dispatcher real;
- ofertar corrida a motorista;
- permitir aceite real;
- cobrar tarifa CARE;
- movimentar wallet;
- fazer repasse;
- alterar producao;
- fazer deploy;
- alterar cadastro de motorista;
- alterar cadastro de veiculo.

## Criterio de saida

O #519 so pode evoluir para uma fase seguinte quando houver evidencia read-only verificavel do motorista e do veiculo candidatos.

A decisao atual permanece `pendente`.

CARE permanece fail-closed ate nova autorizacao expressa.
