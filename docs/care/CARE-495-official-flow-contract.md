# CARE-495 — Official CARE flow contract

## Estado

Este documento define o contrato técnico oficial do fluxo CARE para implementação futura e controlada.

Este PR não libera CARE oficial, não habilita CARE público, não altera backend/src, não altera runtime, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera variáveis de produção e não faz deploy.

O objetivo é transformar o playbook profissional do CARE em um contrato de fluxo claro antes de qualquer código operacional.

## Princípios obrigatórios

O fluxo CARE deve obedecer a estes princípios:

- fail-closed por padrão;
- nenhuma corrida CARE oficial sem autorização futura;
- nenhum uso de passengerId vindo do body para autorizar CARE;
- nenhuma oferta para motorista antes de validação CARE;
- nenhum aceite sem revalidação CARE;
- nenhum pricing CARE sem política explícita de paridade;
- nenhuma wallet/settlement sem guard financeiro;
- nenhuma ativação pública sem rollback pronto;
- nenhuma mistura de dispatcher, aceite, pricing, wallet, app e deploy no mesmo pacote.

## Código público de bloqueio

Enquanto CARE não estiver oficialmente liberado, o passageiro deve receber apenas:

- CARE_SERVICE_NOT_AVAILABLE.

Motivos internos detalhados devem existir para auditoria, mas não precisam ser expostos ao passageiro.

## Escopo inicial do contrato

O primeiro fluxo CARE permitido para desenho técnico é:

- CARE_ASSISTED simples;
- sem wheelchair adaptada;
- sem van adaptada;
- sem operação ampla;
- sem exposição pública;
- preço igual à corrida comum equivalente;
- piloto interno mínimo somente se autorizado futuramente.

## Contrato do fluxo oficial CARE

### 1. Entrada da solicitação

Entrada esperada:

- passageiro autenticado;
- origem;
- destino;
- intenção CARE;
- tipo CARE solicitado;
- contexto de cidade/território;
- dados mínimos para estimativa.

Regras:

- a autenticação do passageiro deve vir do contexto autenticado;
- passengerId informado no body não pode autorizar CARE;
- se não houver intenção CARE, o fluxo comum deve seguir preservado;
- se houver intenção CARE e o CARE não estiver liberado, bloquear fail-closed.

Saídas possíveis:

- seguir fluxo comum quando não for CARE;
- bloquear CARE com CARE_SERVICE_NOT_AVAILABLE;
- registrar motivo interno de bloqueio;
- seguir para gate CARE somente em cenário futuro autorizado.

### 2. Gate de passageiro

Entrada esperada:

- passengerId autenticado;
- flags oficiais de CARE;
- contexto de allowlist interna, quando aplicável.

Regras:

- allowlist interna é observabilidade/preparação, não autorização isolada;
- flags oficiais não liberam CARE sozinhas;
- passengerId ausente bloqueia;
- erro ao consultar allowlist bloqueia;
- passageiro não permitido bloqueia;
- mesmo passageiro permitido deve ser bloqueado se o fluxo oficial ainda não estiver implementado/autorizado.

Saídas possíveis:

- PASSENGER_ID_MISSING;
- PASSENGER_NOT_ALLOWLISTED;
- ALLOWLIST_UNAVAILABLE;
- PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLAGS_NOT_READY;
- PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLOW_NOT_IMPLEMENTED;
- autorizado apenas em implementação futura específica.

### 3. Validação do tipo CARE

Entrada esperada:

- tipo CARE solicitado;
- requisitos do passageiro;
- política de tipos CARE suportados.

Regras:

- o primeiro tipo elegível deve ser CARE_ASSISTED simples;
- wheelchair adaptada fica fora do primeiro piloto real;
- van adaptada fica fora do primeiro piloto real;
- tipo desconhecido bloqueia;
- tipo ainda não suportado bloqueia;
- tipo suportado deve gerar requisitos explícitos para motorista e veículo.

