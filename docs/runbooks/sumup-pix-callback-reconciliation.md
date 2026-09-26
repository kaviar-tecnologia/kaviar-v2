# SumUp Pix — callback nativo e reconciliação de recargas (PR 1)

## Escopo
Fluxo somente de entrada no saldo do motorista. Nenhum payout Asaas, transferência, ativação de provider ou migration neste PR.

A SumUp envia POST com `{ "event_type": "CHECKOUT_STATUS_CHANGED", "id": "<checkout_id>" }`
para o `return_url` informado na criação de cada checkout. Esse POST é **uma notificação não confiável**,
não uma autorização para conceder saldo. Documentação: https://developer.sumup.com/online-payments/webhooks

## Configuração (sem ativar automaticamente)
- `SUMUP_ENABLED=false` permanece sob controle operacional preexistente.
- `SUMUP_CHECKOUT_CALLBACK_URL=` permanece vazio até aprovação de ativação.
  Valor esperado após configuração HTTPS/routing:
  `https://api.kaviar.com.br/api/webhooks/sumup/callback`.
- `SUMUP_RECONCILE_SCHEDULER_ENABLED=false` permanece por padrão. Para usar callback em produção,
  configurar **também** o scheduler de recuperação (`true`) na task definition ECS:
  ele consulta as recargas pendentes com `external_id` e tem lock de banco.
- `SUMUP_RECONCILE_INTERVAL_MS=300000` / `SUMUP_RECONCILE_BATCH_LIMIT=20` ajustáveis.
- Segredos `SUMUP_API_KEY` e `SUMUP_MERCHANT_CODE` só em secrets/env gerenciados. Nunca no Git.
- `SUMUP_WEBHOOK_TOKEN` protege **somente** o endpoint interno legado
  `POST /api/webhooks/sumup`; SumUp não envia esse header automaticamente.
- `SUMUP_RECONCILE_TOKEN` protege `POST /api/webhooks/sumup/reconcile`.

## Comportamento
1. A rota de recarga cria `wallet_recharges` pendente, monta referência `wallet_v2:<id>` e
   chama SumUp com `return_url` apenas se explicitamente configurada.
2. O endpoint nativo `/api/webhooks/sumup/callback` aceita somente IDs seguros; ignora
   eventos desconhecidos, limita requisições e responde 204 rapidamente.
3. O callback consulta SumUp via API autenticada (fora da resposta HTTP).
4. Antes do crédito, comparar `id`, `checkout_reference`, `merchant_code`,
   `currency=BRL` e `amount` em centavos com o registro local **travado** no PostgreSQL.
5. `PAID` válido: Wallet creditada e recarga confirmada na mesma transação.
   Repetição ou concorrência não deve gerar novo crédito.
6. `FAILED`, `EXPIRED`, `CANCELLED` retornados pela API: expiração.
   `PENDING`/erro/divergência: sem crédito; manter pendente para análise/retentativa.
7. Não expirar localmente recargas antigas com checkout conhecido: um Pix pode ter sido pago
   mesmo quando o webhook falhou. O scheduler deve reconectar essas operações.

## Checklist antes de habilitar em produção
- [ ] Validar o método Pix disponível no merchant e os campos reais do GET checkout.
- [ ] Validar credenciais/merchant esperados no secret de produção.
- [ ] Validar HTTPS, POST e retorno 204 do callback no domínio público.
- [ ] Rodar testes unitários de SumUp + rotas + reconciliação + caracterização.
- [ ] Rodar fluxo E2E em banco local/teste: pendente, PAID, duplicado, valores e merchant divergentes,
  expiração confirmada, falha API, callback perdido e recuperação por scheduler.
- [ ] Garantir que `SUMUP_RECONCILE_SCHEDULER_ENABLED=true` esteja implantado e funcionando
  antes de informar a callback URL às novas cobranças; monitorar métricas/erros.
- [ ] Validar callback real com um checkout de teste controlado antes de tráfego geral.
- [ ] Conferir que o ledger separa recarga/passivo, taxa do provedor e receita própria;
  este PR não implementa classificação contábil adicional.
- [ ] Asaas outbound e todos os flags de payout continuam DESATIVADOS.

## Segurança
Não usar o POST como fonte da verdade; não colocar token na URL pública.
Webhooks podem ser repetidos e perdidos. Callback sem resposta durável própria depende da
recarga já persistida + scheduler habilitado: sem o scheduler, não ativar a callback em produção.
