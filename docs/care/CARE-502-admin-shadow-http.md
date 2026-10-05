# CARE-502 — Admin shadow HTTP tests

## Estado

Este PR adiciona testes HTTP para a entrada administrativa interna criada no #501.

Este PR não libera CARE oficial, não habilita CARE público, não cria corrida CARE real, não envia oferta, não permite aceite, não altera pricing, não altera wallet, não cria migration, não altera produção e não faz deploy.

## Endpoint testado

- `POST /api/admin/care-shadow/harness`

## Cobertura HTTP

Os testes validam:

- `401` sem contexto administrativo autenticado;
- `403` para papéis que não são `SUPER_ADMIN`;
- `400` quando `rideId` ou `driverId` estão ausentes/inválidos;
- `200 shadow-only` para `SUPER_ADMIN` com entrada válida.

## Garantia operacional

Mesmo no cenário `200 shadow-only`, a resposta deve manter:

- `operationAllowed=false`;
- `dispatchAllowed=false`;
- `acceptanceAllowed=false`;
- `walletAllowed=false`;
- `publicCode=CARE_SERVICE_NOT_AVAILABLE`.

## Barreiras de escopo

Os testes também provam que `runCareShadowAuditHarnessTx` não foi ligado em:

- `rides-v2`;
- dispatcher;
- aceite;
- pricing;
- wallet.

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

## Próximo passo futuro

Um PR futuro pode adicionar uma interface administrativa para acionar o endpoint.

Esse acoplamento futuro exige autorização separada e novos testes de permissão, UX e auditoria.
