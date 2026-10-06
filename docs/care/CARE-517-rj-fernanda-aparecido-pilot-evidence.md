# CARE-517 - evidencia read-only do candidato piloto RJ

## Decisao

Este documento corrige e registra a composicao real do primeiro candidato a piloto CARE.

O piloto candidato fica definido somente como evidencia read-only:

- Territorio candidato: Rio de Janeiro, territorio operacional do Aparecido.
- Gestora territorial candidata: Fernanda.
- Motorista candidato: Aparecido.
- Paula nao entra como gestora deste piloto.
- Tambau fica descartado neste momento por ausencia de motorista disponivel.

Este documento nao autoriza CARE real, nao habilita CARE publico/oficial, nao cria corrida, nao chama dispatcher, nao permite aceite, nao cobra, nao movimenta wallet e nao faz repasse.

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

## Correcao operacional registrada

A composicao anteriormente considerada para Tambau nao serve para piloto CARE porque nao ha motorista disponivel no territorio.

A composicao com Paula como motorista tambem nao serve, porque Paula nao e motorista neste contexto.

A composicao correta para investigacao read-only e:

| Papel | Pessoa | Estado |
| --- | --- | --- |
| Gestora territorial | Fernanda | pendente de validacao read-only |
| Motorista candidato | Aparecido | pendente de validacao read-only |
| Territorio candidato | Rio de Janeiro | pendente de delimitacao exata |
| CARE real | nenhum | bloqueado |

## Evidencias ainda pendentes

Antes de qualquer piloto operacional, ainda precisa haver validacao read-only de:

- territorio exato do Aparecido;
- vinculo territorial da Fernanda;
- cadastro do Aparecido como motorista;
- status ativo do motorista;
- documentos do motorista;
- veiculo cadastrado;
- capacidade do veiculo para CARE;
- seguro APP aplicavel;
- regulacao municipal/local;
- passageiro de teste autorizado;
- pricing sem discriminacao por idade, deficiencia ou morbidade;
- dispatcher somente simulado;
- aceite somente simulado;
- wallet guard sem movimentacao;
- rollback operacional documentado.

## Resultado da avaliacao

Resultado atual: `pendente`.

Motivo: existe candidato humano real para o piloto no Rio de Janeiro, mas ainda faltam evidencias read-only suficientes para aprovar qualquer operacao.

## Proibicoes

Este PR nao pode:

- ativar CARE publico;
- ativar CARE oficial;
- liberar passageiro real;
- criar corrida CARE real;
- chamar dispatcher real;
- ofertar corrida a motorista;
- permitir aceite real;
- cobrar tarifa CARE;
- movimentar wallet;
- fazer repasse;
- alterar producao;
- fazer deploy.

## Criterio de saida

O #517 so pode evoluir para uma fase seguinte quando a composicao RJ / Fernanda / Aparecido estiver validada por evidencia read-only e registrada como `go`, `no-go` ou `pendente`.

A decisao atual permanece `pendente`.

CARE permanece fail-closed ate nova autorizacao expressa.
