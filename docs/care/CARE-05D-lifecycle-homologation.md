# CARE-05D — homologação negativa do lifecycle oficial

Testes de **integração real com os serviços oficiais** contra PostgreSQL
descartável do GitHub Actions. Não habilitam CARE, não usam pessoas reais,
não chamam seguradora nem executam cobrança.

Cenários efetivamente verificados:
- `createRideWithRequirements` grava `rides_v2` e seu requisito DRAFT sem preço;
- oferta CARE sintética, criada apenas na base descartável para simular legado,
  é rejeitada por `acceptOfferInternal` antes de atribuição, wallet e settlement;
- dois aceites simultâneos não atribuem motorista nem aceitam oferta;
- `dispatcherService.dispatchRide` cancela a oferta pendente e mantém a corrida
  em `no_driver`, inclusive numa segunda tentativa;
- oferta vencida não é aceita; cancelamento da corrida permanece final;
- suíte original de concorrência de aceite comum e CARE-04B roda na mesma CI.

**O que este teste NÃO comprova:** disponibilidade operacional do CARE,
cobertura específica de seguro/município, preço oficial e paritário no
`ride_settlements`, integração de ponta a ponta de API/usuários ou
revogação no meio de uma corrida real. Não usar o resultado para desativar
CARE-04A. É um gate de regressão da contenção do código atual, não
homologação positiva.

O workflow cria esquema exclusivamente no banco descartável
`care05d_disposable`. Nunca executar este teste usando `DATABASE_URL` de
produção. Nenhum arquivo da máquina de estados, módulo financeiro, rota,
Prisma schema ou migração é alterado pela PR.
