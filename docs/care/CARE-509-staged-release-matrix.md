# CARE-509 — matriz de liberação controlada por etapas

## Decisão

Este PR registra a ordem obrigatória para qualquer futura liberação operacional do CARE.

A liberação CARE não pode ocorrer por uma única flag, por atalho operacional ou por decisão implícita. Cada etapa deve ter evidência, teste, revisão e autorização explícita.

## Estado atual obrigatório

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

## Matriz de etapas

### Etapa 0 — bloqueio público

Obrigatório manter:

- rota pública bloqueada;
- estimativa CARE bloqueada;
- criação CARE pública bloqueada;
- resposta pública com `CARE_SERVICE_NOT_AVAILABLE`.

### Etapa 1 — pré-requisitos administrativos

Antes de operação real, validar:

- território permitido;
- gestor elegível;
- contrato aplicável;
- documentação administrativa;
- auditoria de decisão.

### Etapa 2 — elegibilidade motorista e veículo

Antes de despacho real, validar:

- motorista verificado;
- qualificação CARE;
- capacidade do veículo;
- requisitos de acessibilidade;
- ausência de pré-atribuição indevida.

### Etapa 3 — pricing sem discriminação

Antes de cobrança real, validar:

- tarifa sem discriminação por idade, deficiência ou mobilidade;
- acréscimos apenas por serviço real, tempo, distância ou categoria permitida;
- paridade documentada;
- teste de regressão financeiro.

### Etapa 4 — dispatcher controlado

Antes de disparo real, validar:

- filtro por elegibilidade;
- filtro por veículo;
- bloqueio para motorista não qualificado;
- ausência de oferta pública fora do piloto autorizado.

### Etapa 5 — aceite controlado

Antes de aceite real, validar:

- motorista elegível;
- requisitos compatíveis;
- contrato e território válidos;
- auditoria do aceite.

### Etapa 6 — wallet e pagamentos

Somente depois das etapas anteriores, validar:

- wallet permitido;
- settlement permitido;
- repasse permitido;
- reconciliação financeira;
- nenhum pagamento real sem autorização expressa.

### Etapa 7 — autorização final

Qualquer habilitação real exige:

- PR específico;
- testes verdes;
- checklist operacional;
- revisão do risco jurídico/financeiro;
- autorização expressa do proprietário;
- confirmação de que produção pode receber a mudança.

## Fora de escopo

Este PR não altera código operacional, não altera schema Prisma, não cria migration, não faz deploy, não altera produção, não habilita CARE público, não habilita CARE oficial e não mexe em pagamentos.

## Segurança

Este PR é documentação + teste de contrato. Ele apenas congela a ordem mínima de liberação para evitar ativação incompleta, acidental ou insegura do CARE.
