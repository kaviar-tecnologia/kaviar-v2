/**
 * Integration tests for atomic audit in finance transaction operations.
 * OPT-IN: Only runs when RUN_FINANCE_ATOMIC_AUDIT_INTEGRATION=1
 * Requires: local PostgreSQL test DB (not production).
 * Run: npm run test:finance-atomic-audit:integration
 *
 * Tests prove:
 * 1. On success: audit log row is created with correct data
 * 2. On rollback: neither the transaction nor the audit log persists (atomicity)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const SKIP = !process.env.RUN_FINANCE_ATOMIC_AUDIT_INTEGRATION;

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

describe.skipIf(SKIP)('Atomic Audit Integration — Real PostgreSQL', () => {
  let prisma: PrismaClient;
  const uid = randomUUID().slice(0, 8);
  const adminId = `admin-atomic-${uid}`;
  const adminEmail = `admin-atomic-${uid}@test.local`;
  const admin = { id: adminId, email: adminEmail, role: 'SUPER_ADMIN' };
  let testAccountId: string;
  let testCategoryId: string;

  beforeAll(async () => {
    validateSafeUrl();
    prisma = new PrismaClient();

    // Create admin fixture
    await prisma.admins.create({
      data: {
        id: adminId,
        email: adminEmail,
        name: 'Atomic Audit Test',
        role: 'SUPER_ADMIN',
        password: 'x',
        is_active: true,
      },
    });

    // Create account fixture
    const acc = await prisma.financial_accounts.create({
      data: {
        code: `ACCT-${uid}`,
        name: `Test Account ${uid}`,
        type: 'BANK',
        is_active: true,
        is_cash_equivalent: false,
        allows_negative_balance: false,
        created_by_admin_id: adminId,
      },
    });
    testAccountId = acc.id;

    // Create category fixture
    const cat = await prisma.financial_categories.create({
      data: {
        code: `CAT-${uid}`,
        name: `Test Category ${uid}`,
        kind: 'EXPENSE',
        is_active: true,
        is_postable: true,
        created_by_admin_id: adminId,
      },
    });
    testCategoryId = cat.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Clean up all test data
    await prisma.$executeRaw`DELETE FROM admin_audit_logs WHERE admin_id = ${adminId}`;
    await prisma.financial_transactions.deleteMany({ where: { created_by_admin_id: adminId } });
    await prisma.financial_categories.deleteMany({ where: { created_by_admin_id: adminId } });
    await prisma.financial_accounts.deleteMany({ where: { created_by_admin_id: adminId } });
    await prisma.admins.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean transactions and audit logs between tests
    await prisma.financial_transactions.deleteMany({ where: { created_by_admin_id: adminId } });
    await prisma.$executeRaw`DELETE FROM admin_audit_logs WHERE admin_id = ${adminId}`;
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function makeAuditContext(overrides?: Partial<{ adminId: string | null; adminEmail: string | null }>) {
    return {
      adminId: overrides?.adminId !== undefined ? overrides.adminId : adminId,
      adminEmail: overrides?.adminEmail !== undefined ? overrides.adminEmail : adminEmail,
      ipAddress: '127.0.0.1',
      userAgent: 'integration-test',
    };
  }

  async function queryAuditLogs(entityId?: string) {
    type AuditRow = {
      id: number;
      admin_id: string;
      admin_email: string | null;
      action: string;
      entity_type: string;
      entity_id: string;
      old_value: unknown;
      new_value: unknown;
      reason: string | null;
      ip_address: string | null;
      user_agent: string | null;
    };

    if (entityId) {
      return prisma.$queryRaw<AuditRow[]>`
        SELECT * FROM admin_audit_logs WHERE admin_id = ${adminId} AND entity_id = ${entityId} ORDER BY id
      `;
    }
    return prisma.$queryRaw<AuditRow[]>`
      SELECT * FROM admin_audit_logs WHERE admin_id = ${adminId} ORDER BY id
    `;
  }

  async function createDraftTransaction() {
    return prisma.financial_transactions.create({
      data: {
        source_type: 'MANUAL',
        origin_type: 'MANUAL',
        account_id: testAccountId,
        category_id: testCategoryId,
        direction: 'OUT',
        transaction_type: 'EXPENSE',
        status: 'DRAFT',
        payment_method: 'PIX',
        competence_date: new Date('2026-08-01T00:00:00.000Z'),
        transaction_date: new Date('2026-08-01T00:00:00.000Z'),
        gross_amount_cents: BigInt(10000),
        fee_amount_cents: BigInt(0),
        discount_amount_cents: BigInt(0),
        retention_amount_cents: BigInt(0),
        net_amount_cents: BigInt(10000),
        description: `Draft-${randomUUID().slice(0, 8)}`,
        created_by_admin_id: adminId,
        responsible_admin_id: adminId,
      },
    });
  }

  async function createPostedTransaction() {
    return prisma.financial_transactions.create({
      data: {
        source_type: 'MANUAL',
        origin_type: 'MANUAL',
        account_id: testAccountId,
        category_id: testCategoryId,
        direction: 'OUT',
        transaction_type: 'EXPENSE',
        status: 'POSTED',
        payment_method: 'PIX',
        competence_date: new Date('2026-08-01T00:00:00.000Z'),
        transaction_date: new Date('2026-08-01T00:00:00.000Z'),
        settlement_date: new Date('2026-08-02T00:00:00.000Z'),
        gross_amount_cents: BigInt(10000),
        fee_amount_cents: BigInt(0),
        discount_amount_cents: BigInt(0),
        retention_amount_cents: BigInt(0),
        net_amount_cents: BigInt(10000),
        description: `Posted-${randomUUID().slice(0, 8)}`,
        created_by_admin_id: adminId,
        responsible_admin_id: adminId,
        approved_by_admin_id: adminId,
      },
    });
  }

  // ── Import services (uses singleton prisma with same DATABASE_URL) ─────────

  // Lazy imports to ensure DATABASE_URL is already set when prisma singleton initializes
  let createFinanceTransaction: typeof import('../src/services/finance/finance-transaction-crud.service').createFinanceTransaction;
  let updateFinanceTransaction: typeof import('../src/services/finance/finance-transaction-crud.service').updateFinanceTransaction;
  let postFinanceTransaction: typeof import('../src/services/finance/finance-transaction-crud.service').postFinanceTransaction;
  let cancelFinanceTransaction: typeof import('../src/services/finance/finance-transaction-crud.service').cancelFinanceTransaction;
  let reverseFinanceTransaction: typeof import('../src/services/finance/finance-transaction-reversal.service').reverseFinanceTransaction;

  beforeAll(async () => {
    const crud = await import('../src/services/finance/finance-transaction-crud.service');
    const reversal = await import('../src/services/finance/finance-transaction-reversal.service');
    createFinanceTransaction = crud.createFinanceTransaction;
    updateFinanceTransaction = crud.updateFinanceTransaction;
    postFinanceTransaction = crud.postFinanceTransaction;
    cancelFinanceTransaction = crud.cancelFinanceTransaction;
    reverseFinanceTransaction = reversal.reverseFinanceTransaction;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. CREATE success → audit log exists
  // ══════════════════════════════════════════════════════════════════════════

  it('CREATE success → audit log exists with correct data', async () => {
    const result = await createFinanceTransaction(
      {
        account_id: testAccountId,
        category_id: testCategoryId,
        direction: 'OUT',
        transaction_type: 'EXPENSE',
        payment_method: 'PIX',
        competence_date: new Date('2026-08-01T00:00:00.000Z'),
        transaction_date: new Date('2026-08-01T00:00:00.000Z'),
        gross_amount_cents: BigInt(5000),
        net_amount_cents: BigInt(5000),
        description: 'Create audit test',
      },
      admin,
      makeAuditContext(),
    );

    const txId = result.record!.id;
    const logs = await queryAuditLogs(txId);

    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('FINANCE_TRANSACTION_CREATE');
    expect(logs[0].admin_id).toBe(adminId);
    expect(logs[0].admin_email).toBe(adminEmail);
    expect(logs[0].entity_type).toBe('financial_transactions');
    expect(logs[0].entity_id).toBe(txId);
    expect(logs[0].old_value).toBeNull();
    expect(logs[0].new_value).not.toBeNull();
    expect(logs[0].ip_address).toBe('127.0.0.1');
    expect(logs[0].user_agent).toBe('integration-test');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CREATE rollback (null adminId) → no transaction, no audit
  // ══════════════════════════════════════════════════════════════════════════

  it('CREATE rollback (null adminId) → no transaction, no audit', async () => {
    const descUnique = `rollback-create-${randomUUID().slice(0, 8)}`;

    await expect(
      createFinanceTransaction(
        {
          account_id: testAccountId,
          category_id: testCategoryId,
          direction: 'OUT',
          transaction_type: 'EXPENSE',
          payment_method: 'PIX',
          competence_date: new Date('2026-08-01T00:00:00.000Z'),
          transaction_date: new Date('2026-08-01T00:00:00.000Z'),
          gross_amount_cents: BigInt(5000),
          net_amount_cents: BigInt(5000),
          description: descUnique,
        },
        admin,
        makeAuditContext({ adminId: null as any }),
      ),
    ).rejects.toThrow();

    // Verify no transaction was created
    const txCount = await prisma.financial_transactions.count({
      where: { description: descUnique },
    });
    expect(txCount).toBe(0);

    // Verify no audit log
    const logs = await queryAuditLogs();
    expect(logs).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. UPDATE success → audit log exists with old/new values
  // ══════════════════════════════════════════════════════════════════════════

  it('UPDATE success → audit log exists with old/new values', async () => {
    const tx = await createDraftTransaction();

    const result = await updateFinanceTransaction(
      tx.id,
      {
        expected_updated_at: tx.updated_at,
        description: 'Updated description',
        gross_amount_cents: BigInt(20000),
        net_amount_cents: BigInt(20000),
      },
      admin,
      makeAuditContext(),
    );

    const logs = await queryAuditLogs(tx.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('FINANCE_TRANSACTION_UPDATE');
    expect(logs[0].admin_id).toBe(adminId);
    expect(logs[0].entity_id).toBe(tx.id);
    expect(logs[0].old_value).not.toBeNull();
    expect(logs[0].new_value).not.toBeNull();

    // Verify old/new contain the description change
    const oldVal = logs[0].old_value as any;
    const newVal = logs[0].new_value as any;
    expect(oldVal.description).toBe(tx.description);
    expect(newVal.description).toBe('Updated description');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. UPDATE rollback → original unchanged, no audit
  // ══════════════════════════════════════════════════════════════════════════

  it('UPDATE rollback (null adminId) → original unchanged, no audit', async () => {
    const tx = await createDraftTransaction();
    const originalDesc = tx.description;

    await expect(
      updateFinanceTransaction(
        tx.id,
        {
          expected_updated_at: tx.updated_at,
          description: 'Should not persist',
          gross_amount_cents: BigInt(99999),
          net_amount_cents: BigInt(99999),
        },
        admin,
        makeAuditContext({ adminId: null as any }),
      ),
    ).rejects.toThrow();

    // Verify original unchanged
    const dbTx = await prisma.financial_transactions.findUnique({ where: { id: tx.id } });
    expect(dbTx!.description).toBe(originalDesc);
    expect(dbTx!.gross_amount_cents).toBe(BigInt(10000));

    // Verify no audit log
    const logs = await queryAuditLogs(tx.id);
    expect(logs).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. POST success → audit log exists
  // ══════════════════════════════════════════════════════════════════════════

  it('POST success → audit log exists', async () => {
    const tx = await createDraftTransaction();

    await postFinanceTransaction(
      tx.id,
      {
        expected_updated_at: tx.updated_at,
        settlement_date: new Date('2026-08-05T00:00:00.000Z'),
      },
      admin,
      makeAuditContext(),
    );

    const logs = await queryAuditLogs(tx.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('FINANCE_TRANSACTION_POST');
    expect(logs[0].admin_id).toBe(adminId);
    expect(logs[0].entity_id).toBe(tx.id);

    // Verify status changed in DB
    const dbTx = await prisma.financial_transactions.findUnique({ where: { id: tx.id } });
    expect(dbTx!.status).toBe('POSTED');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. POST rollback → status unchanged, no audit
  // ══════════════════════════════════════════════════════════════════════════

  it('POST rollback (null adminId) → status unchanged, no audit', async () => {
    const tx = await createDraftTransaction();

    await expect(
      postFinanceTransaction(
        tx.id,
        {
          expected_updated_at: tx.updated_at,
          settlement_date: new Date('2026-08-05T00:00:00.000Z'),
        },
        admin,
        makeAuditContext({ adminId: null as any }),
      ),
    ).rejects.toThrow();

    // Verify status unchanged
    const dbTx = await prisma.financial_transactions.findUnique({ where: { id: tx.id } });
    expect(dbTx!.status).toBe('DRAFT');

    // Verify no audit log
    const logs = await queryAuditLogs(tx.id);
    expect(logs).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. CANCEL success → audit log exists with reason
  // ══════════════════════════════════════════════════════════════════════════

  it('CANCEL success → audit log exists with reason', async () => {
    const tx = await createDraftTransaction();

    await cancelFinanceTransaction(
      tx.id,
      {
        expected_updated_at: tx.updated_at,
        canceled_reason: 'Motivo de cancelamento de teste',
      },
      admin,
      makeAuditContext(),
    );

    const logs = await queryAuditLogs(tx.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('FINANCE_TRANSACTION_CANCEL');
    expect(logs[0].admin_id).toBe(adminId);
    expect(logs[0].entity_id).toBe(tx.id);
    expect(logs[0].reason).toBe('Motivo de cancelamento de teste');

    // Verify status changed in DB
    const dbTx = await prisma.financial_transactions.findUnique({ where: { id: tx.id } });
    expect(dbTx!.status).toBe('CANCELED');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 8. CANCEL rollback → status unchanged, no audit
  // ══════════════════════════════════════════════════════════════════════════

  it('CANCEL rollback (null adminId) → status unchanged, no audit', async () => {
    const tx = await createDraftTransaction();

    await expect(
      cancelFinanceTransaction(
        tx.id,
        {
          expected_updated_at: tx.updated_at,
          canceled_reason: 'Should not persist',
        },
        admin,
        makeAuditContext({ adminId: null as any }),
      ),
    ).rejects.toThrow();

    // Verify status unchanged
    const dbTx = await prisma.financial_transactions.findUnique({ where: { id: tx.id } });
    expect(dbTx!.status).toBe('DRAFT');

    // Verify no audit log
    const logs = await queryAuditLogs(tx.id);
    expect(logs).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 9. REVERSE success → audit log exists
  // ══════════════════════════════════════════════════════════════════════════

  it('REVERSE success → audit log exists', async () => {
    const tx = await createPostedTransaction();

    const result = await reverseFinanceTransaction(
      tx.id,
      {
        expected_updated_at: tx.updated_at,
        reversal_date: new Date('2026-08-10T00:00:00.000Z'),
        reason: 'Estorno de teste',
      },
      admin,
      makeAuditContext(),
    );

    const logs = await queryAuditLogs(tx.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('FINANCE_TRANSACTION_REVERSE');
    expect(logs[0].admin_id).toBe(adminId);
    expect(logs[0].entity_id).toBe(tx.id);
    expect(logs[0].reason).toBe('Estorno de teste');

    // Verify original is REVERSED
    const dbOriginal = await prisma.financial_transactions.findUnique({ where: { id: tx.id } });
    expect(dbOriginal!.status).toBe('REVERSED');

    // Verify reversal transaction exists
    const reversals = await prisma.financial_transactions.findMany({
      where: { reversal_of_id: tx.id },
    });
    expect(reversals).toHaveLength(1);
    expect(reversals[0].status).toBe('POSTED');
    expect(reversals[0].direction).toBe('IN'); // original was OUT
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 10. REVERSE rollback → original stays POSTED, no reversal, no audit
  // ══════════════════════════════════════════════════════════════════════════

  it('REVERSE rollback (null adminId) → original stays POSTED, no reversal, no audit', async () => {
    const tx = await createPostedTransaction();

    await expect(
      reverseFinanceTransaction(
        tx.id,
        {
          expected_updated_at: tx.updated_at,
          reversal_date: new Date('2026-08-10T00:00:00.000Z'),
          reason: 'Should not persist',
        },
        admin,
        makeAuditContext({ adminId: null as any }),
      ),
    ).rejects.toThrow();

    // Verify original still POSTED
    const dbOriginal = await prisma.financial_transactions.findUnique({ where: { id: tx.id } });
    expect(dbOriginal!.status).toBe('POSTED');

    // Verify no reversal transaction
    const reversals = await prisma.financial_transactions.count({
      where: { reversal_of_id: tx.id },
    });
    expect(reversals).toBe(0);

    // Verify no audit log
    const logs = await queryAuditLogs(tx.id);
    expect(logs).toHaveLength(0);
  });
});
