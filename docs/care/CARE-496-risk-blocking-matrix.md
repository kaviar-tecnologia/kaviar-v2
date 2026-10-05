# CARE-496 — Risk and blocking reason matrix

## Estado

Este documento define a matriz oficial de riscos e motivos de bloqueio do CARE.

Este PR não libera CARE oficial, não habilita CARE público, não altera backend/src, não altera runtime, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera app, não altera variáveis de produção e não faz deploy.

O objetivo é transformar o contrato técnico oficial do fluxo CARE em uma matriz objetiva de riscos, bloqueios, severidade, ação esperada e teste obrigatório.

## Princípio central

Todo risco CARE deve ter:

- etapa do fluxo;
- risco identificado;
- motivo interno de bloqueio;
- severidade;
- ação esperada;
- critério de parada;
- teste obrigatório.

Sem motivo interno claro, o CARE não deve avançar.

Sem teste obrigatório, o CARE não deve avançar.

Sem rollback claro, o CARE não deve avançar.

## Código público

O código público para passageiro continua único enquanto CARE não estiver oficialmente liberado:

- CARE_SERVICE_NOT_AVAILABLE.

Os motivos internos servem para auditoria, suporte, desenvolvimento e decisão operacional. Eles não precisam ser expostos ao passageiro.

## Escala de severidade

### CRITICAL

Risco que pode causar:

- cobrança indevida;
- repasse indevido;
- oferta para motorista não elegível;
- aceite sem revalidação;
- violação de regra de seguro;
- violação de regra municipal/territorial;
- discriminação de preço;
- quebra de corridas normais;
- alteração de produção sem autorização.

Ação padrão: bloquear e parar avanço.

### HIGH

Risco que pode causar:

- operação CARE inconsistente;
- auditoria insuficiente;
- shadow mode inconfiável;
- dispatcher dry-run enganoso;
- dificuldade de rollback;
- suporte sem explicação clara.

Ação padrão: bloquear ou manter em dry-run até correção.

### MEDIUM

Risco que não permite operação real, mas pode ser tratado antes de piloto:

- nomenclatura inconsistente;
- motivo interno incompleto;
- ausência de métrica secundária;
- documentação incompleta;
- teste documental incompleto.

Ação padrão: corrigir antes de próximo PR operacional.

### LOW

Risco de clareza, documentação ou manutenção:

- texto ambíguo;
- nome pouco claro;
- referência cruzada faltante.

Ação padrão: corrigir sem bloquear a linha principal, desde que não afete segurança.

## Ações padronizadas

As ações padronizadas são:

- BLOCK_REQUEST;
- BLOCK_DISPATCH;
- BLOCK_ACCEPTANCE;
- BLOCK_WALLET;
- RECORD_SHADOW_ONLY;
- STOP_RELEASE;
- REQUIRE_MANUAL_REVIEW;
- KEEP_PUBLIC_UNAVAILABLE;
- PRESERVE_NORMAL_FLOW.

## Matriz de riscos e motivos de bloqueio

### 1. Entrada da solicitação

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Solicitação | Passageiro tenta CARE com CARE ainda desligado | CARE_SERVICE_NOT_AVAILABLE | CRITICAL | KEEP_PUBLIC_UNAVAILABLE | Testar 403 para intenção CARE |
| Solicitação | Fluxo comum ser afetado por bloqueio CARE | CARE_NORMAL_FLOW_REGRESSION | CRITICAL | PRESERVE_NORMAL_FLOW | Testar corrida comum sem consulta CARE |
| Solicitação | Body tentar forjar passengerId | CARE_BODY_PASSENGER_ID_IGNORED | CRITICAL | BLOCK_REQUEST | Testar uso apenas de passengerId autenticado |
| Solicitação | Falha sem motivo interno auditável | CARE_BLOCK_REASON_MISSING | HIGH | STOP_RELEASE | Testar motivo interno registrado |

