# WhatsApp CRM-01 — Gestão de candidaturas territoriais

Data: 28/09/2026. Este PR é uma melhoria do CRM; NÃO é liberação automática de Gestores.

## Fluxo
1. O cadastro público `/gestor` é preservado em `crm_leads` (tipo `TERRITORIAL_MANAGER`, origem `WEBSITE`).
2. A confirmação oficial existente via Twilio `manager_application` permanece manual e separada do convite genérico `manager`.
3. No webhook de entrada, um contato só é reconhecido como candidato Gestor quando existe **uma única** candidatura Website com o número brasileiro completo e um registro prévio de envio oficial `manager_application` para esse número. Não usar os 9 últimos dígitos para associação automática.
4. A Central WhatsApp mantém o armazenamento `wa_conversations`/`wa_messages`. O novo painel `CRM → Candidaturas de Gestores` apresenta somente uma visão vinculada e as mensagens não lidas. Abrir o painel não marca a conversa como lida.
5. Quando houver dois candidatos possíveis, ou a conversa já estiver vinculada a outra entidade, sinalizar conferência. O lead manual de Ponto de Apoio jamais substitui a candidatura original.
6. `Registrar decisão` exige SUPER_ADMIN, opção e justificativa (10–2000 caracteres). Cria `crm_interactions.event_type=DECISION` com metadados e histórico, atualizando o status do lead de forma atômica e com verificação de versão (`updated_at`).
7. Opções: avançar → INTERESTED; solicitar informações → CONTACTED; manter em análise → status anterior; não prosseguir → REJECTED. Nenhuma opção cria operador, habilita contrato, atribui território, ativa pagamentos ou marca o lead como ACTIVE.
8. Comunicação opcional é **preparação**, não disparo. O administrador revisa/copia o texto e abre a conversa oficial na Central para confirmar manualmente o envio. Texto livre depende da janela de atendimento de WhatsApp; fora dela será necessário template específico aprovado. Salvar decisão não usa a API Twilio.

## Dados e migração
- Reaproveita tabelas atuais `crm_leads`, `crm_interactions`, `wa_conversations`, `wa_messages`, `whatsapp_invite_logs`.
- Sem migração Prisma. Não duplica a mensagem recebida em notas do CRM. A justificativa e as decisões anteriores são preservadas como eventos.
- O painel é restrito a SUPER_ADMIN. A Central mantém suas regras de acesso territorial.

## Validação pré-deploy
- Workflow `WhatsApp CRM-01 CI`: TypeScript, testes de decisão e matching, regressão do envio oficial, UI e build.
- **Gate de segurança:** o webhook de entrada agora valida a assinatura Twilio em produção. Verificar na Twilio a URL pública EXATA do inbound; se diferente de `https://api.kaviar.com.br/webhooks/twilio/whatsapp`, definir `TWILIO_WHATSAPP_INBOUND_WEBHOOK_URL` com o endereço completo. Ausência de token, URL HTTPS ou assinatura válida causa 403; não publicar sem confirmação dessa configuração.
- A persistência de mensagem e os contadores ocorrem numa transação. Falha retorna 503 para retry; `MessageSid` previamente armazenado retorna 200 sem duplicar a mensagem. Testar com payload assinado em ambiente controlado, nunca com o número real de uma candidata.
- Testar em ambiente controlado um `MessageSid` de entrada duplicado, erro temporário de persistência e atualização de não lidas.
- Não usar o número de Anna Julia para testes nem enviar mensagem sem nova autorização.
- Após deploy, inspecionar um card e histórico reais em modo leitura antes de registrar qualquer nova decisão.
