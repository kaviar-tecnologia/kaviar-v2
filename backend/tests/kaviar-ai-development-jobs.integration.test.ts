import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://kaviar_test:kaviar_test@127.0.0.1:5432/kaviar_test';

const JWT_SECRET = 'kaviar-development-jobs-integration-secret';

process.env.DATABASE_URL = DB_URL;
process.env.JWT_SECRET = JWT_SECRET;
process.env.ADMIN_JWT_SECRET = JWT_SECRET;

const ids = {
  superAdmin: 'kaviar-dev-job-super-admin',
  financeAdmin: 'kaviar-dev-job-finance-admin',
};

let app: express.Express;
let prisma: any;

function tokenFor(adminId: string) {
  return jwt.sign(
    {
      userId: adminId,
      userType: 'ADMIN',
      email: `${adminId}@test.local`,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function authHeader(adminId: string) {
  return {
    Authorization: `Bearer ${tokenFor(adminId)}`,
  };
}

async function cleanupFixtures() {
  const jobs = await prisma.development_jobs.findMany({
    where: {
      OR: [
        { requested_by_admin_id: ids.superAdmin },
        { requested_by_admin_id: ids.financeAdmin },
        { confirmed_by_admin_id: ids.superAdmin },
        { confirmed_by_admin_id: ids.financeAdmin },
      ],
    },
    select: { id: true },
  });

  for (const job of jobs) {
    await prisma.$executeRaw`
      DELETE FROM admin_audit_logs
      WHERE entity_type = 'development_job'
        AND entity_id = ${job.id}
    `;
  }

  await prisma.development_jobs.deleteMany({
    where: {
      OR: [
        { requested_by_admin_id: ids.superAdmin },
        { requested_by_admin_id: ids.financeAdmin },
        { confirmed_by_admin_id: ids.superAdmin },
        { confirmed_by_admin_id: ids.financeAdmin },
      ],
    },
  });

  await prisma.admins.deleteMany({
    where: {
      id: {
        in: [ids.financeAdmin, ids.superAdmin],
      },
    },
  });
}

async function createFixtures() {
  await prisma.admins.createMany({
    data: [
      {
        id: ids.superAdmin,
        name: 'Development Job Super Admin',
        email: 'development-job-super@test.local',
        password: 'x',
        role: 'SUPER_ADMIN',
        is_active: true,
        must_change_password: false,
      },
      {
        id: ids.financeAdmin,
        name: 'Development Job Finance Admin',
        email: 'development-job-finance@test.local',
        password: 'x',
        role: 'FINANCE',
        is_active: true,
        must_change_password: false,
      },
    ],
  });
}

async function auditRows(jobId: string, action: string) {
  return prisma.$queryRaw`
    SELECT
      action,
      entity_type,
      entity_id,
      admin_id,
      old_value,
      new_value
    FROM admin_audit_logs
    WHERE entity_type = 'development_job'
      AND entity_id = ${jobId}
      AND action = ${action}
    ORDER BY created_at
  `;
}

beforeAll(async () => {
  const appModule = await import('../src/app');
  const prismaModule = await import('../src/lib/prisma');

  app = appModule.default;
  prisma = prismaModule.prisma;

  await prisma.$connect();
  await cleanupFixtures();
  await createFixtures();
});

afterAll(async () => {
  await cleanupFixtures();
  await prisma.$disconnect();
});

describe('KAVIAR AI — Development Jobs integration', () => {
  it('SUPER_ADMIN creates an AWAITING_SCOPE job through /chat with atomic audit', async () => {
    const response = await request(app)
      .post('/api/admin/ai/chat')
      .set('Authorization', authHeader(ids.superAdmin).Authorization)
      .send({
        question: 'Corrigir bug no backend',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.toolsUsed).toEqual([]);

    const proposal = response.body.developmentProposal;

    expect(proposal).toBeDefined();
    expect(proposal.category).toBe('BUG_FIX');
    expect(proposal.status).toBe('AWAITING_SCOPE');
    expect(proposal.requiresHumanConfirmation).toBe(true);
    expect(proposal.canMerge).toBe(false);
    expect(proposal.canDeployProduction).toBe(false);
    expect(proposal.canAccessProductionDatabase).toBe(false);
    expect(typeof proposal.jobId).toBe('string');
    expect(proposal.jobId.length).toBeGreaterThan(0);

    const persisted = await prisma.development_jobs.findUnique({
      where: { id: proposal.jobId },
    });

    expect(persisted).not.toBeNull();
    expect(persisted.category).toBe('BUG_FIX');
    expect(persisted.status).toBe('AWAITING_SCOPE');
    expect(persisted.requested_by_admin_id).toBe(ids.superAdmin);
    expect(persisted.confirmed_by_admin_id).toBeNull();
    expect(persisted.confirmed_at).toBeNull();

    const audits: any[] = await auditRows(
      proposal.jobId,
      'DEVELOPMENT_JOB_CREATED',
    );

    expect(audits).toHaveLength(1);
    expect(audits[0].admin_id).toBe(ids.superAdmin);
    expect(audits[0].entity_type).toBe('development_job');
    expect(audits[0].new_value.status).toBe('AWAITING_SCOPE');
    expect(audits[0].new_value.category).toBe('BUG_FIX');
  });

  it('FINANCE can use /chat but cannot create a Development Job', async () => {
    const summary = 'Criar feature exclusiva do teste Finance';

    const before = await prisma.development_jobs.count({
      where: { summary },
    });

    const response = await request(app)
      .post('/api/admin/ai/chat')
      .set('Authorization', authHeader(ids.financeAdmin).Authorization)
      .send({
        question: summary,
      });

    const after = await prisma.development_jobs.count({
      where: { summary },
    });

    expect(response.status).toBe(200);
    expect(response.body.developmentProposal).toBeUndefined();
    expect(response.body.toolsUsed).toEqual([]);
    expect(response.body.answer).toContain('Acesso negado');
    expect(after).toBe(before);
  });

  it('confirmation route is SUPER_ADMIN-only, queues once, audits once, and rejects duplicate confirmation', async () => {
    const createResponse = await request(app)
      .post('/api/admin/ai/chat')
      .set('Authorization', authHeader(ids.superAdmin).Authorization)
      .send({
        question: 'Criar um endpoint para teste da confirmação',
      });

    expect(createResponse.status).toBe(200);

    const jobId = createResponse.body.developmentProposal?.jobId;

    expect(typeof jobId).toBe('string');

    const financeResponse = await request(app)
      .post(`/api/admin/ai/dev-jobs/${jobId}/confirm`)
      .set('Authorization', authHeader(ids.financeAdmin).Authorization);

    expect(financeResponse.status).toBe(403);

    const afterFinance = await prisma.development_jobs.findUnique({
      where: { id: jobId },
    });

    expect(afterFinance.status).toBe('AWAITING_SCOPE');

    // Simula a etapa já testada separadamente pelo Scope Planner:
    // escopo resolvido antes da confirmação humana.
    await prisma.development_jobs.update({
      where: { id: jobId },
      data: {
        status: 'AWAITING_CONFIRMATION',
        allowed_paths: [
          'backend/tests/example.test.ts',
        ],
        scope_rationale:
          'Escopo controlado do teste de integração.',
        scope_resolved_at: new Date(),
      },
    });

    const confirmResponse = await request(app)
      .post(`/api/admin/ai/dev-jobs/${jobId}/confirm`)
      .set('Authorization', authHeader(ids.superAdmin).Authorization);

    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.body.success).toBe(true);
    expect(confirmResponse.body.data.id).toBe(jobId);
    expect(confirmResponse.body.data.status).toBe('QUEUED');
    expect(confirmResponse.body.data.confirmedByAdminId).toBe(ids.superAdmin);
    expect(confirmResponse.body.data.confirmedAt).toBeTruthy();

    const persisted = await prisma.development_jobs.findUnique({
      where: { id: jobId },
    });

    expect(persisted.status).toBe('QUEUED');
    expect(persisted.confirmed_by_admin_id).toBe(ids.superAdmin);
    expect(persisted.confirmed_at).not.toBeNull();

    const confirmAudits: any[] = await auditRows(
      jobId,
      'DEVELOPMENT_JOB_CONFIRMED',
    );

    expect(confirmAudits).toHaveLength(1);
    expect(confirmAudits[0].old_value.status).toBe(
      'AWAITING_CONFIRMATION',
    );
    expect(confirmAudits[0].new_value.status).toBe('QUEUED');

    const duplicateResponse = await request(app)
      .post(`/api/admin/ai/dev-jobs/${jobId}/confirm`)
      .set('Authorization', authHeader(ids.superAdmin).Authorization);

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.code).toBe(
      'DEVELOPMENT_JOB_NOT_CONFIRMABLE',
    );

    const auditsAfterDuplicate: any[] = await auditRows(
      jobId,
      'DEVELOPMENT_JOB_CONFIRMED',
    );

    expect(auditsAfterDuplicate).toHaveLength(1);
  });

  it('SUPER_ADMIN can read Development Job result and FINANCE cannot', async () => {
    const created =
      await prisma.development_jobs.create({
        data: {
          category: 'TEST',
          summary:
            'Teste de consulta do resultado do Development Job',
          status: 'SUCCEEDED',
          requested_by_admin_id: ids.superAdmin,
          allowed_paths: [
            'backend/tests/example.test.ts',
          ],
          scope_rationale:
            'Fixture da rota de consulta.',
          scope_resolved_at: new Date(),
        },
      });

    const jobId = created.id;

    await prisma.development_jobs.update({
      where: { id: jobId },
      data: {
        status: 'SUCCEEDED',
        result_changed_paths: [
          'backend/tests/example.test.ts',
        ],
        result_summary:
          'Execução concluída e validada.',
        error_message: null,
        completed_at: new Date(
          '2026-08-19T17:00:00.000Z',
        ),
      },
    });

    const financeResponse = await request(app)
      .get(`/api/admin/ai/dev-jobs/${jobId}`)
      .set(
        'Authorization',
        authHeader(ids.financeAdmin).Authorization,
      );

    expect(financeResponse.status).toBe(403);

    const response = await request(app)
      .get(`/api/admin/ai/dev-jobs/${jobId}`)
      .set(
        'Authorization',
        authHeader(ids.superAdmin).Authorization,
      );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: jobId,
      status: 'SUCCEEDED',
      resultChangedPaths: [
        'backend/tests/example.test.ts',
      ],
      resultSummary:
        'Execução concluída e validada.',
      errorMessage: null,
    });

    expect(
      response.body.data.completedAt,
    ).toBeTruthy();
  });

});
