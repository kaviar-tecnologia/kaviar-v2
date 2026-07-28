# Fase 3C-2D.2B — Política Oficial do Bônus KAVIAR

**Política:** `BONUS-POLICY-v1.3`<br>
**Aprovado por:** Aparecido de Góes (Proprietário KAVIAR)<br>
**Data de aprovação:** 2026-07-27T23:12:27Z<br>
**Status:** Política vigente, congelada para a próxima implementação. Regras definitivas para o Commit 2.

Gratificação Anual de Incentivo KAVIAR — 10% dos 18% efetivamente consumidos em operação elegível. Liquidação exclusivamente em dinheiro (PIX ou transferência). Aceite individual eliminado. Múltiplas solicitações Oct-Dez. Carry-over automático. Regras BP-11 a BP-29 integralmente substituídas em relação à v1.2.

## Regras

### BP-01

O motorista recebe 100% do valor comprado como saldo consumível.

> **Exemplo:** Pagamento de R$100 gera R$100 em créditos. Nenhum valor da compra é retido para financiar bônus.

### BP-02

O bônus é integralmente financiado pela KAVIAR.

### BP-03

O bônus não nasce na compra dos créditos.

### BP-04

O evento gerador é uma corrida válida concluída.

### BP-05

A base do bônus é a taxa de intermediação efetivamente reconhecida pela KAVIAR, não o valor total da corrida.

### BP-06

O percentual é configurável e versionado por campanha. Nenhum percentual fixo deve aparecer em nome de conta, código, blueprint, regra de domínio fixa ou teste.

### BP-07

Após a corrida válida gerar o bônus, o direito torna-se incondicional.

### BP-08

Corrida cancelada, fraudulenta, estornada ou invalidada não gera bônus definitivo.

### BP-09

A Gratificação Anual de Incentivo KAVIAR é liquidada exclusivamente em dinheiro, por PIX ou transferência bancária, para a chave ou conta validada do motorista. Não é permitida conversão em créditos do aplicativo.

### BP-10

Tratamento contábil: contraprestação a pagar ao cliente, redução da receita, passivo certo após o evento gerador.

### BP-11

Nome funcional: Gratificação Anual de Incentivo KAVIAR. Percentual vigente: 10%. Base: os 18% efetivamente consumidos/reconhecidos em operação elegível. Não é calculada sobre o valor total da corrida.

### BP-12

Evento gerador: operação elegível que consome crédito pré-pago e reconhece os 18% como receita da KAVIAR. A gratificação nasce automaticamente nesse momento. Não depende de aceite individual do motorista.

### BP-13

Notas baixas não cancelam a gratificação adquirida.

### BP-14

Indisciplina não cancela a gratificação adquirida. Consequências disciplinares são tratadas separadamente.

### BP-15

Remoção da plataforma não cancela a gratificação adquirida. Não elimina valores legítimos, não autoriza confisco nem expiração antecipada.

### BP-16

Canal alternativo obrigatório para motorista removido solicitar gratificação na janela anual.

### BP-17

Janela anual de solicitação: 1º de outubro a 31 de dezembro. O motorista pode realizar quantas solicitações desejar dentro da janela. Cada solicitação congela o valor solicitado. Prazo de pagamento: até 48 horas da solicitação. Valor não solicitado até 31 de dezembro é transportado ao ano seguinte.

### BP-18

Proibição de confisco ou compensação do valor legitimamente adquirido por fatos não relacionados à operação que gerou a gratificação.

### BP-19

Reversão somente quando a operação que gerou a gratificação for revertida, estornada, fraudulenta, duplicada, inválida ou sofrer chargeback. Problemas em outras operações não afetam gratificações legítimas.

### BP-20

Fraude ou invalidação de uma operação afeta apenas a gratificação vinculada a ela. Outros valores legítimos de outras operações permanecem protegidos.

### BP-21

Registro do direito adquirido vinculado a: motorista, operação/corrida ou CANCEL_COMPENSATION, fee de 18%, base de cálculo, percentual vigente, campanha/versão, ciclo anual, status, reversões, solicitações, pagamentos e auditoria.

### BP-22

Comunicação clara ao motorista: a gratificação nasce do consumo dos 18% em operações elegíveis; não é perdida por nota, suspensão ou encerramento; janela anual informada; financiada integralmente pela KAVIAR.

### BP-23

Regra consolidada: 10% dos 18% consumidos em operação elegível, presente de reconhecimento pela confiança, não depende de nota/disciplina/permanência, não expira, janela anual com múltiplas solicitações, KAVIAR financia integralmente, gestor e parceiro não participam do financiamento, reversão somente por problema na operação geradora.

### BP-24

A gratificação é registrada e acumulada após a conclusão da operação elegível (corrida concluída ou CANCEL_COMPENSATION processada). Exibição no aplicativo ocorre após o settlement da operação.

### BP-25

Operações elegíveis concluídas desde 1º de janeiro geram gratificação continuamente. A acumulação ocorre o ano inteiro, dentro e fora da janela de solicitação (outubro-dezembro). Solicitações anteriores não interrompem a geração de novos valores.

### BP-26

Solicitação enviada entre 1º de outubro e 31 de dezembro permanece válida. O prazo de pagamento é de até 48 horas contadas do momento da solicitação. Atrasos administrativos ou bancários não prejudicam o motorista.

### BP-27

O fluxo de solicitação é exclusivo para gratificação anual. Não permite solicitar saldo principal, compensação de cancelamento, reembolso, ganhos de corridas, ajustes ou outros créditos promocionais.

### BP-28

A gratificação anual é controlada separadamente na wallet: PURCHASED_BALANCE, ANNUAL_BONUS, CANCELLATION_COMPENSATION. A exibição identifica claramente dinheiro do motorista, presente da KAVIAR e compensação.

### BP-29

CANCEL_COMPENSATION gera gratificação de 10% sobre os 18% da compensação. Cancelamento sem compensação voluntária não gera gratificação. Não geram gratificação: taxa de cancelamento futura, créditos manuais, reembolsos, valores de corridas, ajustes administrativos ou créditos promocionais.

## Lançamentos contábeis conceituais

| Evento | Débito | Crédito |
|--------|--------|---------|
| Conclusão da corrida | Créditos pré-pagos de motoristas (2101) | Receita bruta de intermediação (3101) |
| Reconhecimento do bônus | Dedução da receita — bônus adquirido (3301) | Bônus adquirido a pagar aos motoristas (2103) |
| Pagamento em dinheiro | Bônus adquirido a pagar (2103) | Banco |

> Estes lançamentos são conceituais. O tratamento contábil definitivo depende de validação do contador.
