import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-484 final pilot release checklist', () => {
  it('keeps official CARE flags fail closed before pilot activation', () => {
    const flags = readFileSync('src/services/care/care-feature-flags.ts', 'utf8');
    expect(flags).toContain('CARE_PUBLIC_REQUEST_ENABLED: false');
    expect(flags).toContain('CARE_OFFICIAL_ENABLED: false');
    expect(flags).toContain('CARE_DISPATCH_ENABLED: false');
    expect(flags).toContain('CARE_DRIVER_ACCEPTANCE_ENABLED: false');
    expect(flags).toContain('CARE_AUDIT_STRICT_ENABLED: true');
  });

  it('keeps the mobile CARE public request disabled by default', () => {
    const mobile = readFileSync('../src/config/care.config.ts', 'utf8');
    expect(mobile).toContain('publicRequestEnabled: false');
  });

  it('documents that the pilot checklist does not activate operational CARE', () => {
    const doc = readFileSync('../docs/care/CARE-484-final-pilot-release-checklist.md', 'utf8');
    expect(doc).toContain('sem ativar CARE oficial');
    expect(doc).toContain('Flags oficiais não podem liberar CARE sozinhas.');
    expect(doc).toContain('não muda backend operacional');
    expect(doc).toContain('não faz deploy');
  });
});
