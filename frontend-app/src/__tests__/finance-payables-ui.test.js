/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const payables = readFileSync(resolve(__dirname, '../pages/admin/FinancePayablesPage.jsx'), 'utf8');

describe('Finance payables visual and status contract', () => {
  it('uses a readable light surface independent of inherited admin theme', () => {
    expect(payables).toContain("minHeight: '100vh', bgcolor: '#F6F8FB', color: '#0F172A'");
    expect(payables).toContain("color: '#475569'");
    expect(payables).toContain("'& .MuiInputBase-root': { bgcolor: '#FFFFFF', color: '#0F172A' }");
  });

  it('separates payment evidence from verified/conciliated obligations', () => {
    expect(payables).toContain('Em conferência');
    expect(payables).toContain('awaiting_verification');
    expect(payables).toContain('Verificadas / conciliadas');
    expect(payables).toContain('proof_rejected');
    expect(payables).toContain("case 'PAYMENT_REPORTED': return null");
    expect(payables).not.toContain('>Pagas</Typography>');
  });
});
