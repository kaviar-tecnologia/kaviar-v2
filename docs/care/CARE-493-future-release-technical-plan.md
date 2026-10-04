# CARE-493 — Future CARE release technical plan

## Estado

Este documento define o plano técnico mínimo para uma liberação futura e controlada do CARE.

Este PR não libera CARE oficial, não habilita CARE público, não altera runtime, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera variáveis de produção e não faz deploy.

## Premissa principal

O estado atual após CARE-492 é bloqueado por desenho:

- CARE oficial continua bloqueado.
- CARE público continua bloqueado.
- CARE_INTERNAL_PILOT é preparatório e observável, não autorizador.
- Passageiro allowlisted continua bloqueado.
- Mesmo com flags oficiais simuladas como true, a rota continua bloqueada.
- rides-v2 retorna 403 CARE_SERVICE_NOT_AVAILABLE para intenção CARE.
- Corridas comuns continuam preservadas.
- Dispatcher, aceite, pricing e wallet CARE oficial ainda não estão liberados.

Nenhum piloto real pode começar apenas com allowlist ou flags.

## Objetivo futuro

Permitir, em uma etapa futura e separadamente autorizada, um piloto CARE controlado, inicialmente interno, com escopo mínimo, rastreável e reversível.

O piloto futuro deve começar somente quando existir implementação completa e testada para:

1. autorização de passageiro;
2. elegibilidade operacional;
3. revalidação no dispatcher;
4. revalidação no aceite;
5. paridade de preço;
6. seguro;
7. território e município;
8. observabilidade;
9. rollback;
10. autorização separada de deploy.

## Escopo inicial permitido em uma futura liberação

A futura liberação, quando autorizada, deve ser restrita a:

- piloto interno;
- passageiros explicitamente allowlisted;
- CARE_ASSISTED simples;
- FOLDING_WHEELCHAIR somente quando houver motorista e veículo compatíveis;
- território previamente verificado;
- município previamente verificado;
- seguro previamente verificado;
- paridade de preço com a corrida comum equivalente no piloto inicial.

CARE_ADAPTED_WHEELCHAIR deve continuar fora do piloto até existir veículo realmente adaptado, evidência documental, validação operacional e autorização expressa.

## Componentes técnicos obrigatórios antes de qualquer liberação

### 1. Gate de passageiro

- O passageiro deve ser identificado pela sessão autenticada.
- passengerId vindo do body deve continuar proibido como fonte de autorização.
- CARE_INTERNAL_PILOT pode limitar o piloto, mas não pode liberar CARE sozinho.
- O backend deve continuar sendo a fonte de verdade.

### 2. Flags oficiais

A futura liberação precisa avaliar em conjunto:

- CARE_PUBLIC_REQUEST_ENABLED;
- CARE_OFFICIAL_ENABLED;
- CARE_DISPATCH_ENABLED;
- CARE_DRIVER_ACCEPTANCE_ENABLED;
- CARE_AUDIT_STRICT_ENABLED.

Nenhuma flag isolada pode liberar o fluxo.

### 3. Dispatcher CARE

O dispatcher CARE futuro deve revalidar antes de qualquer oferta:

- passageiro autorizado;
- motorista com qualificação CARE verificada;
- veículo com capacidade CARE verificada;
- território permitido;
- município permitido;
- seguro aplicável;
- preço/paridade;
- tipo CARE permitido no piloto.

Se qualquer item falhar, a oferta não pode ser criada.

### 4. Aceite CARE

O aceite CARE futuro deve revalidar antes de assignment, wallet, pricing e notificações:

- corrida ainda elegível;
- motorista ainda elegível;
- veículo ainda elegível;
- território/município ainda permitidos;
- seguro ainda aplicável;
- preço ainda válido;
- tipo CARE ainda permitido.

Se qualquer item falhar, o aceite deve ser bloqueado.

### 5. Pricing e paridade

O piloto inicial não deve cobrar valor maior por idade, deficiência ou mobilidade reduzida.

A precificação inicial deve preservar paridade com a corrida comum equivalente, salvo autorização jurídica/regulatória futura em sentido diferente.

### 6. Wallet e settlement

Wallet, split, settlement, débito pendente, ledger territorial e incentivos só podem ser executados após:

- dispatcher validado;
- aceite validado;
- preço travado;
- corrida oficialmente autorizada;
- testes de regressão financeiros aprovados.

### 7. Seguro, território e município

Antes de qualquer piloto real, deve existir evidência de:

- seguro aplicável ao tipo de operação;
- território permitido;
- município permitido;
- motorista habilitado;
- veículo compatível;
- documentação operacional mínima.

### 8. Observabilidade e auditoria

A liberação futura deve registrar evidências para:

- tentativa bloqueada;
- motivo de bloqueio;
- passageiro allowlisted;
- flags avaliadas;
- elegibilidade de motorista;
- elegibilidade de veículo;
- território;
- município;
- decisão de dispatcher;
- decisão de aceite;
- rollback.

### 9. Rollback

Antes do deploy de qualquer liberação real, deve haver plano de rollback explícito:

- desativar flags oficiais;
- preservar CARE_INTERNAL_PILOT sem liberar fluxo;
- bloquear novas solicitações CARE;
- impedir novas ofertas CARE;
- impedir novos aceites CARE;
- manter corridas comuns funcionando;
- verificar logs e métricas;
- comunicar operação.

### 10. Testes obrigatórios antes de futura liberação

Antes de qualquer PR futuro de liberação operacional, devem existir testes para:

- bloqueio sem allowlist;
- bloqueio com allowlist mas flags incompletas;
- bloqueio com flags mas fluxo oficial incompleto;
- sucesso somente no escopo piloto autorizado;
- regressão de CAR_NORMAL;
- regressão de MOTO_PASSENGER;
- regressão de Premium;
- regressão de pricing;
- regressão de wallet;
- regressão de dispatcher;
- regressão de aceite;
- rollback por flags.

## Autorizações obrigatórias

Uma futura liberação real exige duas autorizações separadas:

1. autorização expressa para implementar e mergear código operacional de liberação;
2. autorização expressa separada para deploy em produção.

A aprovação deste plano não autoriza liberação, merge operacional, ativação de flags, deploy ou uso real do CARE.

## Fora de escopo

Este PR não habilita CARE oficial, não expõe CARE ao passageiro, não altera app, não altera backend operacional, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera variáveis de produção e não faz deploy.
