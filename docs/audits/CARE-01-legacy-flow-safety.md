# CARE-01 — Auditoria e contenção dos fluxos legados

Data de referência: 28/09/2026. Base auditada: `main` em `e52537dcc1d8c321d4de7c401de4f2c4ca35ab59`.
Escopo: revisão estática do repositório. Não equivale a inspeção do banco de produção, verificação de seguro ou teste real de contratação/embarque.

## Resultado e decisão de segurança

**Não habilitar CARE como categoria operacional no aplicativo ou no dispatcher nesta etapa.**
O frontend web legado simula solicitação, preço, motorista, status e avaliação sem acionar o backend de corridas. O novo bloqueio atua *fail-closed*: demonstrações somente em ambiente de desenvolvimento com `VITE_LEGACY_RIDE_DEMO_ENABLED=true`. O build de produção não pode ativá-las, mesmo que a variável seja configurada por engano. O usuário vê uma página informativa e um canal de consulta, nunca uma confirmação automática.

## Mapa de evidências

| Superfície | Evidência no repositório | Estado auditado / providência |
| --- | --- | --- |
| Web legado / solicitação | `frontend-app/src/contexts/RideContext.jsx`, `pages/passenger/Home.jsx` | Motoristas, preço e transições simulados. CARE e outras opções utilizavam o mesmo contexto. Bloqueio em produção no CARE-01. |
| Web legado / emergência | `pages/passenger/Home.jsx` | Handler afirmava falsamente envio de alerta; removido do formulário de demonstração. Não substituir por alerta real sem integração verificada. |
| Web legado / canais externos | `pages/passenger/Home.jsx` | Mensagem WhatsApp pré-preenchia origem, destino e observações livres. CARE-01 limita o pré-preenchimento a consulta genérica; não implica reserva. |
| Web legado / navegação | `components/passenger/PassengerApp.jsx`, `pages/passenger/RideStatus.jsx`, `pages/passenger/RideRating.jsx` | Dashboard anunciava status em tempo real e avaliação, embora use `RideContext` simulado. CARE-01 rotula dashboard e desabilita atalhos de status/avaliação no build de produção. |
| Mobile passageiro | `src/components/passenger/ServiceSelector.tsx` | Card CARE é `DisabledCard` com texto “Em implantação.”; não habilitar prematuramente. |
| Backend de corridas | `backend/src/routes/rides-v2.ts` | Fluxo real usa `service_category`, `trip_details` e `scheduled_for`; não existe contrato CARE estruturado verificado neste caminho. Agendamento limita período de 15 minutos a 24 horas. |
| Dispatcher | `backend/src/services/dispatcher.service.ts` | Filtra regras territoriais, localização, modalidade municipal e motos. Não há validação CARE de equipamentos/transferência/habilitação integrada; bloquear ofertas CARE até introduzir regras *fail-closed*. Avaliar separadamente filtro explícito de CAR em categorias de carro. |
| Redispatch | `backend/src/routes/rides-v2.ts` (`driver-cancel`) | Reabre corrida, limpa motorista, registra razão no log e dispara nova busca, mas não há revalidação CARE ou trilha estruturada de motivo. |
| Agendamento | `backend/src/jobs/scheduled-dispatch.job.ts` | Há job para avisar ~15 minutos antes e despachar ~10 minutos antes. Uma corrida agendada não implica veículo previamente reservado. |
| Dados de idosos | `backend/prisma/schema.prisma` (`elderly_profiles`, `elderly_contracts`) | Estrutura legada inclui `medical_notes` e `careLevel`; não reutilizar como prontuário, revisar LGPD e retenção. |
| Admin de idosos | `frontend-app/src/pages/admin/ElderlyManagement.jsx` | Botão “Novo Contrato” é placeholder; chamadas para `/api/admin/elderly/contracts` não foram localizadas como rota correspondente na listagem estática de `backend/src/routes`. Verificar roteamento/serviço implantado antes de declarar operacional. |
| Serviços especiais legados | `docs/special-services-system.md`, `docs/critical-fixes-summary.md` | Documentos divergem sobre `POST /api/v1/special-services/rides` (documentado versus descontinuado); não usar documentação antiga como prova de integração atual. |
| Financeiro e seguros | Sistema financeiro e módulos de seguro atuais | Nenhuma ativação de cobrança, repasse, preço CARE ou cobertura é parte deste PR. Necessária validação documental antes do piloto. |

## Matriz de risco e contenção

1. **Crítico — corrida fictícia apresentada como real:** bloqueio do contexto e UI de produção, mensagens explícitas na demonstração.
2. **Crítico — falsa confirmação de emergência:** botão enganoso removido da página legada; serviço de emergência real não foi implementado.
3. **Crítico — atribuição de transporte adaptado a veículo inadequado:** CARE indisponível até criar verificação de veículo/equipamentos/motorista no dispatcher **e no aceite**.
4. **Alto — vazamento de dados de saúde:** remover observações e endereços do WhatsApp automático; antes do CARE operacional, definir dados mínimos, papéis e retenção.
5. **Alto — falta de capacidade/seguro/credenciamento:** não apresentar “disponível” sem validações humanas e documentais.
6. **Alto — cancelamento e redispatch inadequados:** revalidar requisitos em toda nova oferta; trilha de evento estruturada e acompanhamento humano.
7. **Alto — regras territoriais ou preços alterados de forma acidental:** manter dispatcher, pricing, gestor, wallet e pagamentos inalterados nesta etapa.

## Alterações efetivas no CARE-01

- Política isolada `canRunLegacyRideDemo`: execução apenas em DEV e com opt-in explícito.
- Defesa no contexto de corrida, impedindo `requestRide` e `rateRide` fictícios em produção.
- Web: substituição do CTA fictício por aviso informativo CARE; opção de consulta WhatsApp com texto genérico e sem pré-preencher saúde/endereço.
- Dashboard web: explica condição legada e desabilita atalhos fictícios de status/avaliação fora da demonstração.
- Retirada do botão web que alegava falsamente acionar emergência.
- Testes de regressão estáticos e da política de gating.

## Não realizados / fora de escopo

- Nenhuma alteração em produção, ECS, RDS, Prisma, workers, flags reais de CARE, preços, carteira, SumUp, Asaas ou seguro.
- Nenhuma abertura de modalidade CARE, contratação de profissional ou promessa de veículo adaptado.
- Nenhuma validação presencial de acessibilidade, conformidade documental ou rota de administração de idosos em runtime.

## Próximos trabalhos com critérios de aceite

**CARE-02 — Especificação e dados mínimos:** separar transporte de acompanhamento; requisitos por viagem sem diagnósticos; bases legais, retenção, autorização para familiares, evidência da regularização municipal/seguro. Não inserir dados financeiros fictícios.

**CARE-03 — Elegibilidade do veículo/motorista:** matrícula do equipamento/adequação, documento válido, capacidade, treinamento, limites da assistência; validação fail-closed em despacho e aceite.

**CARE-04 — Fluxo operacional real:** app passageiro/motorista ligado à API `rides_v2`, exibição clara de solicitação versus confirmação, cancelamentos auditáveis, redispatch compatível, centro de atendimento, testes E2E e de acessibilidade.

**Piloto:** somente depois de condições documentais, teste em dispositivo real, treinamentos, seguro e monitoramento humano. Ativação em produção exige aprovação específica.
