# CARE-521 - evidencia read-only de pricing sem discriminacao

## Decisao

Este documento define o contrato read-only de pricing para o piloto CARE no Rio de Janeiro.

A regra central e que o CARE nao pode cobrar mais caro por idade, deficiencia, morbidade, condicao de saude, necessidade de acompanhamento ou vulnerabilidade do passageiro.

Qualquer componente adicional de preco so pode existir se for baseado em custo operacional objetivo, documentado, auditavel e nao discriminatorio.

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

## Regra de nao discriminacao

O pricing CARE nao pode usar como multiplicador, taxa, sobretaxa, adicional ou penalidade:

- idade;
- deficiencia;
- morbidade;
- condicao de saude;
- necessidade de cuidado;
- necessidade de acompanhante;
- vulnerabilidade social;
- capacidade reduzida de locomocao.

## Componentes permitidos somente com evidencia

Uma diferenca de preco so pode ser considerada se estiver vinculada a custo operacional objetivo, por exemplo:

- distancia;
- tempo;
- espera;
- pedagio;
- estacionamento;
- categoria operacional do veiculo;
- recurso fisico do veiculo realmente utilizado;
- servico adicional contratado pelo passageiro;
- custo regulatorio ou securitario comprovado;
- incentivo promocional documentado.

Mesmo nestes casos, a evidencia deve demonstrar que o criterio nao discrimina o passageiro por idade, deficiencia ou morbidade.

## Evidencia minima de pricing

Antes de qualquer piloto operacional, a evidencia read-only de pricing deve confirmar:

- formula de preco aplicavel;
- ausencia de fator baseado em idade;
- ausencia de fator baseado em deficiencia;
- ausencia de fator baseado em morbidade;
- ausencia de fator baseado em condicao de saude;
- separacao entre custo operacional e perfil pessoal do passageiro;
- exemplo de simulacao sem cobranca real;
- comparacao com corrida convencional equivalente quando aplicavel;
- decisao juridica, administrativa ou tecnica registrada.

## Condicao de bloqueio

Se o pricing nao puder demonstrar ausencia de discriminacao, o resultado deve permanecer `pendente` ou virar `no-go`.

CARE nao pode ser liberado se a regra de preco permitir cobranca maior por condicao pessoal protegida.

## Resultado atual

Resultado atual: `pendente`.

Motivo: ainda falta evidencia read-only de formula, simulacao e comparacao que demonstre pricing CARE sem discriminacao.

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
- alterar regra real de pricing;
- criar taxa por idade, deficiencia, morbidade ou condicao de saude.

## Criterio de saida

O #521 so pode evoluir para uma fase seguinte quando houver evidencia read-only verificavel de pricing CARE sem discriminacao.

A decisao atual permanece `pendente`.

CARE permanece fail-closed ate nova autorizacao expressa.