### 2. Gate de passageiro

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Gate passageiro | PassengerId ausente | PASSENGER_ID_MISSING | CRITICAL | BLOCK_REQUEST | Testar bloqueio sem passageiro autenticado |
| Gate passageiro | Passageiro fora da allowlist interna | PASSENGER_NOT_ALLOWLISTED | HIGH | BLOCK_REQUEST | Testar bloqueio de passageiro não permitido |
| Gate passageiro | Allowlist indisponível | ALLOWLIST_UNAVAILABLE | CRITICAL | BLOCK_REQUEST | Testar fail-closed em erro de allowlist |
| Gate passageiro | Flags oficiais incompletas | PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLAGS_NOT_READY | CRITICAL | BLOCK_REQUEST | Testar bloqueio mesmo allowlisted |
| Gate passageiro | Fluxo oficial ainda não implementado | PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLOW_NOT_IMPLEMENTED | CRITICAL | BLOCK_REQUEST | Testar bloqueio mesmo com flags simuladas |
| Gate passageiro | Allowlist ser confundida com autorização | CARE_ALLOWLIST_MISUSED_AS_RELEASE | CRITICAL | STOP_RELEASE | Testar que allowlist não libera CARE sozinha |

### 3. Tipo CARE

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Tipo CARE | Tipo desconhecido | CARE_TYPE_NOT_SUPPORTED | HIGH | BLOCK_REQUEST | Testar tipo não suportado |
| Tipo CARE | Tipo ainda não habilitado | CARE_TYPE_NOT_ENABLED | HIGH | BLOCK_REQUEST | Testar tipo conhecido mas desabilitado |
| Tipo CARE | Wheelchair adaptada entrar no primeiro piloto | CARE_WHEELCHAIR_OUT_OF_INITIAL_PILOT | CRITICAL | STOP_RELEASE | Testar exclusão de wheelchair no piloto mínimo |
| Tipo CARE | Van adaptada entrar no primeiro piloto | CARE_VAN_OUT_OF_INITIAL_PILOT | CRITICAL | STOP_RELEASE | Testar exclusão de van no piloto mínimo |
| Tipo CARE | Requisitos não gerados | CARE_REQUIREMENTS_MISSING | HIGH | BLOCK_DISPATCH | Testar geração de requisitos antes do dispatcher |

### 4. Território, município e seguro

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Território | CARE fora de território permitido | CARE_TERRITORY_NOT_ALLOWED | CRITICAL | BLOCK_DISPATCH | Testar bloqueio antes de oferta |
| Município | CARE em município não autorizado | CARE_CITY_NOT_ALLOWED | CRITICAL | BLOCK_DISPATCH | Testar bloqueio por município |
| Regulação | Dúvida regulatória municipal | CARE_REGULATORY_REVIEW_REQUIRED | CRITICAL | REQUIRE_MANUAL_REVIEW | Testar parada por dúvida regulatória |
| Seguro | Dúvida de cobertura de seguro | CARE_INSURANCE_NOT_CONFIRMED | CRITICAL | STOP_RELEASE | Testar parada por seguro não confirmado |
| Área operacional | Origem/destino fora de área validada | CARE_OPERATIONAL_AREA_NOT_VALIDATED | CRITICAL | BLOCK_DISPATCH | Testar origem/destino fora de área |

### 5. Pricing e paridade

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Pricing | Política CARE indisponível | CARE_PRICE_POLICY_UNAVAILABLE | CRITICAL | BLOCK_REQUEST | Testar bloqueio sem política |
| Pricing | Preço diferente da corrida comum no piloto mínimo | CARE_PRICE_PARITY_FAILED | CRITICAL | STOP_RELEASE | Testar paridade com corrida comum equivalente |
| Pricing | Acréscimo por idade, deficiência ou morbidade | CARE_DISCRIMINATORY_PRICE_RISK | CRITICAL | STOP_RELEASE | Testar ausência de acréscimo discriminatório |
| Pricing | Pricing CARE afetar CAR_NORMAL | CARE_PRICE_NORMAL_RIDE_REGRESSION | CRITICAL | STOP_RELEASE | Testar regressão de CAR_NORMAL |
| Pricing | Pricing CARE afetar MOTO ou Premium | CARE_PRICE_PRODUCT_REGRESSION | CRITICAL | STOP_RELEASE | Testar regressão de MOTO/Premium |

