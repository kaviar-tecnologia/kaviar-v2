# CARE-501 — Admin shadow entry

## Estado

Este PR adiciona uma entrada administrativa interna protegida para acionar o harness shadow-only criado no #500.

Este PR não libera CARE oficial, não habilita CARE público, não cria corrida CARE real, não envia oferta, não permite aceite, não altera pricing, não altera wallet, não cria migration, não altera produção e não faz deploy.

## Endpoint

Adiciona:

- `POST /api/admin/care-shadow/harness`

A rota exige:

- `authenticateAdmin`;
- `requireSuperAdmin`;
- contexto administrativo ativo;
- `rideId`;
- `driverId`.

## Como funciona

A rota:

1. valida contexto SUPER_ADMIN;
2. valida `rideId` e `driverId`;
3. abre uma transação explícita;
4. chama `runCareShadowAuditHarnessTx`;
5. grava audit trace em `admin_audit_logs`;
6. retorna somente o resultado shadow-only.

## Garantia operacional

Mesmo quando a chamada funciona:

- `operationAllowed=false`;
- `dispatchAllowed=false`;
- `acceptanceAllowed=false`;
- `walletAllowed=false`;
- `publicCode=CARE_SERVICE_NOT_AVAILABLE`.

## Fora de escopo

Este PR é:

- sem rota pública;
- sem app passageiro;
- sem app motorista;
- sem dispatcher;
- sem aceite;
- sem pricing;
- sem wallet;
- sem migration;
- sem produção;
- sem deploy;
- sem ativação de flag em produção.

## Privacidade e payload

A rota não deve persistir:

- notas clínicas;
- diagnóstico;
- CID;
- documentos pessoais;
- payloads de provedor;
- token;
- senha;
- segredo;
- dados livres médicos do passageiro.

## Próximo passo futuro

Um PR futuro pode adicionar interface administrativa ou botão interno para acionar este endpoint.

Esse acoplamento futuro exige autorização separada, revisão de UX/admin permission e novos testes provando que continua sem operação real.
