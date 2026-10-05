# CARE-499 — Shadow audit caller

## Estado

Este PR adiciona um caller interno explícito para avaliar o shadow mode de elegibilidade CARE e gravar o rastro auditável criado no #498.

Este PR não libera CARE oficial, não habilita CARE público, não cria corrida CARE real, não envia oferta, não permite aceite, não altera pricing, não altera wallet, não cria migration, não altera produção e não faz deploy.

## O que adiciona

Adiciona:

- `CareEligibilityShadowAuditCallerClient`;
- `CareEligibilityShadowAuditCallerInput`;
- `CareEligibilityShadowAuditCallerResult`;
- `evaluateAndWriteCareEligibilityShadowAuditTx`.

## Como funciona

O helper:

1. chama `evaluateCareEligibilityShadowMode`;
2. chama `writeCareEligibilityShadowAuditTx`;
3. retorna a decisão e confirma `auditWritten=true`.

A chamada é explícita. Nenhuma rota ou fluxo operacional chama esse helper neste PR.

## Garantia operacional

Mesmo quando a avaliação shadow é executada e o rastro é gravado:

- `operationAllowed=false`;
- `dispatchAllowed=false`;
- `acceptanceAllowed=false`;
- `walletAllowed=false`;
- `publicCode=CARE_SERVICE_NOT_AVAILABLE`.

## Erro de auditoria

O helper não engole erro de persistência.

Se a gravação em `admin_audit_logs` falhar, o erro sobe para o caller. Isso preserva o padrão de auditoria obrigatória quando um fluxo interno decidir usar esse helper dentro de uma transação.

## Privacidade e payload

O helper reutiliza o payload seguro do #498.

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

Um PR futuro pode decidir onde chamar esse helper em um fluxo interno controlado.

Esse acoplamento futuro exige autorização separada e novos testes para provar que a chamada continua sem operação real.
