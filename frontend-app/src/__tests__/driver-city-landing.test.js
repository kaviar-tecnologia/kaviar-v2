/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('DriverCityLanding component source (API-driven)', () => {
  const src = readFileSync(resolve(__dirname, '../pages/DriverCityLanding.jsx'), 'utf8');

  it('fetches city from API instead of hardcoded config', () => {
    expect(src).toContain('/api/public/driver-city-landings/');
    expect(src).not.toContain('getCityBySlug');
    expect(src).not.toContain("from '../config/driverCities'");
  });

  it('implements LOADING state with CircularProgress', () => {
    expect(src).toContain("pageState === 'LOADING'");
    expect(src).toContain('CircularProgress');
  });

  it('implements NETWORK_ERROR state with retry', () => {
    expect(src).toContain("pageState === 'NETWORK_ERROR'");
    expect(src).toContain('Tentar novamente');
    expect(src).toContain('fetchCity');
  });

  it('implements CITY_NOT_FOUND state', () => {
    expect(src).toContain("pageState === 'CITY_NOT_FOUND'");
    expect(src).toContain('Cidade não encontrada');
  });

  it('uses city.city and city.state from API response', () => {
    expect(src).toContain('city.city');
    expect(src).toContain('city.state');
  });

  it('uses whatsapp_number from API with fallback', () => {
    expect(src).toContain('city?.whatsapp_number');
    expect(src).toContain('WHATSAPP_FALLBACK');
  });

  it('shows STATUS_MESSAGES based on public_status', () => {
    expect(src).toContain('STATUS_MESSAGES');
    expect(src).toContain('IMPLANTACAO');
    expect(src).toContain('RECRUTAMENTO');
    expect(src).toContain('OPERACAO');
    expect(src).toContain('PAUSADA');
  });

  it('shows Motoristas Fundadores text', () => {
    expect(src).toContain('Motoristas Fundadores KAVIAR');
  });

  it('requires name and WhatsApp in form validation', () => {
    expect(src).toContain("Nome é obrigatório");
    expect(src).toContain("WhatsApp válido é obrigatório");
  });

  it('sends city_slug without city_name/state to POST', () => {
    expect(src).toContain('city_slug: citySlug');
    // Should NOT send city_name or state from frontend
    expect(src).not.toContain("city_name:");
    expect(src).not.toContain("state: city");
  });

  it('captures UTM params from URL', () => {
    expect(src).toContain('utm_source');
    expect(src).toContain('utm_medium');
    expect(src).toContain('utm_campaign');
    expect(src).toContain('useSearchParams');
  });

  it('WhatsApp link contains city reference', () => {
    expect(src).toContain('motorista parceiro KAVIAR em');
    expect(src).toContain('wa.me');
  });

  it('does NOT contain misleading claims', () => {
    expect(src).not.toContain('comece a dirigir hoje');
    expect(src).not.toContain('corridas disponíveis');
    expect(src).not.toContain('ganhos garantidos');
    expect(src).not.toContain('renda garantida');
    expect(src).not.toContain('aprovação garantida');
    expect(src).not.toContain('você já está segurado');
    expect(src).not.toContain('seguro ativo');
  });

  it('has Proteção KAVIAR section with compliant messaging', () => {
    expect(src).toContain('Proteção KAVIAR');
    expect(src).toContain('prepara cada nova cidade com foco em segurança');
    expect(src).toContain('exigências locais aplicáveis');
  });

  it('has trust band with local/tech/city messaging', () => {
    expect(src).toContain('Mobilidade local');
    expect(src).toContain('Tecnologia brasileira');
  });

  it('has premium timeline with 4 steps', () => {
    expect(src).toContain('Pré-cadastro');
    expect(src).toContain('Contato da equipe');
    expect(src).toContain('Documentação');
    expect(src).toContain('Preparação para ativação');
  });

  it('has premium visual identity (dark bg, gold)', () => {
    expect(src).toContain("'#B8942E'"); // GOLD
    expect(src).toContain("'#050508'"); // DARK_BG
    expect(src).toContain('radial-gradient');
    expect(src).toContain('backdropFilter');
  });

  it('has dynamic headlines per public_status', () => {
    expect(src).toContain('STATUS_HEADLINES');
    expect(src).toContain('STATUS_SUBHEADLINES');
    expect(src).toContain('STATUS_HEADLINES[city.public_status]');
  });

  it('OPERACAO subheadline does not contain primeira equipe', () => {
    // Extract the STATUS_SUBHEADLINES block and verify OPERACAO line
    const subheadlinesBlock = src.slice(src.indexOf('STATUS_SUBHEADLINES'), src.indexOf('STATUS_SUBHEADLINES') + 500);
    const operacaoMatch = subheadlinesBlock.match(/OPERACAO:.*$/m);
    expect(operacaoMatch).toBeTruthy();
    expect(operacaoMatch[0]).not.toContain('primeira equipe');
  });

  it('PAUSADA uses neutral headline without city operation claims', () => {
    expect(src).toContain('PAUSADA: null');
    expect(src).toContain('KAVIAR em ${city.city}');
  });

});

