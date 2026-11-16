import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => {
  process.env.ADMIN_JWT_SECRET = 'isolated-admin-secret';
  process.env.JWT_SECRET = 'isolated-other-secret';
  delete process.env.WA_TPL_CONTRACT_AVAILABLE;
  return {
    prisma: {
      admins: { findUnique: vi.fn() },
      operator_profiles: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      admin_territory_access: { findFirst: vi.fn(), findMany: vi.fn() },
      operational_territories: { findMany: vi.fn() },
      neighborhoods: { findMany: vi.fn() },
      territory_manager_assignments: { findFirst: vi.fn(), findMany: vi.fn() },
      contract_submissions: { updateMany: vi.fn(), create: vi.fn() },
      referral_agents: { findFirst: vi.fn() },
      referrals: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
    send: vi.fn(),
    presign: vi.fn(),
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => ({ compare: vi.fn().mockResolvedValue(true) }));
vi.mock('../src/utils/audit', () => ({
  audit: vi.fn(),
  auditCtx: (req: any) => ({ adminId: req.admin.id, adminEmail: req.admin.email, ip: '127.0.0.1' }),
}));
vi.mock('../src/config/s3-upload', () => ({
  uploadToS3: { single: () => (_req: any, _res: any, next: any) => next() },
  getPresignedUrl: mocks.presign,
}));
vi.mock('multer-s3', () => ({
  default: Object.assign(() => ({}), { AUTO_CONTENT_TYPE: () => {} }),
}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = mocks.send; },
  PutObjectCommand: class { constructor(public input: unknown) {} },
}));

import { AuthService } from '../src/modules/auth/service';
import profileRouter from '../src/routes/admin-my-operator-profile';
import payoutsRouter from '../src/routes/admin-payouts';
import referralsRouter from '../src/routes/admin-operator-referrals';
import { authenticateAdmin } from '../src/middlewares/auth';
import { applyTerritoryScope } from '../src/middlewares/territory-scope';
import { requireTerritoryScope } from '../src/middlewares/require-territory-scope';

const app = express();
app.use(express.json());
app.use('/profile', profileRouter);
app.use('/central', payoutsRouter);
app.use('/referrals', referralsRouter);
app.get('/scope', authenticateAdmin, applyTerritoryScope, requireTerritoryScope, (_req, res) => res.json({ success: true }));

const now = new Date('2026-01-01T00:00:00Z');
const admin = (id: string, role = 'TERRITORIAL_MANAGER') => ({
  id, name: id, email: `${id}@example.test`, role, is_active: true,
  must_change_password: false, password_changed_at: null, password: 'synthetic',
});
const territory = {
  id: 'territory-a', name: 'Território A', city_name: 'Cidade', uf: 'RJ',
  updated_at: now, level: 'region',
  neighborhoods: [{ id: 'n1', name: 'Bairro A', is_active: true, updated_at: now }],
};
const makeProfile = () => ({
  id: 'profile-a', admin_id: 'manager-a', territory_id: territory.id,
  relationship_type: 'territorial_manager', recipient_type: 'individual',
  display_name: 'Gestora A', full_name: 'Gestora A', email: 'manager-a@example.test',
  phone: '21999990000', address: 'Rua Exemplo, 123, Centro, Cidade/RJ, CEP 20000-000',
  document_cpf: null as string | null, document_rg: null, pix_key: null, pix_key_type: null,
  document_status: 'pending', contract_status: 'pending', contract_url: null as string | null,
  contract_template_url: null as string | null, contract_signed_at: null as Date | null,
  terms_version: null as string | null, is_active: false, updated_at: now, created_at: now,
  admin: admin('manager-a'), territory,
});
const assignment = {
  id: 'assignment-a', territory_id: territory.id, operator_profile_id: 'profile-a',
  status: 'pending_approval', started_at: now, ended_at: null, updated_at: now,
};

