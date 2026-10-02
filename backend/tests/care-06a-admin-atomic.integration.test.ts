import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  assertCareSnapshot, CareAdminConflict, lockCareAdminRow, writeCareAdminAuditTx,
} from '../src/services/care/care-admin-atomic';

// Never run against production, even if someone accidentally sets the test flag.
const disposable = process.env.CARE_ADMIN_ATOMIC_INTEGRATION === '1' &&
  /^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '') &&
  new URL(process.env.DATABASE_URL!).pathname === '/care06a_disposable';

describe.skipIf(!disposable)('CARE-06A — real PostgreSQL row locks and mandatory audit', () => {
  const ids: string[] = [];
  const initial = new Date('2026-09-01T00:00:00.000Z');
  const final = new Date('2026-12-31T00:00:00.000Z');

  const newCoverage = async () => {
    const id = randomUUID();
    ids.push(id);
    return prisma.operational_insurance_coverages.create({
      data: {
        id, territory_id: null, modality: 'CAR_PASSENGER',
        provider_name: 'Synthetic CI insurer', policy_number: 'SYNTHETIC-CI',
        coverage_type: 'APP', valid_from: initial, valid_until: final,
        status: 'DRAFT',
      },
    });
  };

  beforeAll(async () => {
    // The audit table is a legacy post-Prisma bootstrap object, not a Prisma
    // model. Reproduce its needed contract only inside the disposable DB.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id TEXT NOT NULL, action TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        old_value JSONB, new_value JSONB, reason TEXT,
        ip_address TEXT, user_agent TEXT, created_at TIMESTAMPTZ DEFAULT now()
      )`);
    await prisma.$executeRawUnsafe(`
      DELETE FROM admin_audit_logs WHERE action IN ('reject_atomic_test', 'allow_atomic_test')`);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE admin_audit_logs
      DROP CONSTRAINT IF EXISTS care06a_ci_audit_failure`);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE admin_audit_logs
      ADD CONSTRAINT care06a_ci_audit_failure
      CHECK (action <> 'reject_atomic_test')`);
  });

  afterAll(async () => {
    if (ids.length) {
      await prisma.operational_insurance_coverages.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  it('rolls back the official record if its mandatory audit insert fails', async () => {
    const row = await newCoverage();
    await expect(prisma.$transaction(async (tx) => {
      await lockCareAdminRow(tx, 'coverage', row.id);
      await tx.operational_insurance_coverages.update({
        where: { id: row.id }, data: { status: 'SUSPENDED' },
      });
      await writeCareAdminAuditTx(tx, {
        adminId: 'synthetic-ci-admin', action: 'reject_atomic_test',
        entityType: 'operational_insurance_coverage', entityId: row.id,
        oldValue: { status: 'DRAFT' }, newValue: { status: 'SUSPENDED' },
      });
    })).rejects.toThrow();
    expect((await prisma.operational_insurance_coverages.findUniqueOrThrow({
      where: { id: row.id },
    })).status).toBe('DRAFT');
    const logs = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM admin_audit_logs WHERE entity_id = ${row.id}`;
    expect(Number(logs[0].count)).toBe(0);
  });

  it('persists the audit and decision together on successful commit', async () => {
    const row = await newCoverage();
    await prisma.$transaction(async (tx) => {
      await lockCareAdminRow(tx, 'coverage', row.id);
      await tx.operational_insurance_coverages.update({
        where: { id: row.id }, data: { status: 'SUSPENDED' },
      });
      await writeCareAdminAuditTx(tx, {
        adminId: 'synthetic-ci-admin', action: 'allow_atomic_test',
        entityType: 'operational_insurance_coverage', entityId: row.id,
        oldValue: { status: 'DRAFT' }, newValue: { status: 'SUSPENDED' },
      });
    });
    expect((await prisma.operational_insurance_coverages.findUniqueOrThrow({
      where: { id: row.id },
    })).status).toBe('SUSPENDED');
    const logs = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM admin_audit_logs
      WHERE entity_id = ${row.id} AND action = 'allow_atomic_test'`;
    expect(Number(logs[0].count)).toBe(1);
  });

  it('rejects a stale approval after a concurrent revocation commits under row lock', async () => {
    const before = await newCoverage();
    let release!: () => void;
    let acquired!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { acquired = resolve; });
    const first = prisma.$transaction(async (tx) => {
      await lockCareAdminRow(tx, 'coverage', before.id);
      acquired();
      await hold;
      await tx.operational_insurance_coverages.update({
        where: { id: before.id },
        data: { status: 'SUSPENDED', care_scope_verified: false },
      });
    }, { timeout: 15000 });

    await locked;
    const staleApproval = prisma.$transaction(async (tx) => {
      await lockCareAdminRow(tx, 'coverage', before.id);
      const current = await tx.operational_insurance_coverages.findUniqueOrThrow({
        where: { id: before.id },
      });
      assertCareSnapshot(before, current);
      await tx.operational_insurance_coverages.update({
        where: { id: before.id }, data: { status: 'ACTIVE' },
      });
    }, { timeout: 15000 });
    // Release only after the rival transaction has been started.
    release();
    await first;
    await expect(staleApproval).rejects.toBeInstanceOf(CareAdminConflict);
    expect((await prisma.operational_insurance_coverages.findUniqueOrThrow({
      where: { id: before.id },
    })).status).toBe('SUSPENDED');
  });
});