### 6. Elegibilidade do motorista

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Motorista | Motorista não verificado | CARE_DRIVER_NOT_VERIFIED | CRITICAL | BLOCK_DISPATCH | Testar motorista não verificado |
| Motorista | Motorista sem qualificação CARE | CARE_DRIVER_NOT_QUALIFIED | CRITICAL | BLOCK_DISPATCH | Testar ausência de qualificação |
| Motorista | Motorista fora do território | CARE_DRIVER_TERRITORY_NOT_ALLOWED | CRITICAL | BLOCK_DISPATCH | Testar vínculo territorial |
| Motorista | Dispatcher selecionar motorista inelegível | CARE_DRIVER_SELECTION_INVALID | CRITICAL | STOP_RELEASE | Testar filtro antes da oferta |
| Motorista | Qualificação desatualizada | CARE_DRIVER_QUALIFICATION_STALE | HIGH | BLOCK_DISPATCH | Testar reconsulta antes da oferta |

### 7. Capacidade do veículo

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Veículo | Veículo sem capacidade exigida | CARE_VEHICLE_NOT_CAPABLE | CRITICAL | BLOCK_DISPATCH | Testar veículo incompatível |
| Veículo | Veículo não validado | CARE_VEHICLE_NOT_VALIDATED | CRITICAL | BLOCK_DISPATCH | Testar ausência de validação |
| Veículo | Capacidade incompatível com tipo CARE | CARE_VEHICLE_REQUIREMENT_MISMATCH | CRITICAL | BLOCK_DISPATCH | Testar mismatch tipo/veículo |
| Veículo | Dispatcher ignorar capacidade | CARE_VEHICLE_FILTER_BYPASSED | CRITICAL | STOP_RELEASE | Testar que dispatcher respeita veículo |

### 8. Dispatcher CARE

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Dispatcher | Dispatcher CARE sair sem dry-run | CARE_DISPATCH_NOT_DRY_RUN | CRITICAL | STOP_RELEASE | Testar que primeira etapa é dry-run |
| Dispatcher | Oferta real antes de autorização | CARE_DISPATCH_OFFER_NOT_AUTHORIZED | CRITICAL | STOP_RELEASE | Testar ausência de oferta real |
| Dispatcher | Oferta para motorista inelegível | CARE_DISPATCH_INVALID_OFFER_ATTEMPT | CRITICAL | BLOCK_DISPATCH | Testar filtro de elegibilidade |
| Dispatcher | Nenhum motorista elegível | CARE_NO_ELIGIBLE_DRIVER | HIGH | BLOCK_DISPATCH | Testar bloqueio sem motorista elegível |
| Dispatcher | Dispatcher CARE afetar corridas comuns | CARE_DISPATCH_NORMAL_FLOW_REGRESSION | CRITICAL | STOP_RELEASE | Testar corrida comum preservada |
| Dispatcher | Dry-run registrar decisão enganosa | CARE_DISPATCH_DRY_RUN_INCONSISTENT | HIGH | RECORD_SHADOW_ONLY | Testar consistência do dry-run |

### 9. Aceite CARE

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Aceite | Aceite sem revalidação | CARE_ACCEPTANCE_REVALIDATION_FAILED | CRITICAL | BLOCK_ACCEPTANCE | Testar revalidação completa |
| Aceite | Assignment real sem checar motorista | CARE_ACCEPTANCE_DRIVER_NOT_RECHECKED | CRITICAL | STOP_RELEASE | Testar motorista no aceite |
| Aceite | Assignment real sem checar veículo | CARE_ACCEPTANCE_VEHICLE_NOT_RECHECKED | CRITICAL | STOP_RELEASE | Testar veículo no aceite |
| Aceite | Assignment real sem checar território/município/seguro | CARE_ACCEPTANCE_CONTEXT_NOT_RECHECKED | CRITICAL | STOP_RELEASE | Testar contexto no aceite |
| Aceite | Aceite CARE afetar aceite comum | CARE_ACCEPTANCE_NORMAL_FLOW_REGRESSION | CRITICAL | STOP_RELEASE | Testar aceite comum preservado |

### 10. Wallet, split e settlement

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Wallet | Wallet executar para CARE bloqueado | CARE_WALLET_GUARD_FAILED | CRITICAL | BLOCK_WALLET | Testar wallet não executa para CARE bloqueado |
| Settlement | Settlement ocorrer sem autorização | CARE_SETTLEMENT_BLOCKED | CRITICAL | BLOCK_WALLET | Testar settlement bloqueado |
| Financeiro | Repasse indevido | CARE_PAYOUT_NOT_AUTHORIZED | CRITICAL | STOP_RELEASE | Testar ausência de payout CARE não autorizado |
| Financeiro | Regressão de financeiro comum | CARE_FINANCE_NORMAL_FLOW_REGRESSION | CRITICAL | STOP_RELEASE | Testar financeiro comum |
| Wallet | Estado inesperado da carteira | CARE_WALLET_UNEXPECTED_STATE | CRITICAL | STOP_RELEASE | Testar parada por wallet inconsistente |

