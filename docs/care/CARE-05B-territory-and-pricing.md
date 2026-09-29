# CARE-05B — território de referência e política de tarifa não discriminatória

## Objetivo e limites

Esta entrega **não autoriza CARE** nem altera o motor financeiro, rotas, dispatcher,
aceite, ECS ou esquema. É uma correção semântica no módulo CARE-05A e um contrato
puro de comparação com cotação registrada pelo motor oficial. Nenhuma operação
real, preço novo ou transação financeira é executada.

### 1. Identidade territorial

`territoryRegistryReviewed` indica somente o cadastro existente de bairro/
território ativo e administrativamente revisado. Nunca equivale à autorização
geográfica para realizar transporte CARE naquele ponto e veículo. Por isso
`evidence.territoryEligible=false` enquanto não existir validação CARE
específica do ponto de embarque contra a geofence oficial e a operação
documentada da modalidade. A revisão cadastral não fornece prova jurídica.

### 2. Fonte de município e seguro

O fluxo municipal atual trabalha com `CAR`, `MOTO_PASSENGER`, etc.
`canOperateMunicipally=true` para CAR comum (inclusive quando não há regra
municipal cadastrada) não autoriza automaticamente serviço especializado CARE.
APP genérico, registro `ACTIVE`, campo `notes` ou resposta livre do provedor
não atestam cobertura específica da modalidade ou da placa. Manter
`municipalAuthorized=false` e `insuranceConfirmedForMode=false` até
comprovação documental revisada e representada na fonte oficial.

Um futuro registro de evidência deverá conter origem verificável, modalidade,
identificador do veículo e da apólice/autorização, local, datas de vigência e
identidade da revisão administrativa. Não adicionar outro cadastro concorrente.

### 3. Tarifa e não discriminação

**Regra operacional interna proposta à KAVIAR:** para mesma rota, período,
condições comerciais e categoria de viagem de carro comparável, o valor pago
pela pessoa no CARE não deve aumentar por idade, deficiência, acompanhante
necessário, cadeira de rodas, cão-guia ou tempo adicional de embarque. Nenhuma
linha de cobrança de acessibilidade; nenhuma alteração posterior do preço por
negociação do motorista nesta modalidade, salvo futura política específica
juridicamente revisada que jamais imponha adicional discriminatório.

A Lei 13.146/2015, art. 4, veda discriminação em razão da deficiência;
art. 46 trata da igualdade de acesso ao transporte; art. 51, §1, veda de forma
expressa a tarifa diferenciada ou adicional **em táxis**. A aplicação
específica a intermediação privada do CARE necessita de validação jurídica
e municipal; **não** se afirmar que o art. 51 classifica todo aplicativo
como táxi. Fontes:
- https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm
- https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741compilado.htm
- https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2005/lei/l11126.htm

`evaluateCareFareParity` é uma verificação pura e somente compara propostas
a uma **cotação-base equivalente, de origem confiável**, já registrada em
`ride_settlements`; não cria preços. Exige mesmo fingerprint de viagem,
mesmo perfil e mesmo preço cotado/bloqueado em centavos, sem adicional ou
ajuste unilateral. Se não existir linha oficial equivalente, negar cotação/
liberação; jamais inventar tarifa de CARE, nem forjar um registro normal
para obter o valor.

A função pura **não autentica a origem por conta própria**: no futuro o
backend deverá construir os objetos por leituras confiáveis, nunca a partir
de JSON do app, e comprovar a equivalência de rota, horário e perfil.
O contrato não constitui autorização financeira ou jurídica.

### 4. Testes reais ainda obrigatórios

Candidatura, oferta concorrente, expiração, rejeição, cancelamento,
`pending_adjustment`, redispatch, preço oficial e revogação de
credenciais devem ser exercitados em um PostgreSQL descartável, em
caminhos HTTP/serviço reais. Os testes estáticos do CARE-04D não
substituem uma execução do lifecycle CARE. Em nenhum cenário usar
seguro/regulação falsos para liberar uma corrida real.

### 5. Gate de liberação

O bloqueio CARE-04A continua incondicional. Um `true` isolado de qualquer
verificação territorial, regulatória, securitária ou de preço não o altera.
Liberação pública exige proposta separada, evidência real, aprovação
jurídica/operacional e autorização expressa para cada ambiente.

Operações fora do escopo: schema/migration/seed, mudança em `pricing-engine`,
rotas HTTP, dispatcher, aceite, worker, carteira, repasse, ECS, RDS ou deploy.
