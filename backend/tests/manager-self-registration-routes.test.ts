import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';

const { prismaMock, adminSession, auditMock } = vi.hoisted(() => ({
  prismaMock: { operator_profiles: { findUnique: vi.fn(), updateMany: vi.fn() } },
  adminSession: { id: 'manager-test-id', role: 'TERRITORIAL_MANAGER', email: 'gestora@example.com' },
  auditMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => { req.admin = adminSession; next(); },
}));
vi.mock('../src/utils/audit', () => ({
  audit: auditMock,
  auditCtx: () => ({ adminId: adminSession.id, adminEmail: adminSession.email, ip: '127.0.0.1' }),
}));

import managerProfileRouter from '../src/routes/admin-my-operator-profile';

const app = express();
app.use(express.json());
app.use('/api/admin/my-operator-profile', managerProfileRouter);
const path = '/api/admin/my-operator-profile/registration';
const address = 'Rua Exemplo, 123, Centro, Rio de Janeiro/RJ, CEP 20000-000';
const profile = () => ({
  id: 'profile-test-id',
  admin_id: adminSession.id,
  full_name: 'Gestora Exemplo',
  display_name: 'Gestora Exemplo',
  email: adminSession.email,
  phone: '21999990000',
  territory_id: 'territory-test-id',
  territory: { name: 'Território Exemplo' },
  relationship_type: 'territorial_manager',
  recipient_type: 'individual',
  document_status: 'pending',
  contract_status: 'pending',
  contract_url: null,
  contract_template_url: null,
  is_active: false,
  updated_at: new Date('2026-01-01T00:00:00Z'),
  document_cpf: null,
  address: null,
  document_rg: null,
  pix_key: null,
  pix_key_type: null,
  admin: { id: adminSession.id, role: 'TERRITORIAL_MANAGER', is_active: true,
    name: 'Gestora Exemplo', email: adminSession.email, phone: '21999990000' },
});

describe('manager registration route and review boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminSession.role = 'TERRITORIAL_MANAGER';
    prismaMock.operator_profiles.findUnique.mockResolvedValue(profile());
    prismaMock.operator_profiles.updateMany.mockResolvedValue({ count: 1 });
  });

  it('scopes GET to the authenticated manager and never exposes CPF or Pix in full', async () => {
    const stored = { ...profile(), document_cpf: '52998224725', address,
      pix_key: 'gestora@example.com', pix_key_type: 'email' };
    prismaMock.operator_profiles.findUnique.mockResolvedValue(stored);
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(prismaMock.operator_profiles.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { admin_id: adminSession.id },
    }));
    expect(res.body.data.cpfMasked).toBe('***.***.***-25');
    expect(res.body.data.pixMasked).toBe('****.com');
    expect(JSON.stringify(res.body)).not.toContain('52998224725');
    expect(JSON.stringify(res.body)).not.toContain('gestora@example.com","pix_key');
  });

  it('blocks other roles and incorrect profile relationship', async () => {
    adminSession.role = 'TERRITORIAL_OPERATOR';
    expect((await request(app).get(path)).status).toBe(403);
    expect(prismaMock.operator_profiles.findUnique).not.toHaveBeenCalled();
    adminSession.role = 'TERRITORIAL_MANAGER';
    prismaMock.operator_profiles.findUnique.mockResolvedValue({
      ...profile(), relationship_type: 'territorial_operator',
    });
    expect((await request(app).patch(path).send({
      document_cpf: '52998224725', address, confirm_identity: true,
    })).status).toBe(404);
    expect(prismaMock.operator_profiles.updateMany).not.toHaveBeenCalled();
  });

  it('rejects status injection and invalid CPF without touching the database', async () => {
    const injected = await request(app).patch(path).send({
      document_cpf: '52998224725', address, confirm_identity: true,
      document_status: 'verified', is_active: true, admin_id: 'another-id',
    });
    expect(injected.status).toBe(400);
    const invalid = await request(app).patch(path).send({
      document_cpf: '11111111111', address, confirm_identity: true,
    });
    expect(invalid.status).toBe(400);
    expect(prismaMock.operator_profiles.updateMany).not.toHaveBeenCalled();
  });

  it('writes only own identity fields, leaves review pending, audits field names not PII', async () => {
    const after = { ...profile(), document_cpf: '52998224725', address };
    prismaMock.operator_profiles.findUnique
      .mockResolvedValueOnce(profile()).mockResolvedValueOnce(after);
    const res = await request(app).patch(path).send({
      document_cpf: '529.982.247-25', address, confirm_identity: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.readyForReview).toBe(true);
    expect(prismaMock.operator_profiles.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        admin_id: adminSession.id,
        document_status: 'pending', contract_status: 'pending', is_active: false,
        contract_url: null, contract_template_url: null,
      }),
      data: { document_cpf: '52998224725', address },
    });
    const raw = JSON.stringify(auditMock.mock.calls);
    expect(raw).not.toContain('52998224725');
    expect(raw).not.toContain(address);
  });

  it('blocks edits when a contract already exists or stale data wins the race', async () => {
    prismaMock.operator_profiles.findUnique.mockResolvedValue({ ...profile(), contract_template_url: 'model.pdf' });
    expect((await request(app).patch(path).send({
      document_cpf: '52998224725', address, confirm_identity: true,
    })).status).toBe(409);
    prismaMock.operator_profiles.findUnique.mockResolvedValue(profile());
    prismaMock.operator_profiles.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).patch(path).send({
      document_cpf: '52998224725', address, confirm_identity: true,
    })).status).toBe(409);
  });

  it('requires backend confirmation for documentary verification, not just UI checkboxes', () => {
    const route = readFileSync('src/routes/admin-payouts.ts', 'utf8');
    const ui = readFileSync('../frontend-app/src/pages/admin/TerritorialPayoutsPage.jsx', 'utf8');
    expect(route).toContain('managerDocumentVerificationMissingFields({ ...existing, ...updates }, verification_confirmations)');
    expect(route).toContain("code: 'MANAGER_DOCUMENT_REVIEW_INCOMPLETE'");
    expect(ui).toContain("verification_confirmations: verifyChecks");
  });
});
