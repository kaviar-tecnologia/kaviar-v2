# Fase 3C-2D.2B — Decisões Administrativas de 27/07/2026

**Aprovado por:** Aparecido de Góes (Proprietário KAVIAR)
**Data:** 2026-07-27T23:12:27Z
**Escopo:** Remoção do aceite legado, gratificação anual, gestor, compensação, estrutura futura
**Status:** APROVADAS

---

## Contexto

Decisões formalizadas em 27/07/2026 que:
1. Eliminam a exigência de aceite individual do motorista para participação no bônus/gratificação.
2. Renomeiam e redefinem o programa de bônus anual como "Gratificação Anual de Incentivo KAVIAR".
3. Alteram a base de cálculo: de "recarga" para "18% efetivamente consumidos".
4. Formalizam regras do gestor, compensação voluntária e estrutura futura.

Estas decisões **superseded** as regras BP-11 a BP-29 da BONUS-POLICY-v1.2 no que conflitam.

---

## SEÇÃO A — REMOÇÃO DO ACEITE LEGADO

### DEC-2707-01: Eliminação do aceite individual

O cadastro do motorista não exige mais aceite específico para participação na gratificação anual.
A gratificação é automática para todos os motoristas com operações elegíveis.

- Campos `family_bonus_accepted` e `family_bonus_profile` são legados.
- Código aplicacional não deve ler/escrever esses campos.
- Colunas mantidas temporariamente para compatibilidade. Remoção física somente após período de compatibilidade, auditoria de uso e migration específica aprovada.
- Payloads antigos contendo esses campos devem ser aceitos e ignorados.

### DEC-2707-02: Preservação de texto informativo

Manter comunicação informativa sobre a campanha (RetornoFamiliarCard, BonusCard)
sem checkbox, aceite obrigatório ou condição de elegibilidade.

---

## SEÇÃO B — GRATIFICAÇÃO ANUAL DE INCENTIVO KAVIAR

### DEC-2707-03: Nome funcional

Gratificação Anual de Incentivo KAVIAR.

### DEC-2707-04: Percentual vigente

10%.

### DEC-2707-05: Base de cálculo

Os 18% efetivamente consumidos/reconhecidos em operação elegível.
NÃO calcular sobre o valor total da corrida.

### DEC-2707-06: Evento gerador

A gratificação nasce quando uma operação elegível consome o crédito pré-pago
e a KAVIAR reconhece os 18% como receita.
NÃO nasce na compra/recarga do saldo.

### DEC-2707-07: Crédito pré-pago não gera gratificação

- O depósito do motorista aumenta ativo bancário.
- Simultaneamente gera passivo de créditos pré-pagos.
- A compra do saldo NÃO constitui receita da KAVIAR.
- A compra do saldo NÃO gera gratificação.
- O motorista recebe 100% do valor comprado como crédito consumível.

### DEC-2707-08: Reconhecimento da receita

A receita da KAVIAR nasce quando uma operação válida consome o crédito.
A base da receita é a taxa de intermediação de 18%.
Os 82% pertencentes ao motorista não são receita da KAVIAR.
O passivo de créditos pré-pagos é reduzido pelo valor consumido.

### DEC-2707-09: Ciclo anual

Começa a acumular em 1º de janeiro de cada ano.

### DEC-2707-10: Janela de solicitação

1º de outubro a 31 de dezembro.

### DEC-2707-11: Múltiplas solicitações

O motorista pode solicitar quantas vezes desejar dentro da janela.

### DEC-2707-12: Congelamento por solicitação

Cada solicitação congela/reserva o valor solicitado para impedir pagamento duplicado.

### DEC-2707-13: Prazo de pagamento

Até 48 horas contadas do momento da solicitação.

### DEC-2707-14: Transporte de saldo

Valor não solicitado até 31 de dezembro é transportado ao ano seguinte.
NÃO expira.

### DEC-2707-15: Direito preservado

Motorista ativo, inativo ou suspenso mantém o direito ao valor acumulado.
Remoção da plataforma não cancela o direito.

### DEC-2707-16: Percentual versionável

O percentual deve ser versionável por campanha e vigência.
A regra atual é 10%, mas futuras campanhas podem ter percentual diferente.

### DEC-2707-17: Financiamento

A gratificação é integralmente financiada pela KAVIAR.
Não reduz a parte do gestor.

---

## SEÇÃO C — GESTOR

### DEC-2707-18: Participação do gestor

40% dos 18% brutos reconhecidos pela KAVIAR.

### DEC-2707-19: Momento do cálculo

Antes de impostos, DAS, taxas municipais, gratificação e demais custos.
Provisionar por operação e consolidar por competência mensal.

### DEC-2707-20: Nota fiscal obrigatória

