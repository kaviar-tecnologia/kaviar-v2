# CARE-500 — Shadow audit harness

## Estado

Este PR adiciona um harness interno/read-only para executar o shadow trace de elegibilidade CARE de forma controlada.

Este PR não libera CARE oficial, não habilita CARE público, não cria corrida CARE real, não envia oferta, não permite aceite, não altera pricing, não altera wallet, não cria migration, não altera produção e não faz deploy.

## O que adiciona

Adiciona:

- `CARE_SHADOW_AUDIT_HARNESS_VERSION`;
- `CARE_SHADOW_AUDIT_HARNESS_REASON`;
- `CareShadowAuditHarnessClient`;
- `CareShadowAuditHarnessInput`;
- `CareShadowAuditHarnessResult`;
- `runCareShadowAuditHarnessTx`.

## Como funciona

O harness:

1. recebe um transaction/client explícito;
2. chama `evaluateAndWriteCareEligibilityShadowAuditTx`;
3. grava o audit trace controlado criado nos PRs #498 e #499;
4. retorna o resultado com `harnessOnly=true`.

Nenhuma rota, app, dispatcher ou fluxo operacional chama esse harness neste PR.

## Garantia operacional

Mesmo quando o harness executa com sucesso:

- `operationAllowed=false`;
- `dispatchAllowed=false`;
- `acceptanceAllowed=false`;
- `walletAllowed=false`;
- `publicCode=CARE_SERVICE_NOT_AVAILABLE`.

## Auditoria

O harness não abre transação por conta própria.

O caller futuro deve decidir o boundary transacional. Se a gravação em `admin_audit_logs` falhar, o erro sobe para o caller.

## Privacidade e payload

O harness reutiliza o payload seguro do #498 e o caller explícito do #499.

Não deve persistir:

- notas clínicas;
- diagnóstico;
- CID;
- documentos pessoais;
- payloads de provedor;
- token;
- senha;
- segredo;
- dados livres médicos do passageiro.

## Fora de escopo

Este PR é:

- sem rota pública;
- sem dispatcher;
- sem aceite;
- sem pricing;
- sem wallet;
- sem migration;
- sem app;
- sem produção;
- sem deploy;
- sem ativação de flag em produção.

## Próximo passo futuro

Um PR futuro pode criar uma entrada administrativa interna e protegida para acionar esse harness.

Esse acoplamento futuro exige autorização separada, controle de permissão administrativa e novos testes provando que continua sem operação real.