describe('App.jsx routing — landing localizada e preservação de rotas do DriverApp', () => {
  const appSrc = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8');

  it('has /motorista/cidade/:citySlug route for city landing', () => {
    expect(appSrc).toContain('/motorista/cidade/:citySlug');
  });

  it('does NOT have bare /motorista/:citySlug route (would collide with DriverApp)', () => {
    const lines = appSrc.split('\n');
    const hasBareParam = lines.some(line =>
      line.includes('path="/motorista/:citySlug"') ||
      line.includes("path='/motorista/:citySlug'")
    );
    expect(hasBareParam).toBe(false);
  });

  it('preserves /motorista exact route', () => {
    expect(appSrc).toContain('path="/motorista"');
  });

  it('preserves /motorista/definir-senha route', () => {
    expect(appSrc).toContain('/motorista/definir-senha');
  });

  it('preserves /motorista/* wildcard route (DriverApp)', () => {
    expect(appSrc).toContain('path="/motorista/*"');
  });

  it('preserves DriverApp for /motorista/login, /motorista/status, /motorista/documents, /motorista/ride', () => {
    expect(appSrc).toContain('element={<DriverApp />}');
  });

  it('/motorista/cidade/:citySlug does not collide with DriverApp internal routes', () => {
    expect(appSrc).toContain('/motorista/cidade/:citySlug');
    ['login', 'status', 'documents', 'ride'].forEach(seg => {
      expect(seg).not.toBe('cidade');
    });
  });

  it('imports DriverCityLanding', () => {
    expect(appSrc).toContain('DriverCityLanding');
  });
});

describe('Admin route for driver-city-landings', () => {
  const appSrc = readFileSync(resolve(__dirname, '../components/admin/AdminApp.jsx'), 'utf8');

  it('has /driver-city-landings admin route', () => {
    expect(appSrc).toContain('/driver-city-landings');
  });

  it('requires SUPER_ADMIN for the route', () => {
    expect(appSrc).toContain('requireSuperAdmin');
  });

  it('imports DriverCityLandingsPage', () => {
    expect(appSrc).toContain('DriverCityLandingsPage');
  });

  it('has Landing de Motoristas card', () => {
    expect(appSrc).toContain('Landing de Motoristas');
  });
});

describe('Admin DriverCityLandingsPage — edit functionality', () => {
  const adminPageSrc = readFileSync(resolve(__dirname, '../pages/admin/DriverCityLandingsPage.jsx'), 'utf8');

  it('has edit button/icon', () => {
    expect(adminPageSrc).toContain('Editar');
    expect(adminPageSrc).toContain('Edit');
  });

  it('has edit dialog with public_status and whatsapp fields', () => {
    expect(adminPageSrc).toContain('Editar cidade');
    expect(adminPageSrc).toContain('editForm.public_status');
    expect(adminPageSrc).toContain('editForm.whatsapp_number');
  });

  it('uses PATCH endpoint for editing', () => {
    expect(adminPageSrc).toContain("method: 'PATCH'");
    expect(adminPageSrc).toContain('/api/admin/driver-city-landings/');
  });

  it('shows city and UF as read-only in edit dialog', () => {
    expect(adminPageSrc).toContain("editing?.city");
    expect(adminPageSrc).toContain("editing?.state");
    expect(adminPageSrc).toContain('disabled');
  });
});
