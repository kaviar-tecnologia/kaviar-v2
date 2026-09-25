/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const schema = readFileSync(resolve(__dirname, '../../../backend/prisma/schema.prisma'), 'utf8');
const migration = readFileSync(resolve(__dirname, '../../../backend/prisma/migrations/20260925172000_finance_multientity_business_units/migration.sql'), 'utf8');
const financeHome = readFileSync(resolve(__dirname, '../pages/admin/FinanceiroPage.jsx'), 'utf8');
const transactions = readFileSync(resolve(__dirname, '../pages/admin/FinanceTransactionsPage.jsx'), 'utf8');
const receivables = readFileSync(resolve(__dirname, '../pages/admin/FinanceReceivablesPage.jsx'), 'utf8');
const treasury = readFileSync(resolve(__dirname, '../pages/admin/FinanceTreasuryPage.jsx'), 'utf8');
const entityTerritories = readFileSync(resolve(__dirname, '../pages/admin/FinanceEntityTerritoriesPage.jsx'), 'utf8');

describe('finance multi-entity and business-unit foundation', () => {
  it('models legal entity ownership and independent business units', () => {
    expect(schema).toContain('model financial_business_units');
    expect(schema).toContain('model financial_entity_territory_assignments');
    expect(schema).toContain('legal_entity_id');
    expect(schema).toContain('business_unit_id');
    expect(migration).toContain("'KAVIAR_AR'");
    expect(migration).toContain("'MOBILITY'");
  });

  it('supports consolidated, per-CNPJ and per-product finance views', () => {
    expect(financeHome).toContain('Empresa / filial');
    expect(financeHome).toContain('Produto / linha de negócio');
    expect(financeHome).toContain('Consolidado — todas as empresas');
    expect(financeHome).toContain('A pagar em aberto');
  });

  it('requires entity and business unit on manual financial entries', () => {
    expect(transactions).toContain('Empresa / filial *');
    expect(transactions).toContain('Produto / linha de negócio *');
    expect(transactions).toContain('legal_entity_id: form.legal_entity_id');
    expect(transactions).toContain('business_unit_id: form.business_unit_id');
  });

  it('segments receivables and treasury without pretending provider balance is per filial', () => {
    expect(receivables).toContain('legal_entity_id');
    expect(receivables).toContain('business_unit_id');
    expect(treasury).toContain('saldo/saúde do provedor são consolidados');
    expect(treasury).toContain('Não disponível');
  });

  it('administers dated filial-to-territory responsibility', () => {
    expect(entityTerritories).toContain('Filiais e Territórios');
    expect(entityTerritories).toContain('effective_from');
    expect(entityTerritories).toContain('effective_until');
    expect(entityTerritories).toContain('Encerrar');
  });
});
