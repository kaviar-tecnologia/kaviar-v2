# CARE-04B — Uma criação de corrida, requisitos na mesma transação

Base: CARE-01 #415, CARE-02 #416, CARE-03 #417 e bloqueio CARE-04A #419.

## Entrega limitada e explícita

O serviço `backend/src/services/care/care-ride-create.ts` é **uma fronteira compartilhada de criação**. O `POST /rides-v2` convencional chama `createRideWithRequirements({ data })`, que delega à criação Prisma já existente sem mudar os parâmetros, os cálculos, o despacho, o agendamento, a escolha de motorista ou o financeiro.

Uma futura integração CARE fornecerá, no **mesmo método**, um segundo argumento tipado com requisitos funcionais. Nesse caso, o método insere `rides_v2` e `care_trip_requirements` numa única `prisma.$transaction`. Falha do filho desfaz o pai; sucesso cria o filho em `DRAFT` e sem `reviewed_by_admin_id`/`reviewed_at`. Não existem "corridas sem requisito" no caminho CARE.

**Nenhum endpoint público fornece esse segundo argumento neste PR.** A barreira de disponibilidade do CARE-04A permanece incondicional e bloqueia estimativas/solicitações CARE. O próprio dispatcher e ambos os caminhos de aceite continuam bloqueados para corridas CARE importadas. Nenhuma migração foi executada em produção.

## Validação de dados mínimos

- Modo: `ASSISTED`, `FOLDING_WHEELCHAIR` ou `ADAPTED_WHEELCHAIR`.
- Cadeira dobrável exige declaração expressa de transferência autônoma; adaptado exige permanência na cadeira.
- Número de acompanhantes inteiro e limitado; campos funcionais booleanos explícitos.
- A categoria da corrida deve corresponder exatamente ao modo; não converter CARE em `CAR_NORMAL`.
- Não aceitar corrida CARE pré-atribuída, com estado `accepted` ou já revisada.
- Atribuição de revisão, qualificação, documentos e cobertura não é escrita por cliente.
- Dados extras (diagnóstico, medicação, histórico de saúde, revisor declarado no payload) **não são espalhados** para o banco.

## Testes

- `care-04b-atomic-create.test.ts`: caminho normal sem transação extra, mesmo método com transação, validação funcional, propagação de erros.
- `care-04b-atomic-postgres.test.ts`: PostgreSQL descartável no GitHub Actions; confirma os dois registros, gera falha sintética no insert do requisito por trigger **somente nesse banco temporário** e verifica rollback do registro de corrida, além da regressão de corrida comum.
- `care-04b-ci.yml`: Prisma, typecheck, testes CARE anteriores e integração PostgreSQL descartável. Não conecta à AWS/RDS de produção.

## Gate para CARE-04C

1. Integrar preenchimento de requisitos tipados na mesma rota sem permitir que cliente marque `READY`. Política de autorização operacional e auditoria deve existir antes de permitir revisão.
2. Não chamar dispatcher antes de encontrar requisito `READY` verificado. Manter todos os caminhos (agendamento, redispatch, cancelamento e ajuste) fechados se faltar requisito.
3. Resolver evidências reais de motorista/veículo/placa/seguro e município via backend; não aceitar flags do aplicativo.
4. Antes de oferta e aceite, reavaliar compatibilidade no dispatcher/acceptOfferInternal atuais.
5. Sem preço CARE inventado, sem duplicar serviço, sem ligar pagamentos nem adicionar comunicações externas.
6. Revisar o estado operacional de pré-despacho antes de expor criação CARE; `DRAFT` na tabela de requisitos **nunca** equivale a corrida confirmada.
7. Antes de expor o caminho CARE, definir proteção de idempotência concorrente: a busca atual de `idempotency_key` no fluxo comum não equivale a constraint única por passageiro no banco; rejeitar duplicatas de modo transacional e testar duas requisições simultâneas. Nenhuma chave idempotente externa é aceita como autorização de modalidade.

CARE continua em implantação até todas as portas de segurança e operação ficarem prontas.
