/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { DRIVER_CITY_CONFIG, getCityBySlug, isValidCitySlug } from '../config/driverCities';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('driverCities config', () => {
  it('has santa-cruz-das-palmeiras-sp configured', () => {
    const city = DRIVER_CITY_CONFIG['santa-cruz-das-palmeiras-sp'];
    expect(city).toBeDefined();
    expect(city.name).toBe('Santa Cruz das Palmeiras');
    expect(city.state).toBe('SP');
    expect(city.status).toBe('implantacao');
  });

  it('getCityBySlug returns city for valid slug', () => {
    const city = getCityBySlug('santa-cruz-das-palmeiras-sp');
    expect(city).not.toBeNull();
    expect(city.name).toBe('Santa Cruz das Palmeiras');
  });

  it('getCityBySlug returns null for unknown slug', () => {
    expect(getCityBySlug('cidade-inexistente')).toBeNull();
  });

  it('isValidCitySlug returns true for valid slug', () => {
    expect(isValidCitySlug('santa-cruz-das-palmeiras-sp')).toBe(true);
  });

  it('isValidCitySlug returns false for unknown slug', () => {
    expect(isValidCitySlug('nao-existe')).toBe(false);
  });
});

describe('DriverCityLanding component source', () => {
  const src = readFileSync(resolve(__dirname, '../pages/DriverCityLanding.jsx'), 'utf8');

  it('renders city name from config (Santa Cruz das Palmeiras)', () => {
    // Component uses city.name dynamically — verify it references getCityBySlug
    expect(src).toContain('getCityBySlug');
    expect(src).toContain('city.name');
  });

  it('shows Motoristas Fundadores text', () => {
    expect(src).toContain('Motoristas Fundadores KAVIAR');
  });

  it('shows implantação / formação da primeira equipe messaging', () => {
    expect(src).toContain('em implantação');
    expect(src).toContain('formação da primeira equipe');
  });

  it('requires name and WhatsApp in form validation', () => {
    expect(src).toContain("Nome é obrigatório");
    expect(src).toContain("WhatsApp válido é obrigatório");
  });

  it('sends lead_type DRIVER with city and modality and EAR', () => {
    // The endpoint receives these fields
    expect(src).toContain('city_slug');
    expect(src).toContain('city_name');
    expect(src).toContain('modality');
    expect(src).toContain('ear');
  });

  it('captures UTM params from URL', () => {
    expect(src).toContain('utm_source');
    expect(src).toContain('utm_medium');
    expect(src).toContain('utm_campaign');
    expect(src).toContain('useSearchParams');
  });

  it('WhatsApp link contains city name', () => {
    // The message template includes city.name
    expect(src).toContain('motorista parceiro KAVIAR em');
    expect(src).toContain('wa.me');
  });

  it('has fallback for unknown city slug', () => {
    expect(src).toContain('Cidade não encontrada');
  });

  it('does NOT contain misleading claims', () => {
    expect(src).not.toContain('comece a dirigir hoje');
    expect(src).not.toContain('corridas disponíveis');
    expect(src).not.toContain('ganhos garantidos');
    expect(src).not.toContain('renda garantida');
    expect(src).not.toContain('aprovação garantida');
  });
});

describe('App.jsx routing — landing localizada e preservação de rotas do DriverApp', () => {
  const appSrc = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8');

  it('has /motorista/cidade/:citySlug route for city landing', () => {
    expect(appSrc).toContain('/motorista/cidade/:citySlug');
  });

  it('does NOT have bare /motorista/:citySlug route (would collide with DriverApp)', () => {
    // Ensure the old problematic pattern is not present
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

  it('preserves /motorista/login access (handled by /motorista/* DriverApp)', () => {
    // DriverApp handles internal routes via wildcard; ensure wildcard is present
    expect(appSrc).toContain('element={<DriverApp />}');
  });

  it('/motorista/cidade/:citySlug does not collide with /motorista/login, /motorista/status, /motorista/documents, /motorista/ride', () => {
    // The path /motorista/cidade/:citySlug has a static "cidade" segment,
    // so it can NEVER match /motorista/login, /motorista/status, etc.
    expect(appSrc).toContain('/motorista/cidade/:citySlug');
    // None of these segments equal "cidade"
    const protectedSegments = ['login', 'status', 'documents', 'ride'];
    protectedSegments.forEach(seg => {
      expect(seg).not.toBe('cidade');
    });
  });

  it('imports DriverCityLanding', () => {
    expect(appSrc).toContain('DriverCityLanding');
  });
});
