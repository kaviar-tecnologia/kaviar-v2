import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260929115000_care_official_scope_evidence/migration.sql');
const runtime = read('src/services/care/care-runtime-eligibility.ts');
const verifiedScope = read('src/services/care/care-verified-scope-evidence.ts');

describe('CARE-06A — additive official scope contract', () => {
  it('extends the existing municipal modality enum instead of creating a parallel regulation table', () => {
    for (const mode of [
      'CARE_ASSISTED',
      'CARE_FOLDING_WHEELCHAIR',
      'CARE_ADAPTED_WHEELCHAIR',
    ]) {
      expect(schema).toContain(mode);
      expect(migration).toContain(`ADD VALUE IF NOT EXISTS '${mode}'`);
    }
    expect(migration).not.toMatch(/CREATE\s+TABLE\s+["']?care_.*(?:regulation|insurance|authorization)/i);
  });

  it('adds review provenance to the existing official municipal and insurance sources', () => {
    expect(schema).toContain('care_scope_verified             Boolean');
    expect(schema).toContain('care_scope_verified_at');
    expect(schema).toContain('care_scope_verified_by_admin_id');
    expect(schema).toContain('care_scope_document_url');
    expect(schema).toContain('operational_coverage_id String?');
    expect(schema).toContain('driver_enrollments      driver_insurance_enrollments[]');
    expect(migration).toContain('municipal_regulations_care_active_requires_review');
    expect(migration).toContain('operational_insurance_coverages_care_active_requires_review');
    expect(migration).toContain('driver_insurance_enrollments_operational_coverage_id_fkey');
  });

  it('contains no seed, status activation, destructive table/column operation or financial write', () => {
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN)/i);
    expect(migration).not.toContain('financial_');
    expect(migration).not.toContain('ride_settlements');
  });

  it('does not allow a loose boolean bundle to satisfy CARE runtime gates', () => {
    expect(runtime).not.toContain('municipalAuthorized: boolean');
    expect(runtime).not.toContain('territoryEligible: boolean');
    expect(runtime).not.toContain('insuranceConfirmedForMode: boolean');
    expect(runtime).toContain('VerifiedCareScopeEvidence');
    expect(runtime).toContain('CARE_SCOPE_EVIDENCE_MISMATCH');
    expect(verifiedScope).toContain("source: 'municipal_regulations'");
    expect(verifiedScope).toContain("source: 'operational_insurance_coverages'");
    expect(verifiedScope).toContain('operational_coverage_id: coverage.id');
  });

  it('keeps the resolver read-only and does not call provider, wallet, dispatcher or settlement code', () => {
    expect(verifiedScope).not.toMatch(/\.(?:create|update|updateMany|delete|deleteMany|upsert)\s*\(/);
    expect(verifiedScope).not.toContain('Previlemos');
    expect(verifiedScope).not.toContain('Wallet');
    expect(verifiedScope).not.toMatch(/from\s+['"].*dispatcher/);
    expect(verifiedScope).not.toContain('dispatchRide(');
    expect(verifiedScope).not.toContain('ride_settlements');
  });
});
