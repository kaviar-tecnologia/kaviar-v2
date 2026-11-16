import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const storage = vi.hoisted(() => {
  process.env.ADMIN_JWT_SECRET = 'local-only-manager-test-secret';
  process.env.JWT_SECRET = 'local-only-other-test-secret';
  delete process.env.WA_TPL_CONTRACT_AVAILABLE;
  return { send: vi.fn(), presign: vi.fn() };
});

vi.mock('../src/utils/audit', () => ({
  audit: vi.fn(),
  auditCtx: (req: any) => ({ adminId: req.admin.id, adminEmail: req.admin.email, ip: '127.0.0.1' }),
}));
vi.mock('../src/config/s3-upload', () => ({
  uploadToS3: { single: () => (_req: any, _res: any, next: any) => next() },
  getPresignedUrl: storage.presign,
}));
vi.mock('multer-s3', () => ({
  default: Object.assign(() => ({}), { AUTO_CONTENT_TYPE: () => {} }),
}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = storage.send; },
  PutObjectCommand: class { constructor(public input: unknown) {} },
}));

import { prisma } from '../src/lib/prisma';
import { AuthService } from '../src/modules/auth/service';
import profileRouter from '../src/routes/admin-my-operator-profile';
import payoutsRouter from '../src/routes/admin-payouts';

const app = express();
app.use(express.json());
app.use('/profile', profileRouter);
app.use('/central', payoutsRouter);

const enabled = process.env.RUN_MANAGER_PORTAL_PG_INTEGRATION === '1';

describe.skipIf(!enabled)('manager portal with disposable PostgreSQL and synthetic storage', () => {
  const suffix = randomUUID();
  const ids = {
    managerA: `manager-a-${suffix}`, managerB: `manager-b-${suffix}`, central: `central-${suffix}`,
    territoryA: `territory-a-${suffix}`, territoryB: `territory-b-${suffix}`,
    profileA: `profile-a-${suffix}`, profileB: `profile-b-${suffix}`,
  };
  const emailA = `a-${suffix}@example.test`;
  const emailB = `b-${suffix}@example.test`;
  let tokenA: string;
  let tokenB: string;
  let centralToken: string;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || '');
    if (url.hostname !== '127.0.0.1' || url.port !== '65432' || url.pathname !== '/manager_portal_test') {
      throw new Error('Integration test requires the dedicated disposable manager portal database.');
    }
    const [server] = await prisma.$queryRaw<Array<{ path: string }>>`SELECT current_setting('data_directory') AS path`;
    if (!server.path.endsWith('/files/manager-portal-test-pg')) {
      throw new Error('Integration test refused a non-disposable PostgreSQL instance.');
    }
    const password = await bcrypt.hash('synthetic-password', 10);
    await prisma.admins.createMany({ data: [
      { id: ids.managerA, name: 'Gestora A', email: emailA, password, role: 'TERRITORIAL_MANAGER' },
      { id: ids.managerB, name: 'Gestora B', email: emailB, password, role: 'TERRITORIAL_MANAGER' },
      { id: ids.central, name: 'Central', email: `central-${suffix}@example.test`, password, role: 'SUPER_ADMIN' },
    ] });
    await prisma.operational_territories.createMany({ data: [
      { id: ids.territoryA, name: `Território A ${suffix}`, level: 'region', city_name: 'Cidade', uf: 'RJ' },
      { id: ids.territoryB, name: `Território B ${suffix}`, level: 'region', city_name: 'Cidade', uf: 'RJ' },
    ] });
    await prisma.admin_territory_access.createMany({ data: [
      { admin_id: ids.managerA, territory_id: ids.territoryA },
      { admin_id: ids.managerB, territory_id: ids.territoryB },
    ] });
    await prisma.operator_profiles.createMany({ data: [
      {
        id: ids.profileA, admin_id: ids.managerA, territory_id: ids.territoryA,
        display_name: 'Gestora A', full_name: 'Gestora A', email: emailA,
        phone: '21999990000', relationship_type: 'territorial_manager', is_active: false,
      },
      {
        id: ids.profileB, admin_id: ids.managerB, territory_id: ids.territoryB,
        display_name: 'Gestora B', full_name: 'Gestora B', email: emailB,
        phone: '21999990001', relationship_type: 'territorial_manager', is_active: false,
        contract_template_url: 'synthetic-b.pdf',
      },
    ] });
    await prisma.territory_manager_assignments.create({
      data: {
        territory_id: ids.territoryA, admin_id: ids.managerA, operator_profile_id: ids.profileA,
        status: 'pending_approval', started_at: new Date(), created_by: ids.central,
      },
    });
    tokenA = (await new AuthService().login(emailA, 'synthetic-password')).token;
    tokenB = (await new AuthService().login(emailB, 'synthetic-password')).token;
    centralToken = jwt.sign({ userId: ids.central, userType: 'ADMIN' }, 'local-only-manager-test-secret');
    storage.send.mockResolvedValue({});
    storage.presign.mockImplementation(async (key: string) => `https://example.test/${key}`);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('persists registration, template and submitted PDF without activating finance or crossing territories', async () => {
    const authA = `Bearer ${tokenA}`;
    const registration = await request(app).patch('/profile/registration').set('Authorization', authA).send({
      document_cpf: '52998224725',
      address: 'Rua Exemplo, 123, Centro, Cidade/RJ, CEP 20000-000',
      confirm_identity: true,
    });
    expect(registration.status, JSON.stringify(registration.body)).toBe(200);
    const generated = await request(app).post(`/central/operators/${ids.profileA}/generate-contract-template`)
      .set('Authorization', `Bearer ${centralToken}`);
    expect(generated.status, JSON.stringify(generated.body)).toBe(200);
    expect(generated.body.data.financial_activation_created).toBe(false);
    const aTemplate = await request(app).get('/profile/contract-template-url').set('Authorization', authA);
    const bTemplate = await request(app).get('/profile/contract-template-url').set('Authorization', `Bearer ${tokenB}`);
    expect(aTemplate.body.data.url).toContain(ids.profileA);
    expect(bTemplate.body.data.url).toContain('synthetic-b.pdf');
    expect(bTemplate.body.data.url).not.toContain(ids.profileA);
    expect((await request(app).post(`/central/operators/${ids.profileA}/generate-contract-template`)
      .set('Authorization', `Bearer ${tokenB}`)).status).toBe(403);

    const upload = await request(app).post('/profile/submit-contract').set('Authorization', authA)
      .attach('file', Buffer.from('%PDF-1.4\nsynthetic signed document'), { filename: 'signed.pdf', contentType: 'application/pdf' });
    expect(upload.status, JSON.stringify(upload.body)).toBe(200);
    const profile = await prisma.operator_profiles.findUniqueOrThrow({ where: { id: ids.profileA } });
    const submissions = await prisma.contract_submissions.findMany({ where: { operator_profile_id: ids.profileA } });
    const assignments = await prisma.territory_manager_assignments.findMany({ where: { admin_id: ids.managerA } });
    expect(profile).toMatchObject({ contract_status: 'submitted', document_status: 'pending', is_active: false });
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({ status: 'submitted', contract_version: 'v1.2' });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].status).toBe('pending_approval');
  });
});
