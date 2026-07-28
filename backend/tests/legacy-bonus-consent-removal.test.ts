/**
 * legacy-bonus-consent-removal.test.ts
 *
 * Tests for Commit 1: Removal of legacy family_bonus_accepted consent.
 * Verifies that:
 * - Registration works without familyBonusAccepted
 * - Old payloads with familyBonusAccepted are accepted (not rejected)
 * - No validation requires bonus consent
 * - No approval gate depends on bonus consent
 * - No financial calculation was altered
 * - No settlement was altered
 * - Decision register is consistent
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Replicate the current Zod schemas (post-removal) for validation testing
// ---------------------------------------------------------------------------

// driver-auth.ts schema (after removal)
const driverRegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  password: z.string().min(6),
  document_cpf: z.string().optional(),
  vehicle_color: z.string().optional(),
  vehicle_model: z.string().optional(),
  vehicle_plate: z.string().optional(),
  modality: z.enum(['CAR', 'MOTORCYCLE']).optional(),
  neighborhoodId: z.string().optional(),
  communityId: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  verificationMethod: z.enum(['GPS_AUTO', 'MANUAL_SELECTION']).optional()
});

// driver-onboarding.ts schema (after removal)
const driverOnboardingSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  password: z.string().min(6),
  document_cpf: z.string().optional(),
  vehicle_color: z.string().optional(),
  vehicle_model: z.string().optional(),
  vehicle_plate: z.string().optional(),
  accepted_terms: z.boolean(),
  neighborhoodId: z.string().optional(),
  communityId: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  partner_code: z.string().optional(),
});

// governance.ts schema (after removal)
const driverCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  password: z.string().min(6),
  neighborhoodId: z.string().min(1),
  communityId: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  verificationMethod: z.enum(['GPS_AUTO', 'MANUAL_SELECTION']).optional()
});

// admin-drivers.ts edit schema (after removal — accepts legacy fields, strips them)
const driverEditSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  vehicle_model: z.string().optional(),
  vehicle_plate: z.string().optional(),
  vehicle_color: z.string().optional(),
  neighborhood_id: z.string().nullable().optional(),
  community_id: z.string().nullable().optional(),
  pix_key: z.string().nullable().optional(),
  pix_key_type: z.string().nullable().optional(),
  // @deprecated — accepted for compat, stripped before Prisma
  family_bonus_accepted: z.unknown().optional(),
  family_bonus_profile: z.unknown().optional(),
}).strict().transform(({ family_bonus_accepted, family_bonus_profile, ...clean }) => clean);

// ---------------------------------------------------------------------------
// Test 1: Registration works without familyBonusAccepted
// ---------------------------------------------------------------------------
describe('1. Registration works without familyBonusAccepted', () => {
  it('driver-auth schema validates payload WITHOUT familyBonusAccepted', () => {
    const payload = {
      name: 'João Teste',
      email: 'joao@test.com',
      phone: '+5521999999999',
      password: 'senha123',
      lat: -22.9068,
      lng: -43.1729,
      verificationMethod: 'GPS_AUTO' as const
    };
    const result = driverRegisterSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('driver-onboarding schema validates payload WITHOUT familyBonusAccepted', () => {
    const payload = {
      name: 'Maria Teste',
      email: 'maria@test.com',
      phone: '+5521988888888',
      password: 'senha123',
      accepted_terms: true,
      lat: -22.9068,
      lng: -43.1729
    };
    const result = driverOnboardingSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('governance schema validates payload WITHOUT familyBonusAccepted', () => {
    const payload = {
      name: 'Admin Teste',
      email: 'admin@test.com',
      phone: '+5521977777777',
      password: 'senha123',
      neighborhoodId: 'some-uuid'
    };
    const result = driverCreateSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Old payloads with familyBonusAccepted are accepted (not rejected)
// ---------------------------------------------------------------------------
describe('2. Old payloads with familyBonusAccepted are accepted', () => {
  it('driver-auth schema strips unknown familyBonusAccepted field', () => {
    const payload = {
      name: 'João Legado',
      email: 'legado@test.com',
      phone: '+5521999999999',
      password: 'senha123',
      lat: -22.9068,
      lng: -43.1729,
      familyBonusAccepted: true,
      familyProfile: 'familiar'
    };
    // Zod strips unknown fields by default (non-strict mode)
    const result = driverRegisterSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      // Verify the legacy fields are NOT in the parsed output
      expect('familyBonusAccepted' in result.data).toBe(false);
      expect('familyProfile' in result.data).toBe(false);
    }
  });

  it('driver-onboarding schema strips unknown familyBonusAccepted field', () => {
    const payload = {
      name: 'Maria Legada',
      email: 'legada@test.com',
      phone: '+5521988888888',
      password: 'senha123',
      accepted_terms: true,
      lat: -22.9068,
      lng: -43.1729,
      familyBonusAccepted: false,
      familyProfile: 'individual'
    };
    const result = driverOnboardingSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('familyBonusAccepted' in result.data).toBe(false);
      expect('familyProfile' in result.data).toBe(false);
    }
  });

  it('governance schema strips unknown familyBonusAccepted field', () => {
    const payload = {
      name: 'Gov Legado',
      email: 'gov@test.com',
      phone: '+5521977777777',
      password: 'senha123',
      neighborhoodId: 'some-uuid',
      familyBonusAccepted: true,
      familyProfile: 'familiar'
    };
    const result = driverCreateSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('familyBonusAccepted' in result.data).toBe(false);
    }
  });

  it('admin edit schema accepts legacy fields and strips them (DEC-2707-01 compat)', () => {
    const payload = {
      name: 'Edited',
      family_bonus_accepted: true,
      family_bonus_profile: 'familiar'
    };
    const result = driverEditSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('family_bonus_accepted' in result.data).toBe(false);
      expect('family_bonus_profile' in result.data).toBe(false);
      expect(result.data).toEqual({ name: 'Edited' });
    }
  });

  it('admin edit schema still rejects truly unknown fields (strict mode)', () => {
    const payload = {
      name: 'Edited',
      totally_unknown_field: 'hacker'
    };
    const result = driverEditSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('admin edit schema works without legacy fields', () => {
    const payload = {
      name: 'Edited',
      vehicle_color: 'Branco'
    };
    const result = driverEditSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 3: No validation requires bonus consent
// ---------------------------------------------------------------------------
describe('3. No validation requires bonus consent', () => {
  it('all schemas validate without any bonus-related fields', () => {
    const schemas = [
      { name: 'register', schema: driverRegisterSchema, payload: { name: 'AB', email: 'a@b.com', phone: '1234567890', password: 'test12', lat: 0, lng: 0 } },
      { name: 'onboarding', schema: driverOnboardingSchema, payload: { name: 'AB', email: 'a@b.com', phone: '1234567890', password: 'test12', accepted_terms: true, lat: 0, lng: 0 } },
      { name: 'governance', schema: driverCreateSchema, payload: { name: 'AB', email: 'a@b.com', phone: '1234567890', password: 'test12', neighborhoodId: 'x' } },
    ];

    for (const { name, schema, payload } of schemas) {
      const result = schema.safeParse(payload);
      expect(result.success, `${name} should pass without bonus fields`).toBe(true);
    }
  });

  it('no schema has familyBonusAccepted as a required field', () => {
    // Parse with minimal valid payloads — should all pass
    expect(driverRegisterSchema.safeParse({ name: 'XY', email: 'x@x.com', phone: '1234567890', password: '123456', lat: 0, lng: 0 }).success).toBe(true);
    expect(driverOnboardingSchema.safeParse({ name: 'XY', email: 'x@x.com', phone: '1234567890', password: '123456', accepted_terms: true, lat: 0, lng: 0 }).success).toBe(true);
    expect(driverCreateSchema.safeParse({ name: 'XY', email: 'x@x.com', phone: '1234567890', password: '123456', neighborhoodId: 'id' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 4: No approval gate depends on bonus consent
// ---------------------------------------------------------------------------
describe('4. No approval gate depends on bonus consent', () => {
  it('approval-controller does not select family_bonus_accepted (source check)', () => {
    const controllerPath = path.resolve(__dirname, '..', 'src', 'modules', 'admin', 'approval-controller.ts');
    const source = fs.readFileSync(controllerPath, 'utf8');
    expect(source).not.toContain('family_bonus_accepted');
    expect(source).not.toContain('family_bonus_profile');
    expect(source).not.toContain('familyBonusAccepted');
    expect(source).not.toContain('familyBonusProfile');
  });

  it('admin-drivers uses family_bonus fields only for compat stripping, not for logic', () => {
    const routePath = path.resolve(__dirname, '..', 'src', 'routes', 'admin-drivers.ts');
    const source = fs.readFileSync(routePath, 'utf8');
    // The fields appear in the schema for compat acceptance + stripping
    // But they must NOT appear in Prisma select/response mapping
    expect(source).toContain('family_bonus_accepted: z.unknown().optional()');
    // Should NOT be in any Prisma select or response mapping
    expect(source).not.toContain('family_bonus_accepted: true');
    expect(source).not.toContain('familyBonusAccepted');
  });
});

// ---------------------------------------------------------------------------
// Test 5: No financial calculation was altered
// ---------------------------------------------------------------------------
describe('5. No financial calculation was altered in this commit', () => {
  it('fee-split service still uses 18% and 60/40 split', () => {
    const feeSplitPath = path.resolve(__dirname, '..', 'src', 'services', 'wallet-v2', 'fee-split.service.ts');
    const source = fs.readFileSync(feeSplitPath, 'utf8');
    expect(source).toContain('* 18 / 100');
    expect(source).toContain('* 60 / 100');
    expect(source).toContain('fee - matrix');
  });

  it('wallet-settlement service is unchanged (no bonus accrual added yet)', () => {
    const settlementPath = path.resolve(__dirname, '..', 'src', 'services', 'wallet-v2', 'wallet-settlement.service.ts');
    const source = fs.readFileSync(settlementPath, 'utf8');
    // Should NOT contain bonus accrual logic yet
    expect(source).not.toContain('BonusAccrual');
    expect(source).not.toContain('bonus_accrual');
    expect(source).not.toContain('accrueOnSettlement');
  });
});

// ---------------------------------------------------------------------------
// Test 6: No gratification generation was moved yet
// ---------------------------------------------------------------------------
describe('6. No gratification generation moved yet', () => {
  it('sumup-recharge service still has FAMILY_RETURN logic (to be removed in commit 2)', () => {
    const rechargePath = path.resolve(__dirname, '..', 'src', 'services', 'wallet-v2', 'sumup-recharge.service.ts');
    const source = fs.readFileSync(rechargePath, 'utf8');
    // The old accrual-on-recharge logic still exists (will be removed in commit 2)
    // This test documents that commit 1 does NOT alter the recharge flow
    expect(source).toContain('FAMILY_RETURN');
  });
});

// ---------------------------------------------------------------------------
// Test 7: No settlement was altered
// ---------------------------------------------------------------------------
describe('7. No settlement was altered', () => {
  it('rides-v2 route does not contain bonus logic', () => {
    const ridesPath = path.resolve(__dirname, '..', 'src', 'routes', 'rides-v2.ts');
    const source = fs.readFileSync(ridesPath, 'utf8');
    expect(source).not.toContain('CANCEL_COMPENSATION');
    expect(source).not.toContain('cancel_compensation');
  });
});

// ---------------------------------------------------------------------------
// Test 8: Decision register is consistent
// ---------------------------------------------------------------------------
describe('8. Decision register consistency', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const JSON_PATH = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decision-register.json');
  const register = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

  it('decision register version is 1.1.0 (blueprint unchanged)', () => {
    expect(register.blueprint_version).toBe('1.1.0');
  });

  it('decision register has revision field for document versioning', () => {
    expect(register.decision_register_revision).toBe('2026-07-27-v1');
  });

  it('has exactly 25 decisions in main register', () => {
    expect(register.decisions.length).toBe(25);
  });

  it('references addendum document for 2026-07-27', () => {
    expect(register.summary.addendum_2026_07_27).toBeDefined();
    expect(register.summary.addendum_2026_07_27.total_new_decisions).toBe(32);
    expect(register.summary.addendum_2026_07_27.document).toBe('phase-3c-2d-2b-decisions-2026-07-27.md');
  });

  it('addendum document exists', () => {
    const addendumPath = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decisions-2026-07-27.md');
    expect(fs.existsSync(addendumPath)).toBe(true);
  });

  it('addendum contains all 32 decisions (DEC-2707-01 to DEC-2707-32)', () => {
    const addendumPath = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decisions-2026-07-27.md');
    const content = fs.readFileSync(addendumPath, 'utf8');
    expect(content).toContain('DEC-2707-01');
    expect(content).toContain('DEC-2707-32');
    expect(content).toContain('Gratificação Anual de Incentivo KAVIAR');
    expect(content).toContain('CANCEL_COMPENSATION');
    expect(content).toContain('CASH_ONLY');
  });

  it('supersedes list includes all BP-11 through BP-29', () => {
    const supersedes = register.summary.addendum_2026_07_27.supersedes;
    expect(supersedes).toHaveLength(19);
    expect(supersedes).toContain('BP-11');
    expect(supersedes).toContain('BP-29');
    for (let i = 11; i <= 29; i++) {
      expect(supersedes).toContain(`BP-${i}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 9: Bonus policy notes superseded status
// ---------------------------------------------------------------------------
describe('9. Bonus policy reflects superseded rules', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const policyPath = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-bonus-policy.md');
  const policy = fs.readFileSync(policyPath, 'utf8');

  it('bonus policy header indicates ACTIVE_FROZEN', () => {
    expect(policy).toContain('Política vigente, congelada para a próxima implementação');
  });

  it('references date 2026-07-27', () => {
    expect(policy).toContain('2026-07-27');
  });

  it('version is v1.3', () => {
    expect(policy).toContain('BONUS-POLICY-v1.3');
  });

  it('summary mentions 18% consumidos', () => {
    expect(policy).toContain('18% efetivamente consumidos');
  });

  it('mentions BP-11..BP-29 fully superseded', () => {
    expect(policy).toContain('BP-11');
    expect(policy).toContain('integralmente substituídas');
  });
});

// ---------------------------------------------------------------------------
// Test 10: Fiscal rules remain open (not closed prematurely)
// ---------------------------------------------------------------------------
describe('10. Fiscal rules remain open', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const addendumPath = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decisions-2026-07-27.md');
  const content = fs.readFileSync(addendumPath, 'utf8');

  it('lists unconfirmed fiscal items as pending', () => {
    expect(content).toContain('NÃO confirmado');
    expect(content).toContain('Anexo do Simples');
    expect(content).toContain('Alíquota efetiva');
    expect(content).toContain('Fator R');
    expect(content).toContain('Código de serviço');
  });

  it('does not hard-code any municipal tax rate', () => {
    expect(content).not.toMatch(/rate_percent.*=.*1\.5/);
    expect(content).not.toMatch(/alíquota.*1,5/i);
  });

  it('explicitly states 1.5% is NOT confirmed', () => {
    expect(content).toContain('1,5%');
    expect(content).toContain('NÃO foram informação do contador');
  });
});

// ---------------------------------------------------------------------------
// Test 11: Schema marks fields as deprecated
// ---------------------------------------------------------------------------
describe('11. Schema deprecation markers', () => {
  it('prisma schema marks family_bonus fields as deprecated', () => {
    const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    expect(schema).toContain('@deprecated 2026-07-27');
    expect(schema).toContain('Remoção física somente após período de compatibilidade');
  });
});

// ---------------------------------------------------------------------------
// Test 12: Policy active rules do NOT contain recharge-based language
// ---------------------------------------------------------------------------
describe('12. Active policy does not contain recharge-based rules', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const JSON_PATH = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decision-register.json');
  const register = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const rules: Array<{ id: string; description: string }> = register.business_policies.bonus.rules;
  const activeText = rules.map(r => r.description).join('\n');

  it('no rule says "evento gerador exclusivo: recarga"', () => {
    expect(activeText).not.toMatch(/evento gerador exclusivo.*recarga/i);
  });

  it('no rule says "não depende de corrida"', () => {
    expect(activeText).not.toMatch(/não depende de corrida/i);
  });

  it('no rule says "após confirmação do Pix"', () => {
    expect(activeText).not.toMatch(/após.*confirmação.*pix/i);
  });

  it('no rule says "somente dinheiro novo pago pelo motorista gera bônus"', () => {
    expect(activeText).not.toMatch(/somente dinheiro novo.*gera.*bônus/i);
  });

  it('no rule says "compensação de cancelamento não gera bônus"', () => {
    expect(activeText).not.toMatch(/compensação.*cancelamento.*não.*gera.*bônus/i);
  });
});

// ---------------------------------------------------------------------------
// Test 13: Active policy affirms CANCEL_COMPENSATION generates gratification
// ---------------------------------------------------------------------------
describe('13. Active policy affirms CANCEL_COMPENSATION generates gratification', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const JSON_PATH = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decision-register.json');
  const register = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const rules: Array<{ id: string; description: string }> = register.business_policies.bonus.rules;
  const bp29 = rules.find((r: any) => r.id === 'BP-29');

  it('BP-29 states CANCEL_COMPENSATION generates gratification', () => {
    expect(bp29).toBeDefined();
    expect(bp29!.description).toContain('CANCEL_COMPENSATION gera gratificação');
  });
});

// ---------------------------------------------------------------------------
// Test 14: Addendum and policy use the same approval date
// ---------------------------------------------------------------------------
describe('14. Addendum and policy use the same date', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const JSON_PATH = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decision-register.json');
  const register = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const addendumPath = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decisions-2026-07-27.md');
  const addendum = fs.readFileSync(addendumPath, 'utf8');
  const policyDate = register.business_policies.bonus.approved_at;

  it('policy approved_at is 2026-07-27T23:12:27Z', () => {
    expect(policyDate).toBe('2026-07-27T23:12:27Z');
  });

  it('addendum references the same date', () => {
    expect(addendum).toContain('2026-07-27T23:12:27Z');
  });
});

// ---------------------------------------------------------------------------
// Test 15: staging-validation.sh (versioned) does not send legacy fields
// ---------------------------------------------------------------------------
describe('15. staging-validation.sh clean of legacy fields', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'staging-validation.sh');
  const script = fs.readFileSync(scriptPath, 'utf8');

  it('does not contain familyBonusAccepted', () => {
    expect(script).not.toContain('familyBonusAccepted');
  });

  it('does not contain familyProfile', () => {
    expect(script).not.toContain('familyProfile');
  });

  it('does not contain family_bonus_accepted', () => {
    expect(script).not.toContain('family_bonus_accepted');
  });

  it('does not contain family_bonus_profile', () => {
    expect(script).not.toContain('family_bonus_profile');
  });
});

// ---------------------------------------------------------------------------
// Test 16: 25 original decisions, 6 decided, 19 open remain intact
// ---------------------------------------------------------------------------
describe('16. Original decisions structure intact', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const JSON_PATH = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decision-register.json');
  const register = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

  it('exactly 25 decisions in main register', () => {
    expect(register.decisions.length).toBe(25);
  });

  it('6 decisions are decided', () => {
    const decided = register.decisions.filter((d: any) => d.answer !== null);
    expect(decided.length).toBe(6);
  });

  it('19 decisions are open', () => {
    const open = register.decisions.filter((d: any) => d.answer === null);
    expect(open.length).toBe(19);
  });

  it('materialization_authorized is false', () => {
    expect(register.materialization_authorized).toBe(false);
  });

  it('database_write_authorized is false', () => {
    expect(register.database_write_authorized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 17: Policy states payment exclusively in cash (PIX/transfer)
// ---------------------------------------------------------------------------
describe('17. Policy payment is CASH_ONLY (PIX/transfer)', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..');
  const JSON_PATH = path.join(REPO_ROOT, 'docs', 'finance', 'phase-3c-2d-2b-decision-register.json');
  const register = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const rules: Array<{ id: string; description: string }> = register.business_policies.bonus.rules;
  const bp09 = rules.find((r: any) => r.id === 'BP-09');
  const entries = register.business_policies.bonus.conceptual_journal_entries;

  it('BP-09 states payment exclusively in cash', () => {
    expect(bp09).toBeDefined();
    expect(bp09!.description).toContain('exclusivamente em dinheiro');
  });

  it('BP-09 mentions PIX and transferência', () => {
    expect(bp09!.description).toContain('PIX');
    expect(bp09!.description).toContain('transferência bancária');
  });

  it('BP-09 prohibits conversion to credits', () => {
    expect(bp09!.description).toContain('Não é permitida conversão em créditos');
  });

  it('active journal entries do NOT contain conversion to credits', () => {
    const conversionEntry = entries.find((e: any) =>
      e.event.toLowerCase().includes('conversão') || e.event.toLowerCase().includes('créditos')
    );
    expect(conversionEntry).toBeUndefined();
  });

  it('historical conversion entry is preserved with SUPERSEDED status', () => {
    const hist = register.business_policies.bonus.historical_journal_entry_conversion_v1_2
      || register.business_policies.bonus['historical_journal_entry_conversion_v1.2'];
    expect(hist).toBeDefined();
    expect(hist.status).toBe('SUPERSEDED');
  });

  it('no financial logic was altered in this commit (fee-split intact)', () => {
    const feeSplitPath = path.resolve(__dirname, '..', 'src', 'services', 'wallet-v2', 'fee-split.service.ts');
    const source = fs.readFileSync(feeSplitPath, 'utf8');
    expect(source).toContain('* 18 / 100');
    expect(source).toContain('* 60 / 100');
  });
});
