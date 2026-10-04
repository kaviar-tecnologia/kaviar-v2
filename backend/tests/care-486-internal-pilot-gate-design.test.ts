import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-486 internal pilot gate design', () => {
  it('documents use of feature flag allowlist without changing runtime', () => {
    const doc = readFileSync('../docs/care/CARE-486-internal-pilot-gate-design.md', 'utf8');
    expect(doc).toContain('CARE_INTERNAL_PILOT');
    expect(doc).toContain('feature flag allowlist');
    expect(doc).toContain('passenger_id');
    expect(doc).toContain('não ativa CARE oficial');
    expect(doc).toContain('não faz deploy');
  });

  it('keeps official CARE flags fail closed', () => {
    const flags = readFileSync('src/services/care/care-feature-flags.ts', 'utf8');
    expect(flags).toContain('CARE_PUBLIC_REQUEST_ENABLED: false');
    expect(flags).toContain('CARE_OFFICIAL_ENABLED: false');
    expect(flags).toContain('CARE_DISPATCH_ENABLED: false');
    expect(flags).toContain('CARE_DRIVER_ACCEPTANCE_ENABLED: false');
  });

  it('does not add a passenger model pilot field in this planning PR', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const match = schema.match(/model passengers \{([\s\S]*?)^\}/m);
    expect(match).toBeTruthy();
    const passengerModel = match ? match[1] : '';
    expect(passengerModel).not.toMatch(/care_internal_pilot|internal_pilot|pilot_care|care_pilot/i);
  });

  it('keeps public CARE request disabled by default', () => {
    const mobile = readFileSync('../src/config/care.config.ts', 'utf8');
    expect(mobile).toContain('publicRequestEnabled: false');
  });
});