### 11. Auditoria e observabilidade

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Auditoria | Decisão CARE sem registro | CARE_AUDIT_MISSING | HIGH | STOP_RELEASE | Testar registro de decisão |
| Auditoria | Motivo interno ausente | CARE_AUDIT_REASON_MISSING | HIGH | STOP_RELEASE | Testar motivo obrigatório |
| Auditoria | Shadow mode sem rastro | CARE_SHADOW_DECISION_NOT_RECORDED | HIGH | RECORD_SHADOW_ONLY | Testar shadow registrado |
| Auditoria | Log expondo dado sensível indevido | CARE_AUDIT_SENSITIVE_DATA_RISK | CRITICAL | STOP_RELEASE | Testar logs sem dados indevidos |
| Auditoria | Audit strict falhar | CARE_AUDIT_STRICT_FAILED | CRITICAL | STOP_RELEASE | Testar falha de auditoria strict |

### 12. Rollback

| Etapa | Risco | Motivo interno | Severidade | Ação esperada | Teste obrigatório |
| --- | --- | --- | --- | --- | --- |
| Rollback | Desligar flags não bloquear CARE | CARE_ROLLBACK_FLAGS_FAILED | CRITICAL | STOP_RELEASE | Testar flags desligadas bloqueando |
| Rollback | Rollback quebrar corridas comuns | CARE_ROLLBACK_NORMAL_FLOW_REGRESSION | CRITICAL | STOP_RELEASE | Testar corrida comum após rollback |
| Rollback | Rollback apagar auditoria | CARE_ROLLBACK_AUDIT_LOSS | HIGH | STOP_RELEASE | Testar auditoria preservada |
| Rollback | Não existir plano de reversão | CARE_ROLLBACK_NOT_READY | CRITICAL | STOP_RELEASE | Testar checklist de rollback |
| Release | Qualquer erro financeiro durante liberação | CARE_RELEASE_STOPPED | CRITICAL | STOP_RELEASE | Testar parada por erro financeiro |

## Regras globais de parada

A implementação CARE deve parar se ocorrer qualquer um destes eventos:

- qualquer alteração em backend/src sem PR específico autorizado;
- qualquer deploy não autorizado;
- qualquer alteração de produção;
- qualquer teste financeiro falhando;
- qualquer regressão em CAR_NORMAL;
- qualquer regressão em MOTO;
- qualquer regressão em Premium;
- qualquer dúvida sobre seguro;
- qualquer dúvida sobre município;
- qualquer dúvida sobre território;
- qualquer comportamento inesperado de wallet;
- qualquer oferta CARE inválida no dispatcher;
- qualquer aceite sem revalidação;
- qualquer tentativa de settlement para CARE bloqueado;
- qualquer tentativa de tratar allowlist como liberação oficial.

## Relação com a sequência futura

Esta matriz é pré-requisito para:

- #497 — shadow mode de elegibilidade, sem operação real;
- #498 — dispatcher CARE dry-run;
- #499 — aceite CARE dry-run;
- #500 — pricing/paridade CARE;
- #501 — wallet/settlement guard CARE;
- #502 — staging/piloto interno simulado;
- #503 — deploy escuro com tudo desligado;
- #504 — piloto interno real mínimo, se autorizado.

## Critério de aceite do #496

O #496 só está completo se:

- todos os riscos críticos têm motivo interno;
- todos os motivos internos têm ação esperada;
- toda ação crítica tem teste obrigatório;
- os riscos de pricing, wallet, dispatcher e aceite estão explicitamente cobertos;
- os riscos de seguro, município e território estão explicitamente cobertos;
- corridas comuns continuam protegidas como critério de parada;
- a matriz não autoriza CARE oficial;
- a matriz não altera runtime.

## Fora de escopo

Este PR não implementa código operacional, não altera backend/src, não altera runtime, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera app, não altera produção, não faz deploy e não libera CARE oficial.
