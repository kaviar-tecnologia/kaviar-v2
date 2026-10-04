# CARE-486 — Internal pilot gate design

## Estado

Este documento define o desenho técnico para uma futura trava de piloto interno CARE.

Este PR não ativa CARE oficial, não muda runtime, não muda flags, não cria migration e não faz deploy.

## Decisão técnica

A futura ativação controlada deve usar a infraestrutura existente de feature flag allowlist, com chave dedicada:

- CARE_INTERNAL_PILOT

A allowlist deve ser por passenger_id e não por campo novo no modelo passengers.

## Motivos

- Já existe feature_flag_allowlist com unicidade por key + passenger_id.
- Já existem rotas administrativas de feature flags e allowlist.
- O modelo passengers não deve receber campo específico de piloto CARE sem necessidade.
- A autorização de piloto precisa ser revogável sem migração.
- A seleção do piloto precisa ser administrativa, auditável e reversível.

## Travas obrigatórias para implementação futura

- CARE_INTERNAL_PILOT deve ser checado no backend, nunca apenas no frontend.
- O passenger_id deve vir da sessão autenticada, nunca do corpo da requisição.
- A allowlist não pode liberar CARE sozinha.
- As flags CARE_PUBLIC_REQUEST_ENABLED, CARE_OFFICIAL_ENABLED, CARE_DISPATCH_ENABLED e CARE_DRIVER_ACCEPTANCE_ENABLED continuam necessárias.
- O dispatcher precisa revalidar motorista, veículo, território, cidade, seguro e preço.
- O aceite precisa revalidar tudo antes de assignment, wallet, pricing e notificações.
- Passageiro idoso, PCD ou com mobilidade reduzida não pode pagar mais caro por sua condição.
- CARE_ADAPTED_WHEELCHAIR continua fora do piloto até haver veículo realmente adaptado e evidência documental.

## Ordem futura sugerida

1. Criar serviço read-only para checar CARE_INTERNAL_PILOT por passenger_id.
2. Criar testes garantindo fail-closed quando passageiro não está na allowlist.
3. Permitir apenas CARE_ASSISTED e FOLDING_WHEELCHAIR no piloto inicial.
4. Manter CARE_ADAPTED_WHEELCHAIR bloqueado.
5. Integrar quote/lock com paridade de preço da corrida comum equivalente.
6. Integrar dispatcher com revalidação CARE.
7. Integrar aceite com revalidação CARE.
8. Exigir autorização expressa antes de merge de ativação.
9. Exigir autorização expressa separada antes de deploy.

## Fora de escopo

Este PR não habilita CARE oficial, não expõe CARE ao passageiro, não altera app, não altera backend operacional, não altera dispatcher, não altera aceite, não altera pricing, não altera wallet, não cria migration, não altera variáveis de produção e não faz deploy.
