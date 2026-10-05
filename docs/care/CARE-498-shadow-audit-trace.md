# CARE-498 — Shadow audit trace

## Estado

Este PR adiciona persistência controlada para o rastro do shadow mode de elegibilidade CARE.

Este PR não libera CARE oficial, não habilita CARE público, não cria corrida CARE real, não envia oferta, não permite aceite, não altera pricing, não altera wallet, não cria migration, não altera produção e não faz deploy.

## Base técnica

O #497 criou `evaluateCareEligibilityShadowMode` e retornou um `auditEvent` estruturado, mas sem persistência.

O #498 adiciona:

- `buildCareEligibilityShadowAuditPayload`;
- `writeCareEligibilityShadowAuditTx`;
- constantes de auditoria:
  - `CARE_ELIGIBILITY_SHADOW_AUDIT_ACTION`;
  - `CARE_ELIGIBILITY_SHADOW_AUDIT_ENTITY_TYPE`.

## Tabela usada

Usa a tabela legada/oficial:

- `admin_audit_logs`

Sem migration nova.

A tabela já existe como objeto pós-Prisma/bootstrap e é usada por outras rotas e serviços de auditoria.

## Como grava

A gravação acontece apenas quando `writeCareEligibilityShadowAuditTx` é chamada explicitamente por um caller autorizado.

A função recebe o transaction/client boundary por parâmetro e executa:

- `INSERT INTO admin_audit_logs`.

A função não abre transação própria, não chama dispatcher, não chama acceptance, não chama pricing, não chama wallet e não engole erro de persistência.

## Payload permitido

O payload registra apenas:

- versão;
- kind;
- rideId;
- driverId;
- evaluatedAt;
- shadowEnabled;
- status;
- eligibilityEligible;
- operationAllowed;
- dispatchAllowed;
- acceptanceAllowed;
- walletAllowed;
- publicCode;
- reasons.

Não deve registrar:

- notas clínicas;
- diagnóstico;
- CID;
- documentos pessoais;
- payloads de provedor;
- token;
- senha;
- segredo;
- dados livres médicos do passageiro.

## Garantia operacional

Mesmo com rastro persistido:

- `operationAllowed=false`;
- `dispatchAllowed=false`;
- `acceptanceAllowed=false`;
- `walletAllowed=false`;
- `publicCode=CARE_SERVICE_NOT_AVAILABLE`.

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

Um PR futuro pode decidir onde chamar o writer em um fluxo interno controlado.

Esse acoplamento futuro deve exigir autorização separada e novos testes para provar que a chamada continua sem operação real.