Pagamento do gestor depende de nota fiscal emitida pelo gestor para a KAVIAR.
Enquanto a nota não for validada, o valor permanece a pagar.
A nota deve ser vinculada ao gestor, período, CNPJ pagador, valor e comprovante.
Não presumir alíquotas ou retenções ainda não confirmadas.

---

## SEÇÃO D — COMPENSAÇÃO VOLUNTÁRIA POR CANCELAMENTO

### DEC-2707-21: Tipo operacional

CANCEL_COMPENSATION — não fingir que a corrida foi concluída.

### DEC-2707-22: Divisão

- 82% ao motorista
- 18% como receita da KAVIAR
- Gestor recebe 40% dos 18%
- Gratificação gera 10% dos 18%

Exemplo para R$ 20,00:
- Motorista: R$ 16,40
- KAVIAR: R$ 3,60
- Gestor: R$ 1,44
- Gratificação: R$ 0,36

### DEC-2707-23: Reversão

Reembolso, chargeback ou fraude deve reverter todos os lançamentos de forma idempotente.

---

## SEÇÃO E — ESTRUTURA FUTURA (REGISTRAR, NÃO IMPLEMENTAR)

### DEC-2707-24: Matriz

A matriz atual é no Rio de Janeiro.

### DEC-2707-25: Múltiplos estabelecimentos

O sistema deverá suportar múltiplos establishments/CNPJs.
Hierarquia: COMPANY > ESTABLISHMENT/CNPJ > STATE > MUNICIPALITY > TERRITORY.

### DEC-2707-26: Segregação por operação

Cada operação financeira deve ser atribuível a:
establishment_id, CNPJ, estado, município, território, motorista, gestor, operação/corrida, competência.

### DEC-2707-27: Tributação parametrizável

Nenhuma alíquota municipal ficará hard-coded.
Criar conceito de regra tributária/municipal parametrizável com vigência.

### DEC-2707-28: Os 1,5% não confirmados

Os 1,5% anteriormente mencionados para o Rio de Janeiro:
- NÃO foram informação do contador.
- NÃO são decisão aprovada.
- NÃO devem ser cadastrados como regra.
- Permanecem pendentes de confirmação oficial.

### DEC-2707-29: Módulo regulatório existente

O módulo municipal regulatório existente (8 tabelas, CRM, checklist, protocolos, gate)
será AMPLIADO, não substituído. Não criar módulo paralelo.

---

## SEÇÃO F — INFORMAÇÕES DO CONTADOR (REGISTRAR SEM FECHAR)

### DEC-2707-30: Informação oral atribuída ao contador

Informação oral atribuída ao contador pela administração da KAVIAR em
27/07/2026, pendente de confirmação documental.

1. Regime tributário informado: Simples Nacional.
2. Base econômica informada: receita própria da KAVIAR (os 18%).
3. Valor depositado como crédito não é receita imediata.
4. Receita é reconhecida quando o crédito é consumido.
5. Gestor deve emitir nota fiscal para receber.
6. DAS apurado sobre a atividade/receita da plataforma conforme o regime.

### DEC-2707-31: NÃO confirmado (pendente)

- Anexo do Simples
- Alíquota efetiva
- Fator R
- Código de serviço
- Município competente para ISS
- Retenções na nota do gestor
- Classificação contábil final da participação do gestor
- Chargebacks e reembolsos (tratamento fiscal)
- Tratamento fiscal de parceiros
- Alíquota municipal específica

---

## SEÇÃO G — FORMA DE PAGAMENTO DA GRATIFICAÇÃO

### DEC-2707-32: Liquidação exclusivamente em dinheiro (CASH_ONLY)

Decisão administrativa da KAVIAR:

- Forma de liquidação: CASH_ONLY.
- Meios permitidos: PIX ou transferência bancária.
- Prazo: até 48 horas da solicitação.
- Conversão em créditos do aplicativo: PROIBIDA.
- Compensação com débitos ou taxas da plataforma: PROIBIDA.
- Uso automático para pagar taxas: PROIBIDO.
- Conversão unilateral pela KAVIAR: PROIBIDA.
- Pagamento depende de chave PIX ou dados bancários válidos do motorista.
- Toda tentativa, confirmação, falha e reprocessamento deve ser auditável e idempotente.

---

## Supersede

As regras BP-11 a BP-29 da BONUS-POLICY-v1.2 foram **integralmente substituídas**
pelas regras BP-11 a BP-29 da BONUS-POLICY-v1.3.

O campo `historical_rules_v1.2` no registro de decisões existe somente para
preservação histórica e **não possui vigência operacional**.

Regras BP-01 a BP-10 (Parte I — bônus por campanha) permanecem inalteradas.
