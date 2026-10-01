/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const crm = readFileSync(resolve(__dirname, '../pages/admin/CrmPage.jsx'), 'utf8');
const central = readFileSync(resolve(__dirname, '../pages/admin/WhatsAppCentral.jsx'), 'utf8');

describe('CRM manager application confirmation flow', () => {
  it('offers the official Twilio action only to super admin for a website manager application', () => {
    expect(crm).toContain("isSuperAdmin && selectedLead.lead_type === 'TERRITORIAL_MANAGER' && selectedLead.source === 'WEBSITE'");
    expect(crm).toContain('Enviar questionário inicial oficial');
    expect(crm).toContain('setApplicationInviteOpen(true)');
    expect(crm).toContain('Confirmar e enviar via Twilio');
  });

  it('requires an explicit confirmation and sends the CRM lead ID and its phone', () => {
    expect(crm).toContain("type: 'manager_application', leadId: selectedLead.id, phone: selectedLead.phone, force: false");
    expect(crm).toContain("setApplicationInviteOpen(false)");
    expect(crm).toContain("event_type: 'WHATSAPP'");
  });

  it('shows duplicate warning rather than triggering a second automatic send', () => {
    expect(crm).toContain("data.code === 'DUPLICATE_INVITE'");
    expect(crm).toContain('Não reenvie');
    expect(crm).toContain('applicationInviteSending');
  });

  it('retains the manual WhatsApp link and prospect invitation in the Central', () => {
    expect(crm).toContain('WhatsApp pessoal/manual');
    expect(central).toContain('Abrir WhatsApp manual');
    expect(central).toContain('Enviar convite oficial via Twilio');
    expect(central).toContain('Novo convite');
    expect(central).toContain('manager');
  });
});
