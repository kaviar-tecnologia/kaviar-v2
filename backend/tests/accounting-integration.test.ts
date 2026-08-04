/**
 * Integration tests for accounting portal base entities.
 * OPT-IN: Only runs when RUN_ACCOUNTING_INTEGRATION=1
 * Requires: local PostgreSQL test DB (kaviar_test).
 *
 * Tests:
 * - CNPJ unique constraint
 * - CPF unique constraint
 * - FK relations
 * - Partial indexes (uq_active_link, uq_accountant_invite_pending)
 * - Audit rollback (force audit failure → main op rolled back)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const SKIP = !process.env.RUN_ACCOUNTING_INTEGRATION;

function validateSafeUrl() {
  const url = process.env.DATABASE_URL || '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Unsafe DATABASE_URL for integration: cannot parse`);
  }
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error(`Unsafe DATABASE_URL hostname: ${parsed.hostname}`);
  }
  if (!parsed.pathname.toLowerCase().includes('test')) {
    throw new Error(`DATABASE_URL path must contain "test": ${parsed.pathname}`);
  }
}

describe.skipIf(SKIP)('Accounting Integration — Real PostgreSQL', () => {
  let prisma: PrismaClient;
  const uid = randomUUID().slice(0, 8);
  const adminId = `admin-acct-int-${uid}`;

  beforeAll(async () => {
    validateSafeUrl();
    prisma = new PrismaClient();

    // Create admin fixture
    await prisma.admins.create({
      data: {
        id: adminId,
        email: `admin-acct-int-${uid}@test.local`,
        name: 'Test Admin',
        password: 'hashed_test',
        role: 'SUPER_ADMIN',
      },
    });
  });

  afterAll(async () => {
    // Cleanup in reverse FK order
    await prisma.accountant_entity_links.deleteMany({ where: { created_by_admin_id: adminId } });
    await prisma.accountant_invites.deleteMany({ where: { created_by_admin_id: adminId } });
    await prisma.accountants.deleteMany({ where: { cpf: { startsWith: `999${uid.slice(0, 5)}` } } });
    await prisma.accounting_firms.deleteMany({ where: { document_number: { startsWith: `99${uid.slice(0, 6)}` } } });
    await prisma.legal_entities.deleteMany({ where: { cnpj: { startsWith: `99${uid.slice(0, 6)}` } } });
    await prisma.$executeRawUnsafe(`DELETE FROM admin_audit_logs WHERE admin_id = '${adminId}'`);
    await prisma.admins.delete({ where: { id: adminId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('should enforce CNPJ unique constraint on legal_entities', async () => {
    const cnpj = `99${uid.slice(0, 6)}000001`;
    await prisma.legal_entities.create({
      data: { razao_social: 'Empresa A', cnpj, entity_type: 'MATRIZ' },
    });

    await expect(
      prisma.legal_entities.create({
        data: { razao_social: 'Empresa B', cnpj, entity_type: 'MATRIZ' },
      }),
    ).rejects.toThrow();
  });

  it('should enforce CPF unique constraint on accountants', async () => {
    const docNum = `99${uid.slice(0, 6)}888888`;
    const firm = await prisma.accounting_firms.create({
      data: {
        razao_social: 'Escritório CPF Test',
        document_type: 'CNPJ',
        document_number: docNum,
        email: `firm-cpf-${uid}@test.local`,
      },
    });

    const cpf = `999${uid.slice(0, 5)}001`;
    await prisma.accountants.create({
      data: {
        accounting_firm_id: firm.id,
        nome_completo: 'Contador A',
        email: `cpf-a-${uid}@test.local`,
        cpf,
        status: 'INVITED',
      },
    });

    await expect(
      prisma.accountants.create({
        data: {
          accounting_firm_id: firm.id,
          nome_completo: 'Contador B',
          email: `cpf-b-${uid}@test.local`,
          cpf,
          status: 'INVITED',
        },
      }),
    ).rejects.toThrow();
  });

  it('should enforce FK relation between accountants and accounting_firms', async () => {
    await expect(
      prisma.accountants.create({
        data: {
          accounting_firm_id: 'nonexistent-firm-id',
          nome_completo: 'Ghost',
          email: `ghost-${uid}@test.local`,
          cpf: `999${uid.slice(0, 5)}999`,
          status: 'INVITED',
        },
      }),
    ).rejects.toThrow();
  });

  it('should allow multiple REVOKED links but only one ACTIVE (partial index)', async () => {
    const docNum = `99${uid.slice(0, 6)}777777`;
    const firm = await prisma.accounting_firms.create({
      data: {
        razao_social: 'Escritório Links Test',
        document_type: 'CNPJ',
        document_number: docNum,
        email: `firm-link-${uid}@test.local`,
      },
    });

    const cpf = `999${uid.slice(0, 5)}002`;
    const accountant = await prisma.accountants.create({
      data: {
        accounting_firm_id: firm.id,
        nome_completo: 'Contador Links',
        email: `link-${uid}@test.local`,
        cpf,
        status: 'ACTIVE',
        is_active: true,
      },
    });

    const cnpj = `99${uid.slice(0, 6)}000002`;
    const entity = await prisma.legal_entities.create({
      data: { razao_social: 'Empresa Links', cnpj, entity_type: 'MATRIZ' },
    });

    // Create first REVOKED link
    await prisma.accountant_entity_links.create({
      data: {
        accountant_id: accountant.id,
        legal_entity_id: entity.id,
        scope: 'FISCAL',
        status: 'REVOKED',
        starts_at: new Date(),
        created_by_admin_id: adminId,
      },
    });

    // Create second REVOKED link with same combo — should succeed
    await prisma.accountant_entity_links.create({
      data: {
        accountant_id: accountant.id,
        legal_entity_id: entity.id,
        scope: 'FISCAL',
        status: 'REVOKED',
        starts_at: new Date(),
        created_by_admin_id: adminId,
      },
    });

    // Create one ACTIVE link — should succeed
    await prisma.accountant_entity_links.create({
      data: {
        accountant_id: accountant.id,
        legal_entity_id: entity.id,
        scope: 'FISCAL',
        status: 'ACTIVE',
        starts_at: new Date(),
        created_by_admin_id: adminId,
      },
    });

    // Creating second ACTIVE link with same combo — should fail due to partial index
    await expect(
      prisma.accountant_entity_links.create({
        data: {
          accountant_id: accountant.id,
          legal_entity_id: entity.id,
          scope: 'FISCAL',
          status: 'ACTIVE',
          starts_at: new Date(),
          created_by_admin_id: adminId,
        },
      }),
    ).rejects.toThrow();
  });

  it('should enforce only one PENDING invite per accountant (partial index)', async () => {
    const docNum = `99${uid.slice(0, 6)}666666`;
    const firm = await prisma.accounting_firms.create({
      data: {
        razao_social: 'Escritório Invites Test',
        document_type: 'CNPJ',
        document_number: docNum,
        email: `firm-invite-${uid}@test.local`,
      },
    });

    const cpf = `999${uid.slice(0, 5)}003`;
    const accountant = await prisma.accountants.create({
      data: {
        accounting_firm_id: firm.id,
        nome_completo: 'Contador Invites',
        email: `invite-${uid}@test.local`,
        cpf,
        status: 'INVITED',
      },
    });

    // First PENDING invite
    await prisma.accountant_invites.create({
      data: {
        accountant_id: accountant.id,
        token_hash: `hash_a_${uid}`,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
        created_by_admin_id: adminId,
      },
    });

    // Second PENDING invite — should fail
    await expect(
      prisma.accountant_invites.create({
        data: {
          accountant_id: accountant.id,
          token_hash: `hash_b_${uid}`,
          status: 'PENDING',
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
          created_by_admin_id: adminId,
        },
      }),
    ).rejects.toThrow();
  });

  it('should rollback main operation when audit insert fails (atomicity)', async () => {
    const cnpjBefore = `99${uid.slice(0, 6)}000099`;

    // Count entities before
    const countBefore = await prisma.legal_entities.count({ where: { cnpj: cnpjBefore } });

    // Attempt a transaction that will fail on the audit insert
    try {
      await prisma.$transaction(async (tx) => {
        await tx.legal_entities.create({
          data: { razao_social: 'Should Rollback', cnpj: cnpjBefore, entity_type: 'MATRIZ' },
        });

        // Force audit failure: action is NOT NULL but we pass null via raw
        await tx.$executeRaw`
          INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id)
          VALUES ('test-admin', NULL, 'test', 'test')
        `;
      });
    } catch {
      // Expected to fail due to NOT NULL constraint on action
    }

    // Entity should NOT exist (rolled back)
    const countAfter = await prisma.legal_entities.count({ where: { cnpj: cnpjBefore } });
    expect(countAfter).toBe(countBefore);
  });
});
