# Homologação integrada financeira — SumUp (entrada) / Asaas (saída)

## Escopo deste PR
Somente alterações em código e testes de CI, com provedores simulados. Não usa credenciais
de produção, não cria checkout real, não faz transferência Pix, não executa deploy, não
liga flags nem cria migration. Não equivale a homologação externa concluída.

## Separação obrigatória dos valores
- **SumUp**: checkout de recarga `PAID` vinculado a `wallet_v2:<recharge_id>`,
  comerciante, BRL e centavos exatos. A transação local confirma uma única vez
  `wallet_recharges` e faz crédito idempotente no `wallet_ledger`. Crédito de
  carteira representa obrigação da plataforma; NÃO representa liquidez da Asaas.
- **Asaas**: saldo para saída vem exclusivamente do GET autenticado de saldo
  do provedor com moeda BRL. A soma das obrigações financeiras é registrada
  separadamente. Não calcular capacidade de pagamento pela soma das recargas
  confirmadas, pelo saldo das carteiras nem pelos créditos pendentes.
- **Entre provedores**: transferência de tesouraria, liquidação bancária, taxas,
  estornos e reconhecimento de receita/obrigações exigem lançamento e
  conciliação próprios. Não existe repasse automático SumUp → Asaas neste PR.
  Somente contar com saldo Asaas efetivamente verificado.

## Critérios no CI (ambiente de teste isolado)
1. Checkout SumUp `PAID` compatível credita a carteira apenas uma vez;
   duplicado não repete crédito, divergência de valor/merchant bloqueia.
2. Pagamento outbound com flags desligadas não seleciona outbox e não executa POST.
3. Um valor confirmado na SumUp e a obrigação de carteira **não aumentam** o
   saldo mostrado como Asaas; provedor com saldo zero gera déficit real.
4. Falha de GET do saldo, disponibilidade negativa, moeda incorreta ou valor
   inválido tornam o saldo Asaas **indisponível**, nunca falso R$ 0,00.
5. Confirmação manual de titularidade não substitui GET autenticado com PJ,
   CNPJ, status APPROVED e capacidade de transferência confirmada.
6. Após POST Asaas, HTTP 400/422/500, timeout ou conexão interrompida são
   tratados como resultado potencialmente ambíguo; conciliar antes de liberar
   reserva ou tentar de novo. Falha local anterior ao POST é distinta.
7. Duplicidade de referência na outbox ou estado terminal já atingido não
   provoca novo POST nem regressão de pagamento concluído.
8. Webhook assinado por token e retorno GET vinculados a identificador,
   referência e valor; eventos repetidos, atrasados ou sem pagamento associado
   não creditam/descontam novamente.
9. Typecheck, regressões das rotas e Playwright devem permanecer verdes.

## Fases posteriores — NÃO executadas aqui
1. Aprovar separadamente publicação de código no backend. Revalidar task
   definition e ambiente antes de qualquer alteração em produção.
2. Em ambiente isolado, credenciais **sandbox** verificadas e contas da
   empresa corretas, exercitar cenários de sucesso, duplicidade, atraso,
   falha de rede e reconciliação. Não usar dados pessoais reais de terceiros.
3. Conferir extratos dos dois provedores versus carteiras, obrigações,
   reservas, taxas, estornos e conciliação bancária com o financeiro.
4. Registrar autorização operacional específica para um teste real de
   baixo valor, com limites, destinatário controlado e comprovante.
5. Só após aprovação separada para **ativação**, habilitar gradualmente
   flags de callback/reconciliação e, em fase própria, saídas Asaas.
   Enquanto isso, manter por padrão:
   - `SUMUP_RECONCILE_SCHEDULER_ENABLED=false` e callback URL não configurado;
   - `OUTBOUND_PAYMENTS_ENABLED=false`;
   - `OUTBOUND_PAYMENT_WORKER_ENABLED=false`;
   - `OUTBOUND_PROVIDER_EVENT_WORKER_ENABLED=false`;
   - todos os flags individuais de pagamentos de saída desligados.

Se qualquer observação externa não puder ser validada, registrar pendência e
**não liberar** saldo, reserva, repasse nem pagamento por inferência.
