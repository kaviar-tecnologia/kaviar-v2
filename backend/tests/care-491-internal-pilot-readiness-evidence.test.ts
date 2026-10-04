import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-491 internal pilot readiness evidence', () => {
  it('documents the readiness evidence without activating CARE', () => {
    const doc = readFileSync('../docs/care/CARE-491-internal-pilot-readiness-evidence.md', 'utf8');

    expect(doc).toContain('CARE-491 — Internal pilot readiness evidence');
    expect(doc).toContain('CARE-486');
    expect(doc).toContain('CARE-487');
    expect(doc).toContain('CARE-488');
    expect(doc).toContain('CARE-489');
    expect(doc).toContain('CARE-490');

    expect(doc).toContain('não ativa CARE oficial');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não muda runtime');
    expect(doc).toContain('não cria migration');
    expect(doc).toContain('não altera produção');
    expect(doc).toContain('não faz deploy');
  });

  it('records that the internal pilot allowlist is not an authorization by itself', () => {
    const doc = readFileSync('../docs/care/CARE-491-internal-pilot-readiness-evidence.md', 'utf8');

    expect(doc).toContain('CARE_INTERNAL_PILOT');
    expect(doc).toContain('passenger_id');
    expect(doc).toContain('passengerId injetado no body não substitui');
    expect(doc).toContain('Passageiro allowlisted em CARE_INTERNAL_PILOT continua bloqueado');
    expect(doc).toContain('Allowlist interna é observável/preparatória, não autorizadora');
  });

  it('keeps official CARE flags fail-closed by default', () => {
    const flags = readFileSync('src/services/care/care-feature-flags.ts', 'utf8');

    expect(flags).toContain('CARE_PUBLIC_REQUEST_ENABLED: false');
    expect(flags).toContain('CARE_OFFICIAL_ENABLED: false');
    expect(flags).toContain('CARE_DISPATCH_ENABLED: false');
    expect(flags).toContain('CARE_DRIVER_ACCEPTANCE_ENABLED: false');
  });

  it('confirms the composed preflight remains permanently blocked', () => {
    const preflight = readFileSync('src/services/care/care-internal-pilot-preflight.ts', 'utf8');

    expect(preflight).toContain('canProceed: false');
    expect(preflight).not.toContain('canProceed: true');
    expect(preflight).toContain('CARE_UNAVAILABLE_CODE');
    expect(preflight).toContain('PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLOW_NOT_IMPLEMENTED');
  });

  it('confirms rides-v2 is wired but dispatcher acceptance and pricing are not', () => {
    const route = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const dispatcher = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const acceptance = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const pricing = readFileSync('src/services/pricing-engine.ts', 'utf8');

    expect(route).toContain('getCareInternalPilotPreflightDecision');
    expect(route).toContain('if (await rejectBlockedCareIntent(req, res)) return;');

    expect(dispatcher).not.toContain('getCareInternalPilotPreflightDecision');
    expect(acceptance).not.toContain('getCareInternalPilotPreflightDecision');
    expect(pricing).not.toContain('getCareInternalPilotPreflightDecision');
  });

  it('confirms the HTTP behavior test for the blocked route boundary exists', () => {
    const behavior = readFileSync('tests/care-490-rides-v2-blocked-preflight-behavior.test.ts', 'utf8');

    expect(behavior).toContain('blocks CARE estimate before route distance, pricing or quote work');
    expect(behavior).toContain('uses authenticated passengerId, never passengerId injected in request body');
    expect(behavior).toContain('still blocks CARE create even when authenticated passenger is allowlisted');
    expect(behavior).toContain('preserves normal estimate flow without querying CARE_INTERNAL_PILOT allowlist');
  });
});
