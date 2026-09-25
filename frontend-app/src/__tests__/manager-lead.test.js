/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const page = readFileSync(resolve(__dirname, '../pages/ManagerLeadPage.jsx'), 'utf8');
const app = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8');
const landing = readFileSync(resolve(__dirname, '../pages/KaviarLanding.jsx'), 'utf8');
const invite = readFileSync(resolve(__dirname, '../utils/whatsappInvite.js'), 'utf8');
const crm = readFileSync(resolve(__dirname, '../pages/admin/CrmPage.jsx'), 'utf8');

describe('public manager application flow', () => {
  it('registers the public /gestor route', () => {
    expect(app).toContain('ManagerLeadPage');
    expect(app).toContain('path="/gestor"');
  });

  it('posts the application to the public CRM endpoint', () => {
    expect(page).toContain('/api/public/manager-lead');
    expect(page).toContain("method: 'POST'");
  });

  it('collects name, WhatsApp, email, city, UF and optional message', () => {
    ['Nome completo', 'WhatsApp', 'E-mail', 'Cidade de interesse', 'UF', 'Conte um pouco'].forEach((label) => {
      expect(page).toContain(label);
    });
  });

  it('warns that application is not automatic activation or exclusivity', () => {
    expect(page).toContain('não garante seleção');
    expect(page).toContain('exclusividade');
    expect(page).toContain('ativação financeira');
  });

  it('landing manager CTAs go to /gestor instead of the panels section', () => {
    const managerMatches = landing.match(/Quero ser gestor KAVIAR/g) || [];
    expect(managerMatches.length).toBeGreaterThanOrEqual(2);
    expect(landing).toContain('<Button href="/gestor" sx={buttonManager}>');
    expect(landing).toContain('<Button href="/gestor" sx={buttonGold}>');
  });

  it('WhatsApp manager invitation points to the public application page', () => {
    expect(invite).toContain("MANAGER_INVITE_URL = 'https://kaviar.com.br/gestor'");
    expect(invite).not.toContain("MANAGER_INVITE_URL = 'https://kaviar.com.br/#gestor'");
  });

  it('CRM uses a dedicated manager WhatsApp action for territorial manager leads', () => {
    expect(invite).toContain('openManagerWhatsAppInvite');
    expect(crm).toContain("lead.lead_type === 'TERRITORIAL_MANAGER'");
    expect(crm).toContain("return 'manager'");
    expect(crm).toContain('WhatsApp Gestor');
    expect(crm).toContain("selectedLead.lead_type === 'TERRITORIAL_MANAGER'");
  });

  it('CRM hides the secondary driver/passenger action for manager leads', () => {
    expect(crm).toContain("if (primaryInvite === 'manager') return null");
    expect(crm).toContain('{secondaryInvite && (');
    expect(crm).toContain('getLeadSecondaryInvite(menuLead)');
  });

  it('CRM shows the lead source explicitly in the detail drawer', () => {
    expect(crm).toContain('Origem:');
    expect(crm).toContain('SOURCES.find(s => s.value === selectedLead.source)');
  });
});