Saídas possíveis:

- CARE_TYPE_NOT_SUPPORTED;
- CARE_TYPE_NOT_ENABLED;
- CARE_REQUIREMENTS_CREATED;
- bloqueio antes de dispatcher.

### 4. Território, município e seguro

Entrada esperada:

- origem;
- destino;
- território;
- município;
- cobertura operacional;
- confirmação de seguro aplicável.

Regras:

- CARE só pode operar em território permitido;
- CARE só pode operar em município permitido;
- se houver dúvida regulatória, bloquear;
- se houver dúvida de seguro, bloquear;
- território deve ser validado antes de oferta ao motorista;
- cidade/município deve ser validado antes de oferta ao motorista.

Saídas possíveis:

- CARE_TERRITORY_NOT_ALLOWED;
- CARE_CITY_NOT_ALLOWED;
- CARE_INSURANCE_NOT_CONFIRMED;
- CARE_OPERATIONAL_AREA_VALIDATED.

### 5. Pricing e paridade

Entrada esperada:

- rota;
- estimativa comum equivalente;
- tipo CARE;
- política CARE;
- regra de não discriminação.

Regras:

- no piloto mínimo, preço CARE deve ser igual à corrida comum equivalente;
- não pode haver acréscimo por idade, deficiência ou morbidade;
- política CARE deve ser separada e auditável;
- falha de paridade bloqueia;
- pricing CARE não pode afetar CAR_NORMAL, MOTO ou Premium.

Saídas possíveis:

- CARE_PRICE_PARITY_FAILED;
- CARE_PRICE_POLICY_UNAVAILABLE;
- CARE_PRICE_VALIDATED.

### 6. Elegibilidade do motorista

Entrada esperada:

- motorista candidato;
- status de verificação;
- qualificações CARE;
- documentos;
- vínculo territorial;
- disponibilidade operacional.

Regras:

- motorista precisa estar verificado;
- motorista precisa cumprir requisitos CARE do tipo solicitado;
- motorista precisa estar apto no território;
- motorista sem qualificação não pode receber oferta CARE;
- bloqueio deve ocorrer antes de qualquer oferta real.

Saídas possíveis:

- CARE_DRIVER_NOT_VERIFIED;
- CARE_DRIVER_NOT_QUALIFIED;
- CARE_DRIVER_TERRITORY_NOT_ALLOWED;
- CARE_DRIVER_ELIGIBLE.

### 7. Capacidade do veículo

Entrada esperada:

- veículo do motorista;
- capacidades registradas;
- requisitos do tipo CARE.

Regras:

- veículo precisa cumprir requisitos do tipo CARE;
- veículo sem capacidade exigida não pode receber oferta;
- wheelchair/van adaptada ficam fora do primeiro piloto;
- validação de veículo deve ocorrer antes do dispatcher real.

Saídas possíveis:

- CARE_VEHICLE_NOT_CAPABLE;
- CARE_VEHICLE_NOT_VALIDATED;
- CARE_VEHICLE_CAPABLE.

### 8. Dispatcher CARE

Entrada esperada:

- corrida CARE validada;
- motorista elegível;
- veículo capaz;
- território permitido;
- preço validado;
- seguro/município sem dúvida.

Regras:

- dispatcher CARE deve começar em dry-run;
- dry-run registra o que teria sido ofertado sem oferta real;
- dispatcher real só pode ofertar para motorista elegível;
- dispatcher não pode ofertar CARE inválido;
- se não houver motorista elegível, bloquear sem oferta;
- dispatcher CARE não pode afetar corridas comuns.

Saídas possíveis:

- CARE_DISPATCH_DRY_RUN_RECORDED;
- CARE_NO_ELIGIBLE_DRIVER;
- CARE_DISPATCH_BLOCKED;
- CARE_DISPATCH_OFFER_CREATED somente em etapa futura autorizada.

### 9. Aceite CARE

