/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('ANGEL_VIEWER retirement — frontend guardrails', () => {
  const adminApp = readFileSync(resolve(__dirname, '../components/admin/AdminApp.jsx'), 'utf8');
  const protectedRoute = readFileSync(resolve(__dirname, '../components/admin/ProtectedAdminRoute.jsx'), 'utf8');
  const payouts = readFileSync(resolve(__dirname, '../pages/admin/TerritorialPayoutsPage.jsx'), 'utf8');
  const invites = readFileSync(resolve(__dirname, '../pages/admin/InvestorInvites.jsx'), 'utf8');
  const authHook = readFileSync(resolve(__dirname, '../hooks/useAdminAuth.js'), 'utf8');

  it('bloqueia fail-closed a role aposentada no guard central', () => {
    expect(protectedRoute).toContain("const RETIRED_ROLES = ['ANGEL_VIEWER']");
    expect(protectedRoute).toContain("RETIRED_ROLES.includes(admin.role)");
    expect(protectedRoute).toContain("localStorage.removeItem('kaviar_admin_token')");
    expect(protectedRoute).toContain("localStorage.removeItem('kaviar_admin_data')");
    expect(protectedRoute).toContain('to="/admin/login"');
  });

  it('não expõe ANGEL_VIEWER em cards ou rotas do AdminApp', () => {
    expect(adminApp).not.toContain('ANGEL_VIEWER');
    expect(adminApp).toContain("allowedRoles={['INVESTOR_VIEW', 'SUPER_ADMIN']}");
  });

  it('mantém convites novos exclusivamente como INVESTOR_VIEW', () => {
    expect(invites).toContain("const role = 'INVESTOR_VIEW'");
    expect(invites).not.toContain('ANGEL_VIEWER');
  });

  it('não usa ANGEL_VIEWER como fallback de acesso territorial', () => {
    expect(payouts).toContain("role: d.data.role || 'TERRITORIAL_OPERATOR'");
    expect(payouts).not.toContain("'ANGEL_VIEWER'");
  });

  it('remove helper legado isAngelViewer do hook de autenticação', () => {
    expect(authHook).not.toContain('isAngelViewer');
    expect(authHook).not.toContain('ANGEL_VIEWER');
  });
});
