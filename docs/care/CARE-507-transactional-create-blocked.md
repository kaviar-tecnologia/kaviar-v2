# CARE-507 — criação transacional CARE bloqueada/fail-closed

## Decisão

Este PR registra o contrato operacional da criação CARE transacional, ainda bloqueada para o público.

A criação CARE deve respeitar:

- `passenger_id` sempre vindo do passageiro autenticado;
- `passenger_id` vindo do body é proibido;
- corrida CARE e `care_trip_requirements` devem nascer juntos;
- nenhuma corrida CARE pode sobreviver sem requisitos;
- requisitos CARE devem nascer `DRAFT`;
- cliente não pode enviar revisão, diagnóstico, preço, motorista, settlement ou wallet;
- fluxo público CARE continua bloqueado com `CARE_SERVICE_NOT_AVAILABLE`.

## Estado atual obrigatório

- `releaseReady=false`
- `publicCareAvailable=false`
- `officialCareAvailable=false`
- `operationAllowed=false`
- `dispatchAllowed=false`
- `acceptanceAllowed=false`
- `walletAllowed=false`
- `CARE_SERVICE_NOT_AVAILABLE`

## Fora de escopo

Este PR não faz deploy, não altera produção, não cria migration, não habilita CARE público, não habilita CARE oficial, não altera app, não aciona dispatcher, não permite aceite, não cria pricing CARE e não mexe em wallet ou pagamentos.

## Contrato público

A rota pública deve bloquear intenção CARE antes de:

1. idempotência;
2. persistência;
3. pricing;
4. dispatcher;
5. wallet;
6. resposta de sucesso.

## Contrato interno

`createRideWithRequirements` é o limite único de criação.

Sem requisitos CARE explícitos, qualquer intenção CARE deve falhar com `CARE_REQUIREMENTS_MISSING`.

Com requisitos CARE explícitos, a criação deve ocorrer em uma única transação:

1. validar requisitos;
2. criar `rides_v2`;
3. criar `care_trip_requirements`;
4. reverter tudo se a criação dos requisitos falhar.

## Segurança

Este PR é documentação + teste de contrato. Não libera operação real.
