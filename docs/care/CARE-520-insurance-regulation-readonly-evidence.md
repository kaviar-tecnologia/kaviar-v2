# CARE-520 - evidencia read-only de seguro APP e regulacao local

## Decisao

Este documento define o contrato read-only para validar seguro APP e regulacao local antes de qualquer piloto CARE no Rio de Janeiro.

A composicao candidata permanece:

- Gestora territorial candidata: Fernanda.
- Motorista candidato: Aparecido.
- Territorio candidato: Rio de Janeiro, territorio operacional do Aparecido.
- Veiculo candidato: pendente de evidencia read-only.
- Seguro APP: existente, mas aplicabilidade ao piloto CARE pendente de evidencia especifica.
- Regulacao local: pendente de evidencia read-only.

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

## Evidencia minima de seguro

Antes de qualquer piloto operacional, a evidencia read-only de seguro deve confirmar:

- existencia do seguro APP contratado;
- documento, apolice ou contrato administrativo aplicavel;
- vigencia;
- cobertura territorial;
- cobertura para passageiro;
- cobertura para motorista;
- exclusoes conhecidas;
- se o uso CARE esta dentro do escopo de transporte por aplicativo;
- se ha necessidade de endosso, aditivo ou seguro especifico no futuro;
- registro da decisao juridica ou administrativa.

## Evidencia minima de regulacao local

Antes de qualquer piloto operacional, a evidencia read-only de regulacao local deve confirmar:

- municipio ou area exata do piloto;
- regra municipal aplicavel ao transporte por aplicativo;
- exigencias de motorista;
- exigencias de veiculo;
- exigencias de cadastro, autorizacao ou comunicacao;
- restricoes para transporte assistido, idoso, PCD ou acompanhante;
- ausencia de proibicao conhecida para a etapa proposta;
- registro de e-mail, protocolo, lei, decreto, regulamento ou checklist administrativo.

## Condicao de bloqueio

Seguro APP existente nao equivale automaticamente a aprovacao do piloto CARE.

Regulacao municipal presumida nao equivale a autorizacao operacional.

Se seguro ou regulacao estiverem ausentes, incertos ou sem evidencia suficiente, o resultado deve permanecer `pendente` ou virar `no-go`.

## Resultado atual

Resultado atual: `pendente`.

Motivo: existe referencia ao seguro APP contratado, mas a aplicabilidade especifica ao piloto CARE e a regulacao local ainda precisam de evidencia read-only suficiente.

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
- assumir cobertura de seguro sem evidencia;
- assumir autorizacao regulatoria sem evidencia.

## Criterio de saida

O #520 so pode evoluir para uma fase seguinte quando houver evidencia read-only verificavel de seguro APP aplicavel e regulacao local suficiente para o escopo do piloto.

A decisao atual permanece `pendente`.

CARE permanece fail-closed ate nova autorizacao expressa.