Entrada esperada:

- oferta CARE;
- motorista;
- veículo;
- corrida;
- contexto atualizado de elegibilidade.

Regras:

- aceite CARE deve revalidar passageiro, tipo CARE, território, município, seguro, motorista, veículo, pricing e wallet guard;
- aceite sem revalidação deve ser proibido;
- qualquer divergência bloqueia antes de assignment real;
- aceite CARE não pode afetar aceite comum.

Saídas possíveis:

- CARE_ACCEPTANCE_REVALIDATION_FAILED;
- CARE_ACCEPTANCE_BLOCKED;
- CARE_ACCEPTANCE_VALIDATED somente em etapa futura autorizada.

### 10. Wallet, split e settlement

Entrada esperada:

- corrida CARE validada;
- preço validado;
- status de aceite;
- regras financeiras;
- configuração de repasse;
- estado da carteira.

Regras:

- wallet só pode executar depois de autorização oficial;
- wallet não pode assumir corrida CARE inválida;
- settlement não pode ocorrer para CARE bloqueado;
- falha financeira bloqueia;
- regressão financeira para corrida comum deve parar a liberação.

Saídas possíveis:

- CARE_WALLET_GUARD_FAILED;
- CARE_SETTLEMENT_BLOCKED;
- CARE_WALLET_VALIDATED somente em etapa futura autorizada.

### 11. Auditoria e observabilidade

Entrada esperada:

- cada decisão CARE;
- motivo de bloqueio;
- etapa do fluxo;
- request/correlation id quando existir;
- flags avaliadas;
- resultado de allowlist;
- resultado de elegibilidade.

Regras:

- toda decisão CARE precisa deixar rastro auditável;
- motivo interno deve ser claro;
- logs não devem expor dados sensíveis indevidos;
- shadow mode deve registrar decisões sem operação real;
- auditoria deve permitir explicar bloqueios sem investigação no escuro.

Saídas possíveis:

- CARE_AUDIT_RECORDED;
- CARE_SHADOW_DECISION_RECORDED;
- CARE_AUDIT_STRICT_FAILED.

### 12. Rollback

Entrada esperada:

- flags CARE;
- estado operacional;
- incidentes;
- resultado de testes;
- sinais de erro financeiro ou operacional.

Regras:

- desligar flags deve voltar o CARE para bloqueio;
- rollback não pode quebrar corridas comuns;
- rollback deve preservar auditoria;
- qualquer erro financeiro deve parar avanço;
- qualquer regressão de CAR_NORMAL, MOTO ou Premium deve parar avanço.

Saídas possíveis:

- CARE_ROLLBACK_READY;
- CARE_ROLLBACK_EXECUTED;
- CARE_RELEASE_STOPPED.

## Ordem obrigatória futura

A ordem de implementação futura deve respeitar:

- #496 — matriz de riscos e motivos de bloqueio;
- #497 — shadow mode de elegibilidade, sem operação real;
- #498 — dispatcher CARE dry-run;
- #499 — aceite CARE dry-run;
- #500 — pricing/paridade CARE;
- #501 — wallet/settlement guard CARE;
- #502 — staging/piloto interno simulado;
- #503 — deploy escuro com tudo desligado;
- #504 — piloto interno real mínimo, se autorizado.

## Critérios para não avançar

A implementação não deve avançar se:

- houver alteração em backend/src sem PR específico autorizado;
- houver deploy não autorizado;
- houver alteração de produção;
- houver teste financeiro falhando;
- houver regressão em corrida comum;
- houver dúvida sobre seguro;
- houver dúvida sobre município;
- houver dúvida sobre território;
- houver comportamento inesperado de wallet;
- houver dispatcher ofertando CARE inválido;
- houver aceite sem revalidação.

## Fora de escopo

Este PR não implementa código operacional, não altera backend/src, não altera runtime, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera app, não altera produção, não faz deploy e não libera CARE oficial.
