# KAVIAR — WhatsApp: candidatura de Gestor (28/09/2026)

## Objetivo
Separar o convite genérico a novos gestores da confirmação enviada a quem já cadastrou interesse em `/gestor`.

- Prospecção: tipo `manager`, template e variável `TWILIO_WHATSAPP_TEMPLATE_MANAGER_SID` antigos, inalterados.
- Candidatura: tipo `manager_application`, template `kaviar_gestor_candidatura_v1`, Content SID aprovado `HX93d53081930b106c8e5b266174c7611e`.
- Configuração opcional: `TWILIO_WHATSAPP_TEMPLATE_MANAGER_APPLICATION_SID` substitui o SID padrão sem alteração de código; não há segredo no SID de template.
- Sem disparos automáticos de WhatsApp no cadastro público ou na implantação. SUPER_ADMIN deve abrir o CRM e confirmar cada envio.

## Fluxo do painel
1. CRM KAVIAR → entrada Gestor Territorial, origem Website → abrir cadastro.
2. `Enviar confirmação oficial` → revisar nome/número → `Confirmar e enviar via Twilio`.
3. Backend valida role SUPER_ADMIN, leadId real, tipo, origem, status e correspondência de telefone; nome e território vêm do CRM.
4. Log de envio em `whatsapp_invite_logs`, `source_screen=crm_manager_application`, `template_key=manager_application_confirmation`.
5. Proteção de 7 dias contra duplicados (sem bypass, mesmo para SUPER_ADMIN), limite diário, callback da Twilio para status.
6. Frontend tenta anotar interação de WhatsApp no CRM; se falhar, informa que o envio já foi feito, evitando reenvio. Status de candidatura/território nunca é aprovado automaticamente.
7. Acompanhar `queued/sent/delivered/read/failed` no relatório Central WhatsApp.

## Cuidados
- O botão anterior `WhatsApp Gestor (manual)` ainda abre o WhatsApp conectado localmente, NÃO usa o número Twilio.
- `Novo convite → Gestor` na Central permanece prospecção genérica.
- O novo texto confirma cadastro existente e coleta dados iniciais sem solicitar CPF/RG nem endereço completo.
- Antes de deploy: backend e frontend CI verdes, conferir Twilio template aprovado e callback configurado. Sem migração Prisma.
- Depois do deploy: validar a presença do botão em um cadastro de teste. Não enviar outra mensagem ao contato real sem autorização.
