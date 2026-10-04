import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-493 future release technical plan', () => {
  it('documents a future release plan without authorizing release', () => {
    const doc = readFileSync('../docs/care/CARE-493-future-release-technical-plan.md', 'utf8');

    expect(doc).toContain('CARE-493 — Future CARE release technical plan');
    expect(doc).toContain('não libera CARE oficial');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não altera runtime');
    expect(doc).toContain('não altera dispatcher');
    expect(doc).toContain('não altera aceite');
    expect(doc).toContain('não altera pricing');
    expect(doc).toContain('não altera wallet');
    expect(doc).toContain('não cria migration');
    expect(doc).toContain('não altera variáveis de produção');
    expect(doc).toContain('não faz deploy');
  });

  it('records that allowlist and flags are insufficient by themselves', () => {
    const doc = readFileSync('../docs/care/CARE-493-future-release-technical-plan.md', 'utf8');

    expect(doc).toContain('Nenhum piloto real pode começar apenas com allowlist ou flags.');
    expect(doc).toContain('CARE_INTERNAL_PILOT é preparatório e observável, não autorizador');
    expect(doc).toContain('Mesmo com flags oficiais simuladas como true, a rota continua bloqueada.');
    expect(doc).toContain('Nenhuma flag isolada pode liberar o fluxo.');
  });

  it('requires dispatcher acceptance pricing wallet and rollback before future release', () => {
    const doc = readFileSync('../docs/care/CARE-493-future-release-technical-plan.md', 'utf8');

    expect(doc).toContain('Dispatcher CARE');
    expect(doc).toContain('Aceite CARE');
    expect(doc).toContain('Pricing e paridade');
    expect(doc).toContain('Wallet e settlement');
    expect(doc).toContain('Rollback');
    expect(doc).toContain('desativar flags oficiais');
    expect(doc).toContain('manter corridas comuns funcionando');
  });

  it('keeps official CARE flags fail-closed by default in source', () => {
    const flags = readFileSync('src/services/care/care-feature-flags.ts', 'utf8');

    expect(flags).toContain('CARE_PUBLIC_REQUEST_ENABLED: false');
    expect(flags).toContain('CARE_OFFICIAL_ENABLED: false');
    expect(flags).toContain('CARE_DISPATCH_ENABLED: false');
    expect(flags).toContain('CARE_DRIVER_ACCEPTANCE_ENABLED: false');
  });

  it('keeps the composed preflight blocked in source', () => {
    const preflight = readFileSync('src/services/care/care-internal-pilot-preflight.ts', 'utf8');

    expect(preflight).toContain('canProceed: false');
    expect(preflight).not.toContain('canProceed: true');
    expect(preflight).toContain('CARE_UNAVAILABLE_CODE');
    expect(preflight).toContain('PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLOW_NOT_IMPLEMENTED');
  });

  it('requires separate authorization for operational merge and production deploy', () => {
    const doc = readFileSync('../docs/care/CARE-493-future-release-technical-plan.md', 'utf8');

    expect(doc).toContain('autorização expressa para implementar e mergear código operacional');
    expect(doc).toContain('autorização expressa separada para deploy em produção');
    expect(doc).toContain('A aprovação deste plano não autoriza liberação');
  });
});
