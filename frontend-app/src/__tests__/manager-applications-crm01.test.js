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
