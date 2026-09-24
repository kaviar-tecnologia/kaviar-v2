/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const adminApp = readFileSync(resolve(__dirname, '../components/admin/AdminApp.jsx'), 'utf8');
const compliance = readFileSync(resolve(__dirname, '../pages/admin/ComplianceManagement.jsx'), 'utf8');
const communities = readFileSync(resolve(__dirname, '../pages/admin/CommunitiesManagement.jsx'), 'utf8');
const leaders = readFileSync(resolve(__dirname, '../pages/admin/CommunityLeadersPanel.jsx'), 'utf8');
const accountingPortal = readFileSync(resolve(__dirname, '../pages/admin/accounting/AccountingPortalPage.jsx'), 'utf8');
const documentTypes = readFileSync(resolve(__dirname, '../pages/admin/accounting/DocumentTypesTab.jsx'), 'utf8');

describe('Admin module contract — restored navigation only', () => {
  it('restores Feature Flags and Match Monitor without enabling Beta Monitor', () => {
    expect(adminApp).toContain("title: 'Feature Flags'");
    expect(adminApp).toContain("to: '/admin/feature-flags'");
    expect(adminApp).toContain("title: 'Match Monitor'");
    expect(adminApp).toContain("to: '/admin/match-monitor'");
    expect(adminApp).toContain('// import BetaMonitor');
    expect(adminApp).toContain('Beta Monitor — HIBERNADO');
  });

  it('does not expose the low-level outbound payment API as a dashboard module', () => {
    expect(adminApp).not.toContain("to: '/admin/finance/outbound'");
  });
});

describe('Operational compliance contract', () => {
  it('registers the operational compliance page with the existing read roles', () => {
    expect(adminApp).toContain("path=\"/compliance-operacional\"");
    expect(adminApp).toContain("allowedRoles={['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']}");
  });

  it('uses only canonical existing compliance list endpoints', () => {
    expect(compliance).toContain('/api/admin/compliance/documents/pending');
    expect(compliance).toContain('/api/admin/compliance/documents/expiring');
    expect(compliance).not.toContain('/api/admin/compliance/metrics');
  });
});

describe('Community leaders contract', () => {
  it('keeps leaders under Communities instead of creating a main dashboard card', () => {
    expect(communities).toContain('to="/admin/community-leaders"');
    expect(adminApp).toContain('path="/community-leaders"');
    expect(adminApp).not.toContain("title: 'Lideranças Comunitárias'");
  });

  it('uses current KAVIAR admin token and current neighborhood endpoint', () => {
    expect(leaders).toContain("localStorage.getItem('kaviar_admin_token')");
    expect(leaders).toContain("${API_BASE_URL}/api/neighborhoods");
    expect(leaders).not.toContain("localStorage.getItem('adminToken')");
    expect(leaders).not.toContain('/api/admin/neighborhoods');
  });
});

describe('Accounting document type contract', () => {
  it('adds document types inside the existing Super Admin accounting portal', () => {
    expect(accountingPortal).toContain("'tipos-documentos'");
    expect(accountingPortal).toContain('<Tab label="Tipos de Documentos" />');
    expect(accountingPortal).toContain('<DocumentTypesTab />');
  });

  it('uses the canonical document-types API and preserves immutable code on edit', () => {
    expect(documentTypes).toContain('/api/admin/accounting/document-types');
    expect(documentTypes).toContain("disabled={Boolean(dialog.editingId)}");
    expect(documentTypes).toContain('O código não pode ser alterado após a criação.');
    expect(documentTypes).not.toContain('adminApi.delete(');
  });
});
