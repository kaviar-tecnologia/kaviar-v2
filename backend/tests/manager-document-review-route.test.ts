import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    operator_profiles: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  auditMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    req.admin = { id: 'super-admin-id', role: 'SUPER_ADMIN', email: 'admin@example.com' }; next();
  },
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../src/utils/audit', () => ({
  audit: auditMock,
  auditCtx: () => ({ adminId: 'super-admin-id', adminEmail: 'admin@example.com', ip: '127.0.0.1' }),
}));

import payoutsRouter from '../src/routes/admin-payouts';

const app = express();
app.use(express.json());
app.use('/api/admin/territorial-payouts', payoutsRouter);
const url = '/api/admin/territorial-payouts/operators/profile-id';
const address = 'Rua Exemplo, 123, Centro, Rio de Janeiro/RJ, CEP 20000-000';
const initial = () => ({
  id: 'profile-id', admin_id: 'manager-id', territory_id: 'territory-id',
  relationship_type: 'territorial_manager', recipient_type: 'individual',
  full_name: 'Gestora Exemplo', email: 'gestora@example.com', phone: '21999990000',
  document_cpf: '52998224725', address, pix_key: null, pix_key_type: null,
  document_status: 'pending', contract_status: 'pending', is_active: false,
  updated_at: new Date('2026-01-01T00:00:00Z'),
});
const confirmed = Array(8).fill(true);

describe('territorial manager manual document review endpoint', () => {
  const updateMany = vi.fn();
  const txFindUnique = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.operator_profiles.findUnique.mockResolvedValue(initial());
    updateMany.mockResolvedValue({ count: 1 });
    txFindUnique.mockResolvedValue({ ...initial(), document_status: 'verified' });
    prismaMock.$transaction.mockImplementation(async (fn: any) =>
      fn({ operator_profiles: { updateMany, findUnique: txFindUnique } }));
  });

  it('refuses a valid checklist if the CPF or address is missing', async () => {
    prismaMock.operator_profiles.findUnique.mockResolvedValue({ ...initial(), document_cpf: null, address: null });
    const res = await request(app).patch(url).send({
      document_status: 'verified', verification_confirmations: confirmed,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MANAGER_DOCUMENT_REVIEW_INCOMPLETE');
    expect(res.body.missing_fields).toEqual(expect.arrayContaining(['cpf', 'address']));
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a direct API request without eight explicit confirmations', async () => {
    const res = await request(app).patch(url).send({ document_status: 'verified' });
    expect(res.status).toBe(409);
    expect(res.body.missing_fields).toContain('verification_confirmations');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('allows only the document status change after complete data and manual attestations', async () => {
    const res = await request(app).patch(url).send({
      document_status: 'verified', verification_confirmations: confirmed,
    });
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'profile-id', document_status: 'pending', document_cpf: '52998224725',
        address, is_active: false,
      }),
      data: expect.objectContaining({
        document_status: 'verified', verified_by: 'super-admin-id',
      }),
    });
    const updates = updateMany.mock.calls[0][0].data;
    expect(updates).not.toHaveProperty('is_active');
    expect(updates).not.toHaveProperty('contract_status');
    expect(updates).not.toHaveProperty('pix_key');
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain('52998224725');
    expect(JSON.stringify(auditMock.mock.calls)).not.toContain(address);
  });

  it('rejects a concurrent change instead of verifying a stale identity', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).patch(url).send({
      document_status: 'verified', verification_confirmations: confirmed,
    });
    expect(res.status).toBe(409);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
