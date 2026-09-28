# CARE-04A — Contenção central antes da integração real

Base: CARE-01 #415, CARE-02 #416 e CARE-03 #417.

## Decisão arquitetural — sem “Frankenstein”

A KAVIAR continuará com **um único** `rides_v2`, `DispatcherService` e `acceptOfferInternal`. CARE será uma modalidade com requisitos funcionais anexados de forma atômica à corrida, **não** um segundo aplicativo de despacho, rota WhatsApp paralela, preço fictício ou cadastro duplicado.

A inspeção do código identificou que `POST /api/rides-v2` aceita `service_category` e cria a corrida antes de enviar ao dispatcher. O frontend mobile desabilitado não protege clientes diretos da API, e o dispatcher atual ainda não está conectado aos requisitos CARE. O primeiro incremento da integração é, portanto, **negação explícita** de intenção CARE no backend existente.

## O que este PR entrega

Uma política central e puramente determinística `isUnsupportedCareIntent`, usada em:
- `POST /estimate`: não produz cotação convencional para CARE disfarçado.
- `POST /`: rejeita intenção CARE antes de idempotência, persistência e despacho, com HTTP 403 e código `CARE_SERVICE_NOT_AVAILABLE`.
- `DispatcherService.dispatchRide`: protege contra corridas legadas/importadas, cancela ofertas pendentes e encerra despacho com o status já existente `no_driver`; o log registra `CARE_DISPATCH_BLOCKED`. Não cria um novo dispatcher.
- `acceptOfferInternal`: impede aceitar uma oferta legada CARE antes de qualquer alteração de transação, reserva na carteira, preço ou notificação.
- `POST /:ride_id/adjustment-response`: protege a aceitação alternativa de ajuste de preço, que não passa por `acceptOfferInternal`, antes de gravar status ou settlement.

Reconhece nomes de categoria CARE legados/novos e **campos estruturados** de necessidades de mobilidade mesmo quando o cliente envia `CAR_NORMAL`. Não usa interpretação de texto livre: observações comuns não são fonte confiável de elegibilidade. O aplicativo real, posteriormente, terá formulário tipado que exige modalidade e necessidades explícitas.

## O que não faz

- Não ativa CARE; nenhuma flag libera o gate.
- Não executa migração do CARE-02 em produção.
- Não altera rotas reais de corridas convencionais, categoria moto, preços, gestores, carteiras, webhooks, faturamento, seguro, documentação municipal ou contratos.
- Não certifica motorista ou veículo e não aceita alegações do frontend sobre seguro.
- Não anuncia disponibilidade ou agendamento garantido.
- Não publica backend automaticamente.

O status `no_driver` é uma medida conservadora de encerramento de possível corrida legada indevida; é imperfeito semanticamente e precisa ser substituído por tratamento explícito de indisponibilidade antes do lançamento CARE. O usuário **não** é informado de uma disponibilidade que não existe.

## Arquitetura da integração real — próximo incremento CARE-04B

1. **Cadastro único e autorização de modalidade:** utilizar `drivers`, `care_driver_qualifications` e `care_vehicle_capabilities` da mesma base; revisores autorizados, motivo e expiração. Confirmação de seguro e documentação municipal vem de fonte confiável do backend.
2. **Contrato tipado no `rides-v2`:** validação de dados mínimos por modalidade; nenhum CID/diagnóstico/medicação. Criar `rides_v2` e `care_trip_requirements` na mesma transação. Não devolver id/confirmar reserva se a transação falhar.
3. **Preparar antes de publicar:** só emitir oferta após requisitos `READY`, preço adequado/confirmado e elegibilidade. Nenhum `setImmediate` antes da persistência.
4. **Um dispatcher:** encaixar `evaluateCareEligibility` na seleção atual de candidatos, preservando preferências, geofence, regras territoriais, modalidade municipal, estado online e crédito. Nenhum fallback para carro normal, moto ou motorista incompatível.
5. **Um aceite:** revalidar os mesmos gates com dados atuais dentro da transação de aceite. Não confiar em decisão anterior quando placa, habilitação, inspeção ou disponibilidade mudaram.
6. **Redispatch/retorno/agendamento:** exigir a mesma verificação e revalidação, inclusive nos jobs atuais, e oferecer suporte humano quando não houver recurso compatível.
7. **Logs e auditoria sem dados médicos:** registrar versão da política, resultado/códigos técnicos e vínculos de corrida; definir acesso/retenção.
8. **Ativação separada:** seguro, contratos, parceiros, testes em dispositivos e liberação municipal verificados; flag desativada até aprovação explícita.

## Critérios de revisão deste PR

- Um único detector usado nos pontos de entrada, despacho e nos dois caminhos de aceite; nenhum middleware paralelo.
- Testes cobrem categoria CARE, alias legado, intenção estruturada sob CAR_NORMAL e corridas normais/moto preservadas.
- Testes verificam ordem: bloquear antes de precificar/persistir/ofertar/aceitar.
- `npx tsc --noEmit -p tsconfig.build.json` e CI integrado aprovados.
- Nenhum deploy ou migração de produção.
