# CARE-05E — barreiras de liberação e revisão de segurança

**Estado vigente:** o CARE-04A rejeita criação, estimativa, despacho,
aceite e ajuste de preço de corridas CARE. Essa contenção não pode ser
alterada por uma flag, documentação, registro genérico de APP/CAR ou
passagem de testes sintéticos.

Nenhum texto abaixo autoriza produção, migrações, habilitação, pagamentos
ou mudança da política atual. O deploy é sempre uma decisão separada.

## Cinco requisitos acumulativos — falha de qualquer item impede ativação

### 1. Território operacional real

A revisão de bairro/território é apenas pré-requisito cadastral. Exigir
geofence oficial do **ponto de embarque**, modo CARE, área de operação,
condições de retorno e revisão territorial vigente. Não utilizar
consentimento de fallback de corrida comum para deslocar pessoa que
necessita de assistência a território não homologado.

### 2. Autorizações de município e seguradora na fonte oficial

Provar, em documentação específica e revisada, modalidade, município,
UF, território, veículo/placa, documento de origem, emissor, período,
endosso, limites e exclusões da cobertura, assinatura/aprovação,
revogação e revisão por responsável. Um registro comum CAR/APP não basta.
O esquema oficial ainda não representa inteiramente esse escopo:
registrar lacuna e obter aprovação de mudança **aditiva** nas fontes
originais antes de conectar boolean de elegibilidade. Não criar cadastro
paralelo, não fazer parsing permissivo de texto livre, não inventar
apólice ou autorização.

### 3. Preço transparente e não discriminatório

A KAVIAR decide não impor tarifa adicional por idade, deficiência,
mobilidade reduzida, necessidade de acompanhante, cadeira de rodas,
cão-guia ou tempo extra de embarque. Mesma viagem comparável usa tarifa
equivalente do **motor oficial** e registro `ride_settlements`; não
existe motor ou ledger CARE. Rejeitar adicionais ou ajuste unilateral do
motorista que aumente valor em razão da acessibilidade.

Se não for possível produzir cotação verificável sem receita/tarifa
inventada, o serviço CARE permanece indisponível; não gerar preço
fictício só para desbloquear testes. A política precisa de validação
jurídica antes da operação em cada município. Lei 13.146/2015, arts.
4 e 46, prevê igualdade e acesso; art. 51 §1 proíbe tarifa diferenciada
e valores adicionais **expressamente em táxis**. Não estender
automaticamente o dispositivo específico a toda plataforma privada.

Fontes:
- https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm
- https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741compilado.htm
- https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2005/lei/l11126.htm

### 4. Homologação do lifecycle realmente exercitado

No mesmo `rides_v2`/`ride_offers` e serviços existentes: API real
de estimativa/criação, requisitos atômicos, precificação/lock,
candidato habilitado, oferta, aceite concorrente, expiração,
cancelamento, ajuste, redispatch e liquidação. Validar novamente
evidência atual antes de oferta/aceite. Incluir revogação e troca de
placa entre etapas, mudança concorrente de categoria/requisitos,
idempotência, isolamento e regressão CAR/MOTO/Premium.
Os testes negativos do CARE-05D demonstram apenas bloqueio vigente;
**não** a disponibilidade positiva do produto. Não usar cenário
sintético de seguro/município como homologação real.

### 5. Gate de habilitação independente e verificável

Precisam existir: relatório técnico e de segurança, parecer jurídico/
municipal e posicionamento da seguradora, validação da política
comercial/financeira, definição operacional do atendimento CARE,
verificação de privacidade/LGPD e aprovação expressa de release
pela direção da KAVIAR. Abrir PR isolado para qualquer mudança do
CARE-04A e executar todos os checks necessários. Ter plano de
rollback da aplicação, sem restaurar banco automaticamente.

**Proibições persistentes:** segundo dispatcher, carteira ou ledger,
cobrança por condição pessoal, indicação de CID/diagnóstico,
habilitação por flag isolada, seed de apólice ou de pagamento real,
`migrate deploy` ou alteração de produção sem aprovação específica.

## Rastreabilidade

- CARE-05A (#428): cadastro territorial existente, sem autorização.
- CARE-05B (#429): `territoryRegistryReviewed` separado de
  `territoryEligible` e contrato de paridade tarifária.
- CARE-05C (#430): auditoria read-only de registros CAR/APP genéricos.
- CARE-05D (#431): testes de contenção do lifecycle no PostgreSQL
  descartável; não é liberação positiva.
- CARE-05E (esta documentação): checklist de decisão e limites de
  aprovação. O bloqueio CARE-04A permanece em todos os casos.

Nenhuma etapa dessa sequência altera a produção automaticamente.
