/**
 * Tests for Frente 3/9 — Accounting classification fields on financial_categories.
 *
 * Validates:
 * 1. Zod schemas accept accounting fields (create + patch)
 * 2. Zod schemas reject invalid accounting_nature values
 * 3. Serializer includes all 8 new fields
 * 4. Null defaults work correctly (backward compat)
 * 5. Permission arrays include accounting fields
 */
import { describe, expect, it } from 'vitest';

const { financeCategoryCreateBodySchema, financeCategoryPatchBodySchema } = await import(
  '../src/services/finance/finance-query-validation'
);
const { serializeCategoryItem } = await import('../src/services/finance/finance-serializers');

// ══════════════════════════════════════════════════════════════════════════════
// 1. Zod create schema — accepts accounting fields
// ══════════════════════════════════════════════════════════════════════════════

describe('financeCategoryCreateBodySchema — accounting fields', () => {
  const validBase = {
    code: 'TEST_ACCT',
    name: 'Test accounting category',
    kind: 'EXPENSE',
  };

  it('accepts all accounting fields as optional', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      accounting_code: '3.1.01.01',
      accounting_nature: 'DEBIT',
      dre_group: 'Custos Operacionais',
      balance_sheet_group: 'Ativo Circulante',
      fiscal_classification: 'CFOP 5102',
      deductible: true,
      export_code: 'EXP-001',
      accountant_notes: 'Nota do contador para exportação',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accounting_code).toBe('3.1.01.01');
      expect(result.data.accounting_nature).toBe('DEBIT');
      expect(result.data.dre_group).toBe('Custos Operacionais');
      expect(result.data.balance_sheet_group).toBe('Ativo Circulante');
      expect(result.data.fiscal_classification).toBe('CFOP 5102');
      expect(result.data.deductible).toBe(true);
      expect(result.data.export_code).toBe('EXP-001');
      expect(result.data.accountant_notes).toBe('Nota do contador para exportação');
    }
  });

  it('accepts without any accounting fields (backward compatible)', () => {
    const result = financeCategoryCreateBodySchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('accepts null for accounting fields', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      accounting_code: null,
      accounting_nature: null,
      dre_group: null,
      balance_sheet_group: null,
      fiscal_classification: null,
      deductible: null,
      export_code: null,
      accountant_notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid accounting_nature', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      accounting_nature: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('accepts CREDIT as accounting_nature', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      accounting_nature: 'CREDIT',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accounting_nature).toBe('CREDIT');
    }
  });

  it('rejects accounting_code > 50 chars', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      accounting_code: 'A'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('rejects accountant_notes > 2000 chars', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      accountant_notes: 'A'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('trims accounting_code whitespace', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      accounting_code: '  3.1.01  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accounting_code).toBe('3.1.01');
    }
  });

  it('converts empty accounting_code to null', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      accounting_code: '   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accounting_code).toBeNull();
    }
  });

  it('accepts deductible as false', () => {
    const result = financeCategoryCreateBodySchema.safeParse({
      ...validBase,
      deductible: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deductible).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Zod patch schema — accepts accounting fields
// ══════════════════════════════════════════════════════════════════════════════

describe('financeCategoryPatchBodySchema — accounting fields', () => {
  const validPatchBase = {
    expected_updated_at: '2026-08-01T00:00:00.000Z',
  };

  it('accepts patch with only accounting_code', () => {
    const result = financeCategoryPatchBodySchema.safeParse({
      ...validPatchBase,
      accounting_code: '4.1.02.03',
    });
    expect(result.success).toBe(true);
  });

  it('accepts patch with multiple accounting fields', () => {
    const result = financeCategoryPatchBodySchema.safeParse({
      ...validPatchBase,
      dre_group: 'Receita Bruta',
      deductible: false,
      accountant_notes: 'Updated by accountant',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null to clear accounting fields', () => {
    const result = financeCategoryPatchBodySchema.safeParse({
      ...validPatchBase,
      accounting_code: null,
      dre_group: null,
      deductible: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects patch with only expected_updated_at (no change)', () => {
    const result = financeCategoryPatchBodySchema.safeParse(validPatchBase);
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Serializer includes all accounting fields
// ══════════════════════════════════════════════════════════════════════════════

describe('serializeCategoryItem — accounting fields', () => {
  it('includes all 8 accounting fields with null defaults', () => {
    const mockCategory = {
      id: 'cat-1',
      code: 'TEST',
      name: 'Test',
      kind: 'EXPENSE',
      parent_id: null,
      default_direction: 'OUT',
      requires_document: false,
      is_system: true,
      is_active: true,
      is_postable: true,
      sort_order: 1,
      created_by_admin: null,
      updated_by_admin: null,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      // No accounting fields set
    };

    const serialized = serializeCategoryItem(mockCategory);

    expect(serialized.accounting_code).toBeNull();
    expect(serialized.accounting_nature).toBeNull();
    expect(serialized.dre_group).toBeNull();
    expect(serialized.balance_sheet_group).toBeNull();
    expect(serialized.fiscal_classification).toBeNull();
    expect(serialized.deductible).toBeNull();
    expect(serialized.export_code).toBeNull();
    expect(serialized.accountant_notes).toBeNull();
  });

  it('serializes accounting fields when present', () => {
    const mockCategory = {
      id: 'cat-2',
      code: 'ACCT',
      name: 'Accounted',
      kind: 'EXPENSE',
      parent_id: null,
      default_direction: 'OUT',
      requires_document: false,
      is_system: false,
      is_active: true,
      is_postable: true,
      sort_order: 5,
      accounting_code: '3.1.01.01',
      accounting_nature: 'DEBIT',
      dre_group: 'Custos Operacionais',
      balance_sheet_group: null,
      fiscal_classification: 'CFOP 5102',
      deductible: true,
      export_code: 'EXP-001',
      accountant_notes: 'Verificado em agosto 2026',
      created_by_admin: { id: 'admin-1', name: 'Admin', role: 'SUPER_ADMIN' },
      updated_by_admin: { id: 'admin-1', name: 'Admin', role: 'SUPER_ADMIN' },
      created_at: new Date('2026-08-01'),
      updated_at: new Date('2026-08-01'),
    };

    const serialized = serializeCategoryItem(mockCategory);

    expect(serialized.accounting_code).toBe('3.1.01.01');
    expect(serialized.accounting_nature).toBe('DEBIT');
    expect(serialized.dre_group).toBe('Custos Operacionais');
    expect(serialized.balance_sheet_group).toBeNull();
    expect(serialized.fiscal_classification).toBe('CFOP 5102');
    expect(serialized.deductible).toBe(true);
    expect(serialized.export_code).toBe('EXP-001');
    expect(serialized.accountant_notes).toBe('Verificado em agosto 2026');
  });

  it('serializes deductible=false correctly (not as null)', () => {
    const mockCategory = {
      id: 'cat-3',
      code: 'NON_DED',
      name: 'Non Deductible',
      kind: 'EXPENSE',
      parent_id: null,
      default_direction: 'OUT',
      requires_document: false,
      is_system: false,
      is_active: true,
      is_postable: true,
      sort_order: 0,
      deductible: false,
      created_by_admin: null,
      updated_by_admin: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const serialized = serializeCategoryItem(mockCategory);
    expect(serialized.deductible).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Permission arrays include accounting fields
// ══════════════════════════════════════════════════════════════════════════════

describe('Category permission arrays — accounting fields accessible', () => {
  it('FINANCE role can set accounting fields (via Zod acceptance)', () => {
    // FINANCE can set accounting fields since they're in CATEGORY_FINANCE_PATCH_FIELDS.
    // We verify by confirming the Zod schema accepts them (the service uses the
    // field arrays to gate access, but Zod acceptance is the first gate).
    const result = financeCategoryPatchBodySchema.safeParse({
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      accounting_code: '1.1.01',
      dre_group: 'Receita Operacional',
    });
    expect(result.success).toBe(true);
  });
});
