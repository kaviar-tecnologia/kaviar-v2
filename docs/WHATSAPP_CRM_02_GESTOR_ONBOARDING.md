# WhatsApp CRM-02 — Aprovação da candidatura e preparação cadastral

## Objetivo
Separar a aprovação da candidatura da criação/ativação operacional da Gestora Territorial. O botão **Iniciar cadastro da gestora aprovada** não é uma liberação de acesso, contrato, assignment ou participação financeira.

## Fluxo administrativo
1. SUPER_ADMIN analisa candidatura original e resposta oficial na Central WhatsApp.
2. Registra a decisão **Avançar para a próxima etapa** (status INTERESTED), com justificativa. Isto não equivale à aprovação para atuação.
3. O card, somente quando a última decisão for ADVANCE e o status continuar INTERESTED, exibe **Iniciar cadastro da gestora aprovada**.
4. A confirmação seguinte exige justificativa própria e prepara, obrigatoriamente, o aviso de aprovação; servidor valida o último evento DECISION e a versão do cadastro no momento da gravação.
5. A decisão `APPROVE_ONBOARDING` fica no histórico; o CRM passa a WAITING_DOCUMENTS com ação pendente para conferência de dados, território, documentos e contrato v1.2. Não é criada conta administrativa por este botão.
6. O administrador revisa e copia o aviso; abre a conversa oficial e **envia manualmente**. A existência do texto preparado não é prova de entrega. O card conserva o lembrete de envio não confirmado.
7. A criação de conta, definição de território, documentação, contrato e ativação operacional permanecem no fluxo administrativo separado. Nunca criar outra conta sem conferir e-mail e eventual registro existente.

## Texto-base do aviso de aprovação
"Olá, [nome]! Sua candidatura à função de Gestor Territorial KAVIAR foi aprovada para a etapa de cadastro. Estamos preparando seu cadastro e entraremos em contato para conferir os dados, a documentação e o contrato. O acesso e a atuação dependem da conclusão dessas etapas. Equipe KAVIAR."

**Importante:** aprovação para cadastro não é ativação como Gestor, promessa de comissão ou liberação de pagamentos. Mensagens livres só dentro da janela de atendimento WhatsApp; fora dela, usar um template específico previamente aprovado. Nenhum clique de decisão invoca Twilio.

## Integridade e privacidade
- Reutiliza `crm_leads` e `crm_interactions`. Sem migração Prisma.
- Requer SUPER_ADMIN; não usa CPF, WhatsApp pessoal, associação por sufixo ou contas fictícias.
- Rejeita candidatura sem decisão atual ADVANCE, status diferente de INTERESTED, opção de aviso desativada e versão desatualizada.
- A transação grava status, próxima ação e evento de decisão juntos, sem cadastrar conta.
- A etapa é reversível administrativamente por decisão posterior, sem conceder automaticamente poderes operacionais.
- Testes de API/UI verificam elegibilidade, restrição de acesso, mensagem manual e ausência de envio automático.
