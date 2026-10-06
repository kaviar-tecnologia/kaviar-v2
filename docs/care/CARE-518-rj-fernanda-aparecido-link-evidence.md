# CARE-518 - evidencia read-only do vinculo RJ / Fernanda / Aparecido

## Decisao

Este documento define o contrato de verificacao read-only do vinculo necessario para o candidato piloto CARE no Rio de Janeiro.

A composicao candidata permanece:

- Territorio candidato: Rio de Janeiro, territorio operacional do Aparecido.
- Gestora territorial candidata: Fernanda.
- Motorista candidato: Aparecido.

O objetivo deste contrato e impedir que o piloto avance se o territorio, a gestora e o motorista nao estiverem ligados ao mesmo escopo operacional.

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

## Vinculo minimo exigido

Antes de qualquer piloto operacional, a evidencia read-only deve confirmar:

- o territorio exato do Aparecido;
- que Fernanda e a gestora territorial desse mesmo territorio;
- que Aparecido e motorista cadastrado nesse mesmo territorio;
- que o cadastro do motorista esta ativo;
- que os documentos do motorista estao aptos;
- que existe veiculo cadastrado para o motorista;
- que o veiculo e compativel com o escopo CARE pretendido;
- que o seguro APP pode ser aplicado ao piloto;
- que a regulacao local permite a etapa proposta;
- que o passageiro de teste esta autorizado administrativamente.

## Condicao de bloqueio

Se qualquer um destes vinculos estiver ausente, divergente ou nao comprovado, o resultado deve ser `no-go` ou `pendente`.

O piloto nao pode ser considerado `go` por presuncao, memoria, conversa ou intencao operacional.

A evidencia precisa ser registrada por leitura de sistema, banco, admin, documento, contrato, apolice, e-mail ou checklist aprovado.

## Resultado atual

Resultado atual: `pendente`.

Motivo: o candidato ao piloto foi identificado, mas o vinculo real entre territorio, gestora, motorista, veiculo, seguro e regulacao ainda nao foi comprovado por evidencia read-only suficiente.

## Proibicoes

Este PR nao pode:

- ativar CARE publico;
- ativar CARE oficial;
- liberar passageiro real;
- criar corrida CARE real;
- acionar dispatcher real;
- ofertar corrida a motorista;
- permitir aceite real;
- cobrar tarifa CARE;
- movimentar wallet;
- fazer repasse;
- alterar producao;
- fazer deploy.

## Criterio de saida

O #518 so pode evoluir para uma fase seguinte quando houver evidencia read-only verificavel de que Fernanda, Aparecido e o territorio RJ pertencem ao mesmo escopo operacional do piloto.

A decisao atual permanece `pendente`.

CARE permanece fail-closed ate nova autorizacao expressa.
