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

  it('offers compact mobile cards while keeping the full desktop table', () => {
    expect(payables).toContain("display: { xs: 'grid', lg: 'none' }");
    expect(payables).toContain("display: { xs: 'none', lg: 'block' }");
    expect(payables).toContain('Vencimento original:');
    expect(payables).toContain('Empresa não identificada');
    expect(payables).toContain("onClick={() => handleObligationDownload(o.id, 'boleto')}");
    expect(payables).toContain("onClick={() => openPayDialog(o)}");
    expect(payables).toContain("overflowX: 'auto'");
    expect(payables).toContain("'& .MuiTableCell-root': { color: '#0F172A'");
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
