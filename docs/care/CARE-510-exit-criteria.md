# CARE-510 — critérios objetivos de saída do modo bloqueado

## Decisão

Este PR define os critérios mínimos para qualquer futura saída do modo CARE bloqueado.

Nenhum fluxo CARE real pode ser habilitado apenas porque existem flags, código parcial, testes isolados ou desejo operacional. A saída do fail-closed exige evidência completa, teste, revisão e autorização explícita.

## Estado atual obrigatório

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

## Critério 1 — escopo de liberação

Antes de qualquer saída do modo bloqueado, deve existir PR específico informando:

- qual fluxo será liberado;
- quem poderá usar;
- em qual território;
- por quanto tempo;
- quais flags serão alteradas;
- quais rotas serão afetadas;
- como reverter.

## Critério 2 — elegibilidade administrativa

Antes de operação real, deve haver evidência de:

- território autorizado;
- gestor elegível;
- contrato territorial aplicável;
- documentação administrativa;
- trilha de auditoria da decisão.

## Critério 3 — elegibilidade motorista e veículo

Antes de despacho real, deve haver evidência de:

- motorista verificado;
- qualificação CARE válida;
- capacidade do veículo compatível;
- requisitos de acessibilidade compatíveis;
- bloqueio para motorista não qualificado;
- ausência de pré-atribuição indevida.

## Critério 4 — pricing e não discriminação

Antes de cobrança real, deve haver evidência de:

- tarifa sem discriminação por idade, deficiência ou mobilidade;
- acréscimos apenas por serviço real, tempo, distância ou categoria permitida;
- paridade financeira documentada;
- teste de regressão contra CAR, MOTO e Premium;
- ausência de cobrança CARE indevida.

## Critério 5 — dispatcher e aceite

Antes de qualquer oferta real, deve haver evidência de:

- dispatcher filtrando apenas motoristas elegíveis;
- aceite validando motorista, veículo, território e requisitos;
- bloqueio de aceite incompatível;
- auditoria do aceite;
- ausência de oferta pública fora do piloto autorizado.

## Critério 6 — wallet, repasse e pagamentos

Antes de qualquer efeito financeiro real, deve haver evidência de:

- wallet autorizado;
- settlement autorizado;
- repasse autorizado;
- reconciliação testada;
- nenhum pagamento real sem autorização expressa;
- plano de rollback financeiro.

## Critério 7 — observabilidade e rollback

Antes de produção, deve haver evidência de:

- logs operacionais;
- métrica de erro;
- readiness administrativo;
- trilha de auditoria;
- rollback documentado;
- plano para desabilitar flags rapidamente.

## Critério 8 — autorização final

A saída do modo bloqueado exige:

- testes verdes;
- checklist operacional;
- revisão jurídica e financeira;
- confirmação de que produção pode receber a mudança;
- autorização expressa do proprietário;
- PR aprovado e mergeado de forma controlada.

## Proibição

É proibido habilitar CARE real por:

- alteração direta de variável;
- hotfix sem PR;
- deploy sem checklist;
- mudança de código sem teste;
- interpretação implícita de autorização anterior;
- reaproveitamento de autorização dada para docs ou testes.

## Fora de escopo

Este PR não altera código operacional, não altera schema Prisma, não cria migration, não faz deploy, não altera produção, não habilita CARE público, não habilita CARE oficial e não mexe em pagamentos.

## Segurança

Este PR é documentação + teste de contrato. Ele transforma a saída do modo bloqueado em uma decisão objetiva, auditável e impossível de confundir com avanço operacional.
