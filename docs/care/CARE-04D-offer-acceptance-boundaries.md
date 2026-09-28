# CARE-04D — preparação das barreiras do dispatcher e do aceite oficiais

## Limite desta entrega

Esta alteração trabalha **somente no dispatcher e no aceite existentes**, usando
`rides_v2`, `ride_offers` e o adaptador CARE-04C (`evaluateCareEligibilityFromDb`).
Não cria outra fila, matcher, fluxo de reserva, tabela, API, configuração de liberação
ou integração financeira. A rota HTTP de criação/estimativa, o ajuste de preço e
o bloqueio CARE-04A permanecem inalterados.

A auditoria do RDS demonstrou que CARE-02 tem `finished_at` preenchido e as três
tabelas CARE existem. Isso **não** equivale a homologar o serviço CARE.

### Barreiras preparadas

- **Entrada do dispatcher:** o bloqueio incondicional CARE-04A continua cancelando
  ofertas pendentes e deixando a corrida em `no_driver` sem buscar candidatos.
- **Descoberta de candidatos:** se, numa etapa futura explicitamente revisada,
  a barreira inicial mudar, a consulta do adaptador CAR​E-04C ocorrerá **antes do
  score** no próprio `findCandidates`. Sem seguro, autorização municipal,
  território e demais requisitos comprovados, nenhum candidato é elegível.
- **Criação de oferta:** a transação oficial relê a identidade/estado da corrida;
  `updateMany` exige estado `requested/offered`, categoria e tipo ainda
  iguais aos lidos. Falha de concorrência desfaz a oferta pela transação.
  Uma corrida CARE é reavaliada no mesmo cliente transacional antes de
  `ride_offers.create` e continua expressamente negada, mesmo que um
  avaliador retorne positivo. Não há publicação de oferta ou notificação
  em caso de falha.
- **Aceite do motorista:** o bloqueio CARE-04A continua no início da
  transação. A verificação do CARE-04C foi posicionada depois desse
  bloqueio e antes de alterar oferta, corrida ou carteira. O
  `updateMany` do aceite compara também categoria e tipo persistidos,
  impedindo que um aceite iniciado como corrida comum atribua motorista
  a uma corrida cuja identidade foi alterada.
- **Redispatch, expiração e cancelamento:** seguem o dispatcher oficial
  existente; não há caminho CARE alternativo. O aceite de ajuste de preço
  continua protegido pela barreira CARE-04A já existente.

### Limites técnicos explícitos

1. A avaliação adicional CARE fica atrás do bloqueio incondicional; **não
   representa uma integração operacional liberada**. Não existe nenhuma
   alteração que permita usar CARE em produção ou em ambiente de teste pela API.
2. Os três gates externos do adaptador são passados como `null`, não como
   autorização. A falta de prova específica do seguro CARE, da regulação
   municipal da modalidade e do território segue negando elegibilidade,
   independentemente de flags gerais ou informações do cliente.
3. A reconsulta e os predicados de `updateMany` reduzem corridas entre
   leitura e atualização. Não substituem uma revisão completa de bloqueios
   concorrentes, `trip_details`, preço oficial, oferta idempotente e
   revalidação da rota alternativa de ajuste antes de habilitar o serviço.
4. Não há falso registro de seguro, preço, qualificação, revisão administrativa
   ou migração. Não registrar dados clínicos, CID ou diagnósticos nas tabelas CARE.
5. Não se deve desativar isoladamente o bloqueio CARE-04A. A liberação futura
   exige fluxo tipado de criação/estimativa, preço oficial, evidências
   independentes e auditoria end-to-end de toda a máquina de estados.

### Verificações automáticas

O workflow `care-04d-ci.yml` executa typecheck e testes CARE-03/04A/04B/04C/04D
com dados sintéticos e URL local inativa; o E2E integrado do repositório
exercita fluxos existentes em PostgreSQL descartável. O teste desta PR
verifica a ordem das barreiras, o `compare-and-set` de estado/identidade, a
ausência de liberação por flag, a preservação do ajuste e do redispatch oficiais.

**Operações proibidas nesta entrega:** deploy backend/frontend, `migrate deploy`,
restauração do snapshot, seed de produção, ativação CARE, configuração de
workers financeiros, cobrança ou repasse.
