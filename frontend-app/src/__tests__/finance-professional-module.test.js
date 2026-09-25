/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const financeHome = readFileSync(resolve(__dirname, '../pages/admin/FinanceiroPage.jsx'), 'utf8');
const receivables = readFileSync(resolve(__dirname, '../pages/admin/FinanceReceivablesPage.jsx'), 'utf8');
const treasury = readFileSync(resolve(__dirname, '../pages/admin/FinanceTreasuryPage.jsx'), 'utf8');
const service = readFileSync(resolve(__dirname, '../services/adminFinanceService.js'), 'utf8');
const adminApp = readFileSync(resolve(__dirname, '../components/admin/AdminApp.jsx'), 'utf8');

describe('professional finance module', () => {
  it('exposes a unified finance operations hub', () => {
    expect(financeHome).toContain('Central Financeira');
    expect(financeHome).toContain('Receita realizada');
    expect(financeHome).toContain('Contas a receber');
    expect(financeHome).toContain('Contas a pagar');
    expect(financeHome).toContain('Tesouraria');
    expect(financeHome).toContain('Políticas');
    expect(financeHome).toContain('Contador');
  });

  it('registers protected receivables and treasury routes', () => {
    expect(adminApp).toContain('FinanceReceivablesPage');
    expect(adminApp).toContain('FinanceTreasuryPage');
    expect(adminApp).toContain('path="/financeiro/contas-a-receber"');
    expect(adminApp).toContain('path="/financeiro/tesouraria"');
    expect(adminApp).toContain("allowedRoles={['SUPER_ADMIN', 'FINANCE']}");
  });

  it('receivables workspace uses the canonical ledger and RECEIVABLE filter', () => {
    expect(receivables).toContain("transaction_type: 'RECEIVABLE'");
    expect(receivables).toContain("direction: 'IN'");
    expect(receivables).toContain('listFinanceTransactions');
    expect(receivables).toContain('fetchDashboardSummary');
  });

  it('treasury workspace is read-only and uses existing outbound finance APIs', () => {
    expect(treasury).toContain('fetchFinanceTreasuryHealth');
    expect(treasury).toContain('fetchFinanceProviderHealth');
    expect(treasury).toContain('listOutboundObligations');
    expect(treasury).toContain('listOutboundPayouts');
    expect(treasury).not.toContain('reconciliation/run');
    expect(treasury).not.toContain('method:');
  });

  it('finance service exposes professional operations endpoints', () => {
    expect(service).toContain('/obligations/summary');
    expect(service).toContain('/outbound/treasury/health');
    expect(service).toContain('/outbound/provider-health');
    expect(service).toContain('/outbound/obligations');
    expect(service).toContain('/outbound/payouts');
  });
});
