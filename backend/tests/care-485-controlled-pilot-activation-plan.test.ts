import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-485 controlled pilot activation plan', () => {
  it('documents a plan without enabling official CARE flags', () => {
    const flags = readFileSync('src/services/care/care-feature-flags.ts', 'utf8');
    expect(flags).toContain('CARE_PUBLIC_REQUEST_ENABLED: false');
    expect(flags).toContain('CARE_OFFICIAL_ENABLED: false');
    expect(flags).toContain('CARE_DISPATCH_ENABLED: false');
    expect(flags).toContain('CARE_DRIVER_ACCEPTANCE_ENABLED: false');
  });

  it('keeps admin CARE capabilities preparatory only', () => {
    const admin = readFileSync('src/routes/admin-drivers.ts', 'utf8');
    expect(admin).toContain('officialCareEnabled: false');
    expect(admin).toContain('Não habilita CARE_ASSISTED, dispatcher, pricing ou aceite oficial.');
    expect(admin).toContain('CARE_ASSISTED oficial continua bloqueado.');
  });

  it('keeps CARE draft creation unexposed and non-authorizing', () => {
    const draft = readFileSync('src/services/care/care-ride-create.ts', 'utf8');
    expect(draft).toContain('not yet exposed to an HTTP route');
    expect(draft).toContain("status: 'DRAFT'");
    expect(draft).toContain('cannot authorize, dispatch or mark a trip READY');
  });

  it('records the controlled pilot requirements without changing runtime behavior', () => {
    const doc = readFileSync('../docs/care/CARE-485-controlled-pilot-activation-plan.md', 'utf8');
    expect(doc).toContain('Piloto interno primeiro');
    expect(doc).toContain('CARE não pode ser liberado apenas por flag.');
    expect(doc).toContain('não pode pagar mais caro por sua condição');
    expect(doc).toContain('autorização expressa antes de merge');
    expect(doc).toContain('não faz deploy');
  });
});
