# CARE-491 — Internal pilot readiness evidence

## Estado

Este documento consolida a evidência técnica acumulada entre CARE-486 e CARE-490.

Este PR não ativa CARE oficial, não habilita CARE público, não muda runtime, não muda flags, não cria migration, não altera produção e não faz deploy.

## Evidência consolidada

### CARE-486 — desenho do gate interno

- Definiu o uso da chave CARE_INTERNAL_PILOT.
- Definiu allowlist por passenger_id.
- Reforçou que o passenger_id deve vir da sessão autenticada, nunca do corpo da requisição.
- Reforçou que a allowlist não pode liberar CARE sozinha.
- Manteve CARE oficial fora de escopo.

### CARE-487 — gate read-only

- Criou leitura fail-closed da allowlist CARE_INTERNAL_PILOT.
- Usa feature_flag_allowlist existente.
- Não cria campo novo em passengers.
- Não altera dispatcher, aceite, pricing, wallet, app ou produção.
- Falha de leitura da allowlist mantém o passageiro bloqueado.

### CARE-488 — preflight composto

- Compoe detecção de intenção CARE, allowlist interna, flags oficiais e bloqueio operacional.
- Mantém canProceed: false.
- Mesmo passageiro allowlisted continua bloqueado enquanto o fluxo oficial não estiver implementado.
- Mantém CARE_SERVICE_NOT_AVAILABLE como código público de bloqueio.
- Não conecta dispatcher, aceite, pricing, wallet ou produção.

### CARE-489 — conexão bloqueada em rides-v2

- Conecta o preflight bloqueado à borda passenger rides-v2.
- Aplica bloqueio em estimate antes de distância, pricing ou quote.
- Aplica bloqueio em create antes de idempotência, persistência, quote, criação ou dispatch.
- Mantém resposta pública 403 CARE_SERVICE_NOT_AVAILABLE.
- Não altera dispatcher, aceite, pricing ou wallet.

### CARE-490 — teste comportamental HTTP

- Prova via supertest que estimate CARE retorna 403 antes de distância, pricing, quote, criação ou dispatch.
- Prova que passengerId injetado no body não substitui o passengerId autenticado da sessão.
- Prova que passageiro allowlisted ainda não libera create CARE.
- Prova que estimate normal segue sem consultar CARE_INTERNAL_PILOT.

## Estado operacional atual

- CARE oficial continua bloqueado.
- CARE público continua bloqueado.
- Passageiro comum preserva fluxo normal.
- Passageiro com intenção CARE recebe 403 CARE_SERVICE_NOT_AVAILABLE.
- Passageiro allowlisted em CARE_INTERNAL_PILOT continua bloqueado.
- Allowlist interna é observável/preparatória, não autorizadora.
- Dispatcher CARE oficial continua não implementado.
- Aceite CARE oficial continua não implementado.
- Pricing CARE oficial continua não implementado.
- Wallet/settlement CARE oficial continua não implementado.
- Produção não foi publicada por estes PRs.

## Travas que continuam obrigatórias

Antes de qualquer piloto real, ainda são obrigatórios:

1. Autorização expressa para implementar liberação operacional.
2. Autorização expressa separada para deploy.
3. CARE_PUBLIC_REQUEST_ENABLED, CARE_OFFICIAL_ENABLED, CARE_DISPATCH_ENABLED e CARE_DRIVER_ACCEPTANCE_ENABLED avaliadas em conjunto.
4. Dispatcher com revalidação de passageiro, motorista, veículo, território, município, seguro e preço.
5. Aceite com revalidação antes de assignment, wallet, pricing e notificações.
6. Garantia de paridade de preço com corrida comum equivalente no piloto inicial.
7. Proibição de preço maior por idade, deficiência ou mobilidade reduzida.
8. CARE_ADAPTED_WHEELCHAIR fora do piloto até existir veículo realmente adaptado e evidência documental.
9. Testes de regressão para CAR_NORMAL, MOTO_PASSENGER, Premium, wallet, pricing, ajuste, dispatcher e aceite.
10. Confirmação explícita de que produção será publicada somente após decisão separada.

## Fora de escopo

Este PR não habilita CARE oficial, não expõe CARE ao passageiro, não altera app, não altera backend operacional, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera variáveis de produção e não faz deploy.
