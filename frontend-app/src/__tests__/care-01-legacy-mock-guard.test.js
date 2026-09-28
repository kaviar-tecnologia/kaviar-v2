/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { canRunLegacyRideDemo } from '../contexts/legacyRideDemoPolicy';

const source = (path) => readFileSync(resolve(__dirname, path), 'utf8');

describe('CARE-01 — legacy mock ride containment', () => {
  const context = source('../contexts/RideContext.jsx');
  const home = source('../pages/passenger/Home.jsx');
  const dashboard = source('../components/passenger/PassengerApp.jsx');
  const mobile = source('../../../src/components/passenger/ServiceSelector.tsx');

  it('never enables fictional rides in a production build, even with the flag', () => {
    expect(canRunLegacyRideDemo(false, 'true')).toBe(false);
    expect(canRunLegacyRideDemo(false, 'false')).toBe(false);
  });

  it('requires explicit development opt-in', () => {
    expect(canRunLegacyRideDemo(true, undefined)).toBe(false);
    expect(canRunLegacyRideDemo(true, 'false')).toBe(false);
    expect(canRunLegacyRideDemo(true, true)).toBe(false);
    expect(canRunLegacyRideDemo(true, 'true')).toBe(true);
  });

  it('guards mock creation and rating at the context boundary', () => {
    expect(context).toContain('canRunLegacyRideDemo(import.meta.env.DEV, import.meta.env.VITE_LEGACY_RIDE_DEMO_ENABLED)');
    expect(context.match(/if \(!demoEnabled\) return false;/g)).toHaveLength(2);
    expect(context).toContain('isDemo: true');
    expect(context).toContain('demoEnabled,');
  });

  it('does not show simulated booking, price or driver assignment in production web CARE', () => {
    expect(home).toContain('if (!demoEnabled)');
    expect(home).toContain('não solicita viagens reais');
    expect(home).toContain('KAVIAR CARE — em implantação');
    expect(home).toContain('DEMONSTRAÇÃO LOCAL');
    expect(home).not.toContain('Alerta de emergência enviado!');
  });

  it('does not prefill potentially sensitive notes or addresses in WhatsApp', () => {
    expect(home).toContain('não solicita nem confirma uma corrida');
    expect(home).not.toContain('careNotes ?');
    expect(home).not.toContain('Origem: ${pickup');
    expect(home).not.toContain('Destino: ${destination');
  });

  it('does not present simulated status/rating as operational dashboard features', () => {
    expect(dashboard).toContain('disabled={!demoEnabled}');
    expect(dashboard).toContain('aplicativo oficial KAVIAR Passageiro');
    expect(mobile).toContain('title="KAVIAR Care"');
    expect(mobile).toContain('statusText="Em implantação."');
  });
});
