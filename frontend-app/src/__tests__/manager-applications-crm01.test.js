/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const page = readFileSync(resolve(__dirname, '../pages/admin/ManagerApplicationsPanel.jsx'), 'utf8');
const crm = readFileSync(resolve(__dirname, '../pages/admin/CrmPage.jsx'), 'utf8');
const central = readFileSync(resolve(__dirname, '../pages/admin/WhatsAppCentral.jsx'), 'utf8');

describe('WhatsApp CRM-01 manager application UI contracts', () => {
  it('surfaces a dedicated candidate inbox with unread responses and manual refresh', () => {
    expect(crm).toContain('Candidaturas de Gestores');
    expect(crm).toContain('<ManagerApplicationsPanel');
    expect(page).toContain('/api/admin/crm/manager-applications');
    expect(page).toContain('conversation?.unreadCount');
    expect(page).toContain('setInterval(() => reload(true), 15000)');
    expect(page).toContain('Somente não lidas');
  });

  it('presents a decision button with justification and an explicit confirmation', () => {
    expect(page).toContain('Registrar decisão');
    expect(page).toContain('Justificativa obrigatória');
    expect(page).toContain('justification.trim().length < 10');
    expect(page).toContain('Confirmar decisão');
    expect(page).toContain('expectedUpdatedAt: selected.lead.updated_at');
    expect(page).toContain('Histórico de decisões');
  });

  it('renders all four decisions directly as accessible, visible buttons', () => {
    expect(page).toContain('Escolha uma decisão:');
    expect(page).toContain('role="group" aria-labelledby="manager-decision-options-label"');
    expect(page).toContain('OUTCOMES.map(option => {');
    expect(page).toContain('aria-pressed={chosen}');
    expect(page).toContain('onClick={() => setOutcome(option.value)}');
    expect(page).toContain('Avançar para a próxima etapa');
    expect(page).toContain('Solicitar informações adicionais');
    expect(page).toContain('Manter em análise');
    expect(page).toContain('Não prosseguir');
    expect(page).not.toContain('<Select labelId="manager-decision-label"');
  });

  it('keeps borders, justification and confirmation readable on the dark dialog', () => {
    expect(page).toContain("border: `2px solid ${chosen ? GOLD : '#8195AB'}`");
    expect(page).toContain("'&.Mui-focusVisible': { outline: '3px solid #F5D76E'");
    expect(page).toContain("'& .MuiOutlinedInput-root'");
    expect(page).toContain("'& .MuiFormHelperText-root': { color: MUTED");
    expect(page).toContain("'&.Mui-disabled': { bgcolor: '#283542', color: '#CBD5E1'");
    expect(page).toContain('disabled={submitting || !outcome || justification.trim().length < 10}');
  });

  it('only starts approved onboarding after the last explicit ADVANCE decision', () => {
    expect(page).toContain("item.lastDecision?.outcome === 'ADVANCE' && lead.status === 'INTERESTED'");
    expect(page).toContain('Iniciar cadastro da gestora aprovada');
    expect(page).toContain("setOutcome('APPROVE_ONBOARDING')");
    expect(page).toContain("setCommunicationRequested(true)");
    expect(page).toContain("outcome === 'APPROVE_ONBOARDING'");
    expect(page).toContain('Confirmar início do cadastro');
    expect(page).toContain('Não cria conta, não ativa Gestor, contrato, pagamentos nem território.');
  });

  it('prepares approval notice for human review, never dispatches by itself', () => {
    expect(page).toContain('Revisar aviso de aprovação para WhatsApp');
    expect(page).toContain("officialMessage(item.lead, 'APPROVE_ONBOARDING')");
    expect(page).toContain('O aviso de aprovação ainda depende de envio manual na Central');
    expect(page).toContain('Estamos preparando seu cadastro');
    expect(page).toContain('O acesso e a atuação dependem da conclusão dessas etapas');
    expect(page).toContain('Nenhuma mensagem foi enviada automaticamente');
    expect(page).not.toContain('/api/admin/whatsapp/conversations/send');
  });

  it('makes official communication optional and never sends from the decision action', () => {
    expect(page).toContain('communicationRequested');
    expect(page).toContain('Nenhuma mensagem foi enviada automaticamente');
    expect(page).toContain('Copiar texto');
    expect(page).toContain('Abrir conversa oficial');
    expect(page).toContain('/admin/whatsapp?conversation=');
    expect(central).toContain("new URLSearchParams(window.location.search).get('conversation')");
    expect(page).not.toContain('/api/admin/whatsapp/conversations/send');
  });

  it('does not activate a manager or automatically assign a territory', () => {
    expect(page).toContain('Não ativa Gestor, contrato, pagamentos nem território');
    expect(page).toContain("disabled={lead.status === 'ACTIVE'}");
    expect(page).toContain("item.linkStatus === 'review'");
  });
});
