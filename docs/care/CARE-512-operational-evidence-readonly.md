# CARE-512 — evidência operacional read-only

## Decisão

Este documento define o contrato de evidência operacional read-only para o CARE.

Antes de qualquer liberação real, a KAVIAR deve conseguir consultar e registrar evidências operacionais sem alterar estado, sem criar corrida real, sem acionar dispatcher, sem aceitar motorista, sem movimentar wallet e sem gerar pagamento.

## Estado atual

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

## Princípio read-only

Toda evidência operacional nesta etapa deve ser somente leitura.

É proibido:

- criar corrida real;
- alterar status de corrida;
- chamar dispatcher real;
- ofertar corrida para motorista;
- aceitar corrida;
- alterar wallet;
- calcular repasse oficial;
- executar pagamento;
- alterar flags de produção;
- alterar dados administrativos.

## Evidência operacional permitida

A consulta read-only pode apenas observar:

- estado das flags CARE;
- readiness administrativo;
- bloqueios ativos;
- existência de território;
- status de gestor;
- status de contrato;
- status de documentos;
- elegibilidade shadow de motorista;
- compatibilidade shadow de veículo;
- trilha de auditoria shadow;
- ausência de liberação pública;
- ausência de liberação oficial.

## Evidência operacional proibida

A consulta read-only não pode:

- criar registros operacionais definitivos;
- publicar disponibilidade para passageiro;
- publicar disponibilidade para motorista;
- alterar qualquer campo financeiro;
- executar cálculo de cobrança oficial;
- criar settlement;
- gerar repasse;
- alterar saldo;
- disparar webhook financeiro;
- enviar notificação operacional real.

## Critério 1 — entrada

Uma evidência operacional read-only deve receber somente identificadores ou filtros de consulta.

Exemplos permitidos:

- território;
- gestor;
- motorista;
- veículo;
- passageiro autenticado;
- tipo de intenção CARE;
- janela de auditoria.

## Critério 2 — saída

A saída deve informar somente estado observado.

A saída mínima deve conter:

- `releaseReady`;
- `publicCareAvailable`;
- `officialCareAvailable`;
- `operationAllowed`;
- `dispatchAllowed`;
- `acceptanceAllowed`;
- `walletAllowed`;
- bloqueios encontrados;
- evidências ausentes;
- riscos observados;
- recomendação read-only.

## Critério 3 — ausência de side effects

A consulta deve garantir:

- nenhuma criação de corrida;
- nenhuma alteração de status;
- nenhuma chamada ao dispatcher;
- nenhum aceite;
- nenhuma alteração de wallet;
- nenhum pagamento;
- nenhuma migration;
- nenhuma alteração em produção.

## Critério 4 — auditoria

Toda evidência read-only futura deve ser auditável por:

- timestamp;
- ambiente;
- commit;
- versão;
- usuário administrativo;
- parâmetros de consulta;
- resultado observado;
- decisão recomendada;
- ausência explícita de side effects.

## Critério 5 — bloqueio preservado

Mesmo com evidência operacional read-only completa, CARE segue bloqueado até que exista PR específico de liberação, com autorização expressa e checklist completo.

A evidência read-only não autoriza operação.

## Fora de escopo

Este PR não altera código operacional, não altera schema Prisma, não cria migration, não faz deploy, não altera produção, não habilita CARE público, não habilita CARE oficial, não mexe em dispatcher, aceite, pricing, wallet ou pagamentos.

## Segurança

Este contrato permite preparar a governança de liberação sem abrir o produto real. A evidência operacional read-only serve para decidir, não para operar.
