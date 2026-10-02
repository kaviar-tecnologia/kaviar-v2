# CARE-06C — Prêmio mensal em créditos promocionais (contrato de implementação)

**Decisão da direção: 29/09/2026. Estado: desenho documental, SEM implementação financeira/ativação.**
Vínculos: #434 (proveniência CARE), #436 (tarifa paritária), #437 (programa CARE-06C).
CARE-04A continua bloqueando toda operação CARE e qualquer lançamento público.

## 1. O que é e o que não é

O motorista que prestar atendimento CARE elegível acumula um **prêmio operacional** no mês civil de referência. Após fechamento e conferência, a KAVIAR concede créditos promocionais internos aplicáveis **somente à taxa da plataforma em futuras corridas**. Não há saque, transferência, PIX, dinheiro nem conversão na Gratificação Anual de Incentivo.

O passageiro paga a mesma tarifa (em centavos) da viagem comum comparável, sem qualquer acréscimo por idade, deficiência, saúde, mobilidade, cadeira de rodas, cão-guia, acompanhante necessário, assistência ou tempo de embarque/desembarque. O prêmio é integralmente custeado pela KAVIAR e **não** diminui remuneração do motorista por aquela corrida, comissão de Gestor elegível nem preço cobrado ao passageiro. Separar operacionalmente subsídio/crédito de recebimento real: crédito concedido pela KAVIAR não constitui novo ingresso de caixa.

**Este prêmio NÃO é a Gratificação Anual de Incentivo KAVIAR.** Sua concessão e consumo não geram gratificação anual de 10%; direitos já adquiridos no programa anual permanecem intactos. O regime de créditos, obrigações contratuais e classificação contábil depende de revisão jurídica e do contador antes de ativar.

## 2. Competência e origem

- Competência: mês civil em `America/Sao_Paulo`, pela data da conclusão confirmada no backend e pela versão de política em vigor.
- Base proposta: corrida CARE válida, concluída, com motorista elegível e atendimento comprovado. Valor-base por atendimento e eventual componente de tempo adicional **ainda não fixados**; nunca basear valores em diagnóstico ou gravidade da condição pessoal.
- Se houver componente de tempo, mensurar eventos reais do ciclo, com carimbo de servidor e prova do fim do desembarque assistido. `completed_at` isolado não comprova esse fim. Limite por corrida, teto por mês e controle de orçamento dependem de política aprovada; não permitir manipulação do relógio pelo app.
- Fechamento: relatório por motorista e por corrida, validação, contestação/reversão auditada e concessão atômica uma vez por `driver_id + competence_month + policy_version`. Preservar os `ride_id` e regra que compõem o total. Retentativas idempotentes; duplicações não podem gerar novos créditos.
- Corrida cancelada: não contabilizar como concluída. Atendimento comprovadamente realizado em operação cancelada requer regra separada, não presumir elegibilidade. Fraude/estorno afeta somente a concessão derivada, com trilha, sem confisco de outros valores legitimamente adquiridos.
- Sem inventar incentivo a partir de transações de teste ou lançar saldo em produção durante homologação.

## 3. Uma wallet, origens auditáveis

Conservar `driver_wallets` e `wallet_ledger` como estruturas econômicas atuais, sem wallet paralela e sem alterar preço em `ride_settlements`. Separar internamente o saldo disponível e reservado por origem, inclusive os centavos consumidos numa mesma taxa: `CARE_PROMO` e `EXISTING_ELIGIBLE_BALANCE` (identificar a fonte real e respeitar as regras originais de PURCHASED e outras campanhas). Uma única visão de saldo total **não** é evidência suficiente da origem. `creditRechargeBonus` atualmente deposita no saldo comum e **não pode ser reutilizado como atalho** para CARE-06C.

Política de consumo a validar: usar a parcela CARE_PROMO primeiro, em seguida saldo elegível existente, sempre apresentando as parcelas no extrato e preservando reservas e estornos por origem. Enquanto a regra de preferência não estiver aprovada e testada, não habilitar uso de CARE_PROMO. Não fazer conversão em dinheiro, uso em recarga/compra de crédito, retirada nem transferência.

O lançamento `fee_debit` ou `pending_resolve` deve carregar o valor efetivamente suportado por CARE_PROMO e a parcela das demais fontes, tanto para crédito quanto para débito/reversão. O cálculo da gratificação anual deve excluir **apenas os centavos pagos com CARE_PROMO** — inclusive nos caminhos parciais e de cobrança pendente — sem reduzir direito adquirido nem modificar retroativamente o tratamento de outras campanhas. Jamais gerar “bônus sobre bônus”.

## 4. Segurança monetária e reconhecimento contábil

- Inteiros em centavos (`bigint`), idempotência por emissão e consumo, lock/concorrência, reserva/liberação e reversão atômicos. Total = soma de componentes por origem.
- `ride_settlements`, `ride_fee_splits` e a taxa oficial de 18% não são reescritos por CARE-06C. Paridade de tarifa do CARE-06B é gate independente. A KAVIAR financia os créditos com sua parcela econômica/orçamento, não apropriando os 40% da taxa devidos ao Gestor elegível.
- Contabilidade deve revisar o momento do reconhecimento da obrigação promocional, concessão, resgate, desconto/subsídio e saldo não usado. Não registrar crédito promocional como recarga Pix real; não reconhecer receita fictícia ou duplicada.
- Tratamento da saída/desativação do motorista, termo promocional, validade, fiscalização do incentivo e obrigações legais dependem de revisão jurídica/contábil. Nenhuma expiração ou confisco automático é autorizada por este documento.
- Não gravar diagnóstico, condição clínica ou dado sensível nos lançamentos financeiros; referenciar apenas a operação e política aplicável.

## 5. Matriz de homologação — PostgreSQL descartável

1. Um mês com várias corridas elegíveis => relatório verificável e uma concessão; replay => mesmo evento sem saldo adicional.
2. Corrida cancelada, ilegítima, duplicada e parcialmente atendida => negativa por padrão ou revisão específica documentada.
3. Origem separada: CARE_PROMO + saldo existente => reserva e débito exibem cada parcela; saldo total/ledger conciliam.
4. Taxa integralmente CARE_PROMO => zero nova gratificação anual. Taxa integralmente elegível existente => gratificação anterior intacta; mistura => base anual exclui exatamente a parcela CARE_PROMO.
5. `pending_debits`, cobranças parciais, replays, falhas entre etapas, estorno e concorrência => origem preservada, sem valor negativo e sem bônus duplicado.
6. Gestor plenamente elegível => comissão contratual preservada e custo do prêmio imputado à KAVIAR; gestor inelegível segue regra oficial vigente sem inventar participação.
7. Corridas convencionais, MOTO, Premium, SumUp, Asaas, bônus anual e contratos administrativos => nenhuma regressão.
8. CARE-04A => todas as rotas CARE públicas continuam negadas, sem compra, dispatch, cobrança ou concessão real.

## 6. Ordem e autorização

A. Contrato read-only de cálculo e fechamento mensal; B. proveniência nas estruturas atuais da wallet e testes isolados; C. composição segura com o bônus anual; D. contabilidade, extrato e emissão sob política aprovada.

**Dependências abertas:** valor-base, eventual fórmula por tempo e tetos, política de consumo, orçamento, contrato/contador e tratamento de saldo não utilizado. O fechamento deste documento não autoriza lançamento de crédito real, mudança de flags, workers, migração em produção ou deploy. Merge em `main` e release CARE exigem revisão e autorização separadas.
