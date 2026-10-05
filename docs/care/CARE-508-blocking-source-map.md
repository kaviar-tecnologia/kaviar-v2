# CARE-508 — mapa oficial dos bloqueios CARE

## Decisão

Este PR registra onde vivem os bloqueios CARE atuais antes de qualquer liberação operacional.

O objetivo é impedir avanço no escuro. Antes de liberar CARE público, oficial, dispatcher, aceite, pricing ou wallet, precisamos saber exatamente quais arquivos sustentam o estado fail-closed.

## Estado obrigatório

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

## Mapa público

Arquivo:

- `backend/src/routes/rides-v2.ts`

Responsabilidades atuais:

- importar `CARE_UNAVAILABLE_CODE`;
- importar `isUnsupportedCareIntent`;
- importar `createRideWithRequirements`;
- executar `rejectBlockedCareIntent`;
- usar `passengerId` autenticado;
- bloquear CARE antes de criação;
- bloquear CARE antes de pricing;
- bloquear CARE antes de dispatcher.

## Mapa readiness

Arquivo:

- `backend/src/services/care/care-readiness-policy.ts`

Responsabilidades atuais:

- definir `CARE_SERVICE_NOT_AVAILABLE`;
- identificar intenção CARE não suportada;
- manter a política pública fail-closed.

## Mapa criação interna

Arquivo:

- `backend/src/services/care/care-ride-create.ts`

Responsabilidades atuais:

- rejeitar intenção CARE sem requisitos com `CARE_REQUIREMENTS_MISSING`;
- criar corrida e requisitos em transação quando houver `careDraft`;
- manter requisitos como `DRAFT`;
- impedir preço, settlement, wallet, diagnóstico, revisão e pré-atribuição de motorista pelo cliente.

## Mapa shadow/readiness admin

Arquivo:

- `backend/src/routes/admin-care-shadow.ts`

Responsabilidades atuais:

- expor readiness de forma administrativa e read-only;
- manter `operationAllowed=false`;
- manter `dispatchAllowed=false`;
- manter `acceptanceAllowed=false`;
- manter `walletAllowed=false`;
- retornar `CARE_SERVICE_NOT_AVAILABLE` como código público.

## Fora de escopo

Este PR não altera código operacional, não altera schema Prisma, não cria migration, não faz deploy, não altera produção, não habilita CARE público, não habilita CARE oficial e não mexe em pagamentos.

## Segurança

Este PR é documentação + teste de contrato. Ele apenas congela o mapa atual dos bloqueios para orientar os próximos passos com rastreabilidade.
