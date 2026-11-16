import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { randomInt, randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

vi.hoisted(() => {
  process.env.ADMIN_JWT_SECRET = 'synthetic-regularization-test-secret';
});

import { prisma } from '../src/lib/prisma';
import router from '../src/routes/admin-manager-regularization';
import { executeRegularization, previewRegularization } from '../src/services/territory/manager-regularization';

const enabled = process.env.RUN_MANAGER_PORTAL_PG_INTEGRATION === '1';
const app = express();
app.use(express.json());
app.use('/regularization', router);

describe.skipIf(!enabled)('manager regularization with disposable PostgreSQL', () => {
  const suffix = randomUUID();
  const ids = {
    actor: `central-${suffix}`, a: `manager-a-${suffix}`, b: `manager-b-${suffix}`,
    c: `manager-c-${suffix}`, d: `manager-d-${suffix}`, inactive: `inactive-${suffix}`, territory: `territory-${suffix}`,
    aProfile: `profile-a-${suffix}`, bProfile: `profile-b-${suffix}`,
    cProfile: `profile-c-${suffix}`, dProfile: `profile-d-${suffix}`, inactiveProfile: `profile-i-${suffix}`,
  };
  const existingCode = `OLD${suffix.slice(0, 5)}`;
  const phonePrefix = `219${randomInt(1000000, 10000000)}`;
  const selections = [
    { adminId: ids.a, assignment: true, referral: true },
    { adminId: ids.b, assignment: true, referral: true },
  ];
  let token: string;
  let managerToken: string;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || '');
    if (url.hostname !== '127.0.0.1' || url.port !== '65432' || url.pathname !== '/manager_portal_test') {
      throw new Error('Tests require the dedicated disposable PostgreSQL database.');
    }
    const [server] = await prisma.$queryRaw<{ path: string }[]>`SELECT current_setting('data_directory') AS path`;
    if (!server.path.endsWith('/files/manager-portal-test-pg')) throw new Error('Refusing non-disposable database.');
    await prisma.admins.createMany({ data: [
      { id: ids.actor, name: 'Central', email: `central-${suffix}@example.test`, password: 'synthetic', role: 'SUPER_ADMIN' },
      { id: ids.a, name: 'Gestora A', email: `a-${suffix}@example.test`, password: 'synthetic', role: 'TERRITORIAL_MANAGER', phone: `${phonePrefix}1` },
      { id: ids.b, name: 'Gestor B', email: `b-${suffix}@example.test`, password: 'synthetic', role: 'TERRITORIAL_MANAGER', phone: `${phonePrefix}2` },
      { id: ids.c, name: 'Gestor C', email: `c-${suffix}@example.test`, password: 'synthetic', role: 'TERRITORIAL_MANAGER', phone: `${phonePrefix}3` },
      { id: ids.d, name: 'Gestor D', email: `d-${suffix}@example.test`, password: 'synthetic', role: 'TERRITORIAL_MANAGER', phone: `${phonePrefix}4` },
      { id: ids.inactive, name: 'Gestor Inativo', email: `i-${suffix}@example.test`, password: 'synthetic', role: 'TERRITORIAL_MANAGER', is_active: false },
    ] });
    await prisma.operational_territories.create({
      data: { id: ids.territory, name: `Território ${suffix}`, level: 'region' },
    });
    await prisma.admin_territory_access.createMany({ data: [ids.a, ids.b, ids.c, ids.d, ids.inactive].map(admin_id => ({
      admin_id, territory_id: ids.territory, access_level: 'full',
    })) });
    await prisma.operator_profiles.createMany({ data: [
      { id: ids.aProfile, admin_id: ids.a, territory_id: ids.territory, display_name: 'Gestora A', relationship_type: 'territorial_manager', contract_status: 'signed', terms_version: 'v1.0', contract_url: 'historical.pdf' },
      { id: ids.bProfile, admin_id: ids.b, territory_id: ids.territory, display_name: 'Gestor B', relationship_type: 'territorial_manager' },
      { id: ids.cProfile, admin_id: ids.c, territory_id: ids.territory, display_name: 'Gestor C', relationship_type: 'territorial_manager' },
      { id: ids.dProfile, admin_id: ids.d, territory_id: ids.territory, display_name: 'Gestor D', relationship_type: 'territorial_manager' },
      { id: ids.inactiveProfile, admin_id: ids.inactive, territory_id: ids.territory, display_name: 'Gestor Inativo', relationship_type: 'territorial_manager' },
    ] });
    await prisma.referral_agents.create({ data: {
      name: 'Gestora A', phone: `${phonePrefix}1`, email: `operator:${ids.a}`, referral_code: existingCode,
    } });
    token = jwt.sign({ userId: ids.actor, userType: 'ADMIN' }, 'synthetic-regularization-test-secret');
    managerToken = jwt.sign({ userId: ids.a, userType: 'ADMIN' }, 'synthetic-regularization-test-secret');
  });

  afterAll(async () => {
    delete process.env.MANAGER_REGULARIZATION_EXECUTION_ENABLED;
    await prisma.$disconnect();
  });

  it('requires a superadmin and defaults to a non-mutating preview', async () => {
    expect((await request(app).post('/regularization').send({ managers: selections })).status).toBe(401);
    expect((await request(app).post('/regularization').set('Authorization', `Bearer ${managerToken}`).send({ managers: selections })).status).toBe(403);
    const response = await request(app).post('/regularization').set('Authorization', `Bearer ${token}`).send({ managers: selections });
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('preview');
    expect(response.body.report.managers).toEqual(expect.arrayContaining([
      expect.objectContaining({ adminId: ids.a, assignment: 'create', referral: 'preserve', referralCode: existingCode, hasHistoricalContract: true }),
      expect.objectContaining({ adminId: ids.b, assignment: 'create', referral: 'create_agent' }),
    ]));
    expect(await prisma.territory_manager_assignments.count({ where: { admin_id: { in: [ids.a, ids.b] } } })).toBe(0);
    expect((await request(app).post('/regularization').set('Authorization', `Bearer ${token}`)
      .send({ mode: 'execute', managers: selections, fingerprint: response.body.report.fingerprint, reason: 'Regularização aprovada' })).status).toBe(403);
  });

  it('creates only pending assignments, preserves history and atomically audits before and after', async () => {
    process.env.MANAGER_REGULARIZATION_EXECUTION_ENABLED = 'true';
    const before = await previewRegularization(prisma, selections);
    const response = await request(app).post('/regularization').set('Authorization', `Bearer ${token}`)
      .send({ mode: 'execute', managers: selections, fingerprint: before.fingerprint, reason: 'Regularização aprovada' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.before.fingerprint).toBe(before.fingerprint);
    expect(response.body.after.managers).toEqual(expect.arrayContaining([
      expect.objectContaining({ adminId: ids.a, assignment: 'preserve', referral: 'preserve', referralCode: existingCode }),
      expect.objectContaining({ adminId: ids.b, assignment: 'preserve', referral: 'preserve' }),
    ]));
    const assignments = await prisma.territory_manager_assignments.findMany({ where: { admin_id: { in: [ids.a, ids.b] } } });
    expect(assignments).toHaveLength(2);
    expect(assignments.every(a => a.status === 'pending_approval')).toBe(true);
    expect((await prisma.operator_profiles.findUniqueOrThrow({ where: { id: ids.aProfile } })))
      .toMatchObject({ is_active: false, contract_status: 'signed', contract_url: 'historical.pdf', terms_version: 'v1.0' });
    const agent = await prisma.referral_agents.findFirstOrThrow({ where: { email: `operator:${ids.b}` } });
    expect(agent.referral_code).toMatch(/^TERR[0-9A-HJKMNP-Z]{4}$/);
    expect(agent.terms_accepted_at).toBeNull();
    const audit = await prisma.$queryRaw<{ action: string }[]>`
      SELECT action FROM admin_audit_logs WHERE new_value->>'runId' = ${response.body.runId}
        OR entity_id = ${response.body.runId}
    `;
    expect(audit.map(a => a.action).sort()).toEqual([
      'manager_regularization_assignment', 'manager_regularization_assignment',
      'manager_regularization_referral', 'manager_regularization_run',
    ]);
    const stale = await request(app).post('/regularization').set('Authorization', `Bearer ${token}`)
      .send({ mode: 'execute', managers: selections, fingerprint: before.fingerprint, reason: 'Regularização aprovada' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('STALE_PREVIEW');
    const after = await previewRegularization(prisma, selections);
    await executeRegularization(prisma, ids.actor, selections, after.fingerprint, 'Regularização aprovada');
    expect(await prisma.territory_manager_assignments.count({ where: { admin_id: { in: [ids.a, ids.b] } } })).toBe(2);
    expect(await prisma.referral_agents.count({ where: { email: `operator:${ids.b}` } })).toBe(1);
  });

  it('rejects inactive and duplicated selections', async () => {
    const inactive = [{ adminId: ids.inactive, assignment: true, referral: false }];
    const preview = await previewRegularization(prisma, inactive);
    expect(preview.managers[0].blockers).toContain('inactive_or_invalid_manager');
    await expect(executeRegularization(prisma, ids.actor, inactive, preview.fingerprint, 'Regularização aprovada'))
      .rejects.toMatchObject({ code: 'BLOCKED' });
    await expect(previewRegularization(prisma, [inactive[0], inactive[0]])).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  });

  it('rejects stale approvals, phone collisions and invalid operators', async () => {
    const chosen = [{ adminId: ids.c, assignment: true, referral: true }];
    const before = await previewRegularization(prisma, chosen);
    await prisma.admins.update({ where: { id: ids.c }, data: { phone: `${phonePrefix}2` } });
    const conflict = await previewRegularization(prisma, chosen);
    expect(conflict.managers[0].blockers).toContain('referral_phone_conflict');
    await expect(executeRegularization(prisma, ids.actor, chosen, before.fingerprint, 'Regularização aprovada'))
      .rejects.toMatchObject({ code: 'STALE_PREVIEW' });
    await expect(executeRegularization(prisma, ids.a, chosen, conflict.fingerprint, 'Regularização aprovada'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await prisma.admins.update({ where: { id: ids.c }, data: { phone: `${phonePrefix}3` } });
  });

  it('refuses to execute without the database uniqueness guards', async () => {
    const chosen = [{ adminId: ids.c, assignment: true, referral: true }];
    const preview = await previewRegularization(prisma, chosen);
    await prisma.$executeRaw`ALTER INDEX tma_pending_admin_territory_unique RENAME TO manager_test_hidden_index`;
    try {
      await expect(executeRegularization(prisma, ids.actor, chosen, preview.fingerprint, 'Regularização aprovada'))
        .rejects.toMatchObject({ code: 'DATABASE_GUARDS_MISSING' });
    } finally {
      await prisma.$executeRaw`ALTER INDEX manager_test_hidden_index RENAME TO tma_pending_admin_territory_unique`;
    }
    expect(await prisma.territory_manager_assignments.count({ where: { admin_id: ids.c } })).toBe(0);
  });

  it('rolls back all changes when audit persistence is unavailable', async () => {
    const chosen = [{ adminId: ids.c, assignment: true, referral: true }];
    const preview = await previewRegularization(prisma, chosen);
    await prisma.$executeRaw`ALTER TABLE admin_audit_logs RENAME TO manager_regularization_audit_unavailable`;
    try {
      await expect(executeRegularization(prisma, ids.actor, chosen, preview.fingerprint, 'Regularização aprovada')).rejects.toThrow();
    } finally {
      await prisma.$executeRaw`ALTER TABLE manager_regularization_audit_unavailable RENAME TO admin_audit_logs`;
    }
    expect(await prisma.territory_manager_assignments.count({ where: { admin_id: ids.c } })).toBe(0);
    expect(await prisma.referral_agents.count({ where: { email: `operator:${ids.c}` } })).toBe(0);
  });

  it('serializes competing executions and rejects duplicate assignments and operator agents at database level', async () => {
    const chosen = [{ adminId: ids.c, assignment: true, referral: true }];
    const preview = await previewRegularization(prisma, chosen);
    const attempts = await Promise.allSettled([
      executeRegularization(prisma, ids.actor, chosen, preview.fingerprint, 'Regularização aprovada'),
      executeRegularization(prisma, ids.actor, chosen, preview.fingerprint, 'Regularização aprovada'),
    ]);
    expect(attempts.filter(a => a.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(a => a.status === 'rejected')).toHaveLength(1);
    expect(await prisma.territory_manager_assignments.count({ where: { admin_id: ids.c, status: 'pending_approval' } })).toBe(1);
    expect(await prisma.referral_agents.count({ where: { email: `operator:${ids.c}` } })).toBe(1);
    await expect(prisma.territory_manager_assignments.create({ data: {
      admin_id: ids.c, territory_id: ids.territory, status: 'pending_approval', started_at: new Date(), created_by: ids.actor,
    } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.referral_agents.create({ data: {
      name: 'Outra', phone: `${phonePrefix}5`, email: `operator:${ids.c}`,
    } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.territory_manager_assignments.count({ where: { territory_id: ids.territory, status: 'pending_approval' } })).toBe(3);
  });

  it('prevents a simultaneous legacy writer from duplicating the same pending assignment', async () => {
    const chosen = [{ adminId: ids.d, assignment: true, referral: false }];
    const preview = await previewRegularization(prisma, chosen);
    const attempts = await Promise.allSettled([
      executeRegularization(prisma, ids.actor, chosen, preview.fingerprint, 'Regularização aprovada'),
      prisma.territory_manager_assignments.create({ data: {
        admin_id: ids.d, territory_id: ids.territory, operator_profile_id: ids.dProfile,
        status: 'pending_approval', started_at: new Date(), created_by: ids.actor,
      } }),
    ]);
    expect(attempts.filter(a => a.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.territory_manager_assignments.count({ where: { admin_id: ids.d, territory_id: ids.territory, status: 'pending_approval' } })).toBe(1);
  });
});