describe('isolated manager contract flow', () => {
  let profile: ReturnType<typeof makeProfile>;
  let managerToken: string;
  let centralToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    profile = makeProfile();
    mocks.prisma.admins.findUnique.mockImplementation(async ({ where }: any) => {
      const id = where.id || where.email?.split('@')[0];
      return id ? admin(id, id === 'central' ? 'SUPER_ADMIN' : 'TERRITORIAL_MANAGER') : null;
    });
    mocks.prisma.operator_profiles.findUnique.mockImplementation(async ({ where }: any) =>
      where.admin_id === profile.admin_id || where.id === profile.id ? { ...profile } : null,
    );
    mocks.prisma.operator_profiles.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (where.admin_id && where.admin_id !== profile.admin_id) return { count: 0 };
      Object.assign(profile, data);
      return { count: 1 };
    });
    mocks.prisma.operator_profiles.update.mockImplementation(async ({ data }: any) => {
      Object.assign(profile, data);
      return profile;
    });
    mocks.prisma.admin_territory_access.findFirst.mockResolvedValue(null);
    mocks.prisma.admin_territory_access.findMany.mockResolvedValue([{ territory_id: 'territory-a', access_level: 'full' }]);
    mocks.prisma.operational_territories.findMany.mockResolvedValue([]);
    mocks.prisma.neighborhoods.findMany.mockResolvedValue([]);
    mocks.prisma.referral_agents.findFirst.mockResolvedValue(null);
    mocks.prisma.referrals.findMany.mockResolvedValue([]);
    mocks.prisma.territory_manager_assignments.findFirst.mockResolvedValue(null);
    mocks.prisma.territory_manager_assignments.findMany.mockResolvedValue([assignment]);
    mocks.prisma.contract_submissions.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.contract_submissions.create.mockResolvedValue({ id: 'submission-a' });
    mocks.prisma.$transaction.mockImplementation(async (callback: any) => callback(mocks.prisma));
    mocks.send.mockResolvedValue({});
    mocks.presign.mockResolvedValue('https://example.test/synthetic-pdf');
    managerToken = (await new AuthService().login('manager-a@example.test', 'synthetic')).token;
    centralToken = jwt.sign({ userId: 'central', userType: 'ADMIN' }, 'isolated-admin-secret');
  });

  it('uses the same admin secret for login and verification; rejects expired and invalid tokens', async () => {
    expect(jwt.verify(managerToken, 'isolated-admin-secret')).toBeTruthy();
    expect((await request(app).get('/profile').set('Authorization', `Bearer ${managerToken}`)).status).toBe(200);
    const expired = jwt.sign({ userId: 'manager-a' }, 'isolated-admin-secret', { expiresIn: -1 });
    expect((await request(app).get('/profile').set('Authorization', `Bearer ${expired}`)).body.code).toBe('AUTH_TOKEN_EXPIRED');
    expect((await request(app).get('/profile').set('Authorization', 'Bearer invalid')).status).toBe(401);
    expect((await request(app).get('/profile')).status).toBe(401);
  });

  it('supports registration, pending-assignment v1.2 PDF and signed upload without financial activation', async () => {
    const auth = `Bearer ${managerToken}`;
    const registration = await request(app).patch('/profile/registration').set('Authorization', auth).send({
      document_cpf: '52998224725', address: profile.address, confirm_identity: true,
    });
    expect(registration.status).toBe(200);
    expect(profile.document_status).toBe('pending');
    expect(profile.is_active).toBe(false);

    const generated = await request(app).post('/central/operators/profile-a/generate-contract-template')
      .set('Authorization', `Bearer ${centralToken}`);
    expect(generated.status, JSON.stringify(generated.body)).toBe(200);
    expect(generated.body.data).toMatchObject({
      contract_version: 'v1.2', assignment_status: 'pending_approval', financial_activation_created: false,
    });
    expect(profile.contract_status).toBe('available');
    expect(profile.is_active).toBe(false);
    expect(mocks.send.mock.calls[0][0].input.Body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get('/profile/contract-template-url').set('Authorization', auth)).status).toBe(200);

    const upload = await request(app).post('/profile/submit-contract').set('Authorization', auth)
      .attach('file', Buffer.from('%PDF-1.4\nsynthetic signed document'), { filename: 'signed.pdf', contentType: 'application/pdf' });
    expect(upload.status, JSON.stringify(upload.body)).toBe(200);
    expect(profile.contract_status).toBe('submitted');
    expect(profile.is_active).toBe(false);
    expect(mocks.prisma.contract_submissions.create.mock.calls[0][0].data.contract_version).toBe('v1.2');
    expect(mocks.prisma.territory_manager_assignments.findMany).toHaveBeenCalled();
  });

  it('does not expose another manager contract or allow a manager to generate it', async () => {
    const other = jwt.sign({ userId: 'manager-b', userType: 'ADMIN' }, 'isolated-admin-secret');
    expect((await request(app).get('/profile/contract-template-url').set('Authorization', `Bearer ${other}`)).status).toBe(404);
    expect((await request(app).post('/central/operators/profile-a/generate-contract-template').set('Authorization', `Bearer ${other}`)).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    { contract_status: 'signed', contract_url: null, contract_signed_at: now },
    { contract_status: 'available', contract_url: 'historical.pdf', contract_signed_at: null },
    { contract_status: 'submitted', contract_url: null, contract_signed_at: null },
  ])('does not replace historical or in-review contract state: %o', async state => {
    Object.assign(profile, state);
    const result = await request(app).post('/central/operators/profile-a/generate-contract-template')
      .set('Authorization', `Bearer ${centralToken}`);
    expect(result.status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.prisma.operator_profiles.updateMany).not.toHaveBeenCalled();
  });

  it('requires a single non-financial assignment before generating', async () => {
    mocks.prisma.territory_manager_assignments.findMany.mockResolvedValue([]);
    const result = await request(app).post('/central/operators/profile-a/generate-contract-template')
      .set('Authorization', `Bearer ${centralToken}`);
    expect(result.status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('distinguishes scope lookup failure from a missing assignment without widening access', async () => {
    const auth = `Bearer ${managerToken}`;
    expect((await request(app).get('/scope').set('Authorization', auth)).status).toBe(200);
    mocks.prisma.admin_territory_access.findMany.mockResolvedValueOnce([]);
    const absent = await request(app).get('/scope').set('Authorization', auth);
    expect(absent.status).toBe(403);
    expect(absent.body.code).toBe('TERRITORY_SCOPE_REQUIRED');
    mocks.prisma.admin_territory_access.findMany.mockRejectedValueOnce(new Error('synthetic outage'));
    const failed = await request(app).get('/scope').set('Authorization', auth);
    expect(failed.status).toBe(503);
    expect(failed.body.code).toBe('TERRITORY_SCOPE_UNAVAILABLE');
  });

  it('distinguishes absent, inactive and existing referral records without mutation', async () => {
    const auth = `Bearer ${managerToken}`;
    const absent = await request(app).get('/referrals').set('Authorization', auth);
    expect(absent.body.data.has_code).toBe(false);
    mocks.prisma.referral_agents.findFirst.mockResolvedValueOnce({ referral_code: 'EXISTING', is_active: false });
    const inactive = await request(app).get('/referrals').set('Authorization', auth);
    expect(inactive.body.data.message).toContain('inativo');
    mocks.prisma.referral_agents.findFirst.mockResolvedValueOnce({ id: 'agent-a', referral_code: 'EXISTING', is_active: true });
    const existing = await request(app).get('/referrals').set('Authorization', auth);
    expect(existing.body.data.referral_code).toBe('EXISTING');
  });

  it('fails closed if a concurrent change occurs while generating the template', async () => {
    profile.document_cpf = '52998224725';
    mocks.prisma.operator_profiles.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await request(app).post('/central/operators/profile-a/generate-contract-template')
      .set('Authorization', `Bearer ${centralToken}`);
    expect(result.status).toBe(409);
    expect(profile.contract_status).toBe('pending');
    expect(profile.contract_template_url).toBeNull();
  });

  it('does not create a submission if its profile changed during upload', async () => {
    profile.document_cpf = '52998224725';
    profile.contract_status = 'available';
    profile.terms_version = 'v1.2';
    profile.contract_template_url = 'synthetic-template.pdf';
    mocks.prisma.operator_profiles.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await request(app).post('/profile/submit-contract')
      .set('Authorization', `Bearer ${managerToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nsynthetic'), { filename: 'signed.pdf', contentType: 'application/pdf' });
    expect(result.status).toBe(409);
    expect(mocks.prisma.contract_submissions.create).not.toHaveBeenCalled();
    expect(profile.contract_status).toBe('available');
  });
});
