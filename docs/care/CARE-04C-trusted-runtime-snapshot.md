# CARE-04C — verificação runtime com dados reais, sem ativação

**Escopo desta etapa:** preparar a leitura centralizada para `DispatcherService` e `acceptOfferInternal`, reutilizando `evaluateCareEligibility` (CARE-03) e o modelo CARE-02. Nada de segundo dispatcher, segunda rota de aceite, duplicação de cadastros ou tabela de configuração paralela.

**Situação de produção:** o deploy #36449107975 foi cancelado, mas a task ECS de migração chegou a iniciar. Seu resultado final no RDS **não foi comprovado nesta etapa**. Não chamar `prisma migrate deploy` nem habilitar um caminho runtime que suponha a presença de `care_*` em produção.

## Contrato e dados

`backend/src/services/care/care-runtime-eligibility.ts` recebe:
- Cliente Prisma do backend, inclusive a mesma `Prisma.TransactionClient` utilizada pelo aceite, para permitir revalidação no contexto da transação oficial;
- IDs de corrida e motorista e horário corrente;
- evidências externas **derivadas de serviços confiáveis do backend**, nunca do cliente: autorização municipal, território e confirmação específica de cobertura CARE pelo segurador.

Busca os dados já persistidos em `rides_v2`, `care_trip_requirements`, `drivers`, `driver_status`, `care_driver_qualifications` e `care_vehicle_capabilities`. Usa exatamente a função CARE-03. Uma ausência, exceção da consulta, tabela ainda inexistente, status não operacional, placa divergente, documentação expirada, modo inconsistente, preço não confirmado ou gate externo ausente faz a decisão resultar em `eligible:false`.

`CARE_ASSISTED`, `CARE_FOLDING_WHEELCHAIR` e `CARE_ADAPTED_WHEELCHAIR` precisam corresponder exatamente ao modo de requisitos e a `ride_type=care`. Não inferir ou converter para `CAR_NORMAL`.

O motor não determina preço: exige que preço cotado e travado já sejam válidos antes de qualquer despacho ou aceite. O draft CARE-04B permanece intencionalmente sem preço e em `DRAFT`. A partir de hoje, não existe evidência de cobertura específica CARE conectada; portanto, o gate de seguro não pode ser afirmado como verdadeiro.

## O que está e não está conectado

A função é **somente leitura** e já aceita cliente transacional, mas esta PR **não a invoca nas rotas ou dispatcher**. Isso é proposital enquanto a auditoria da task ECS e a origem confiável dos três gates externos estiverem pendentes. O CARE-04A permanece como bloqueio incondicional de solicitações CARE (estimativa, criação, despacho e aceite). Não adicionar flag ambiental ou retorno positivo que contorne esse bloqueio.

O próximo incremento de integração no mesmo fluxo deverá:
1. Revisar a task de migração e o histórico real `_prisma_migrations`; confirmar schema/backup sem tentar nova execução.
2. Implementar fonte validada de cobertura para a modalidade e veículo, município e territorialidade a partir dos serviços oficiais KAVIAR; ausência = falso. Revisar se o seguro cobre os serviços efetivamente oferecidos.
3. No `findCandidates` do dispatcher existente, filtrar **antes do score** usando o adaptador e as fontes oficiais. Não permitir moto ou fallback de cadeira adaptada para carro convencional.
4. Imediatamente antes de criar oferta, revalidar elegibilidade e estado da corrida para reduzir janela de corrida; impedir idempotência de oferta insegura.
5. Dentro de `acceptOfferInternal` e de sua transação atual, reconsultar os mesmos dados, placa/validade e gates. Tratar concorrência no aceite e estado da oferta, sem wallet/checkout antes da confirmação.
6. Aplicar a mesma política em agendamento, cancelamento e redispatch que já passam pelo dispatcher oficial; não enviar mensagem de confirmação antes do aceite efetivo.
7. O aceite de ajuste de preço usa rota adicional existente e também necessita gate idêntico, sem criar nova rota.
8. Testar corrida convencional intacta, dados ausentes e vencidos, município sem regra confirmada, cobertura não confirmada e falhas de banco. Revisar LGPD e dados exibidos ao motorista.
9. Desbloqueio de produção e novos preços CARE exigem aprovação específica, após homologação real. Testes sintéticos não substituem verificação documental.

## Critérios

- 10 testes unitários sintéticos para consulta e rejeição; schema e typecheck backend.
- Não modifica `schema.prisma`, migrations, `rides_v2`, dispatcher, aceite, credenciais, financeiro, provedor externo nem a UI.
- Não executa CI com banco de produção; nenhuma migration ou deploy automático.
- PR inicialmente Draft; código preparado para ligação futura **sem fingir que a ligação já ocorreu**.
