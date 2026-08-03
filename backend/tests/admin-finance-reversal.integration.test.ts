/**
 * Integration tests for finance transaction reversal.
 * OPT-IN: Only runs when RUN_FINANCE_REVERSAL_INTEGRATION=1
 * Requires: local PostgreSQL test DB (not production).
 * Run: npm run test:finance-reversal:integration
 */
import { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { reverseFinanceTransaction } from '../src/services/finance/finance-transaction-reversal.service';
import { randomUUID } from 'crypto';

const RUN_INTEGRATION = process.env.RUN_FINANCE_REVERSAL_INTEGRATION === '1';

function assertSafeLocalTestDatabase(rawUrl: string | undefined) {
  if (!rawUrl) throw new Error('DATABASE_URL obrigatória para integração');
  const parsed = new URL(rawUrl);
  const localHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  const testDatabase = parsed.pathname.toLowerCase().includes('test');
  if (!localHost || !testDatabase) {
    throw new Error('Integration database must be a local disposable test database (hostname=127.0.0.1/localhost, path contains "test")');
  }
}

const integrationDescribe = RUN_INTEGRATION ? describe : describe.skip;

integrationDescribe('Reversal Integration — Real PostgreSQL', () => {
  let prisma: PrismaClient;
  const uid = randomUUID().slice(0, 8);
  const admin = { id: `admin-${uid}`, email: `admin-${uid}@test.local`, role: 'SUPER_ADMIN' };
  let testAccountId: string;
  let testCategoryId: string;

  beforeAll(async () => {
    assertSafeLocalTestDatabase(process.env.DATABASE_URL);
    prisma = new PrismaClient();
    await prisma.admins.create({ data: { id: admin.id, email: admin.email, name: 'Test', role: 'SUPER_ADMIN', password: 'x', is_active: true } });
    const acc = await prisma.financial_accounts.create({ data: { code: `A-${uid}`, name: 'Test', type: 'BANK', is_active: true, is_cash_equivalent: false, allows_negative_balance: false, created_by_admin_id: admin.id } });
    testAccountId = acc.id;
    const cat = await prisma.financial_categories.create({ data: { code: `C-${uid}`, name: 'Test', kind: 'EXPENSE', is_active: true, is_postable: true, created_by_admin_id: admin.id } });
    testCategoryId = cat.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.financial_transactions.deleteMany({ where: { created_by_admin_id: admin.id } });
    await prisma.financial_categories.deleteMany({ where: { created_by_admin_id: admin.id } });
    await prisma.financial_accounts.deleteMany({ where: { created_by_admin_id: admin.id } });
    await prisma.admins.deleteMany({ where: { id: admin.id } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.financial_transactions.deleteMany({ where: { created_by_admin_id: admin.id } });
  });

  async function createPosted(direction: 'IN' | 'OUT' = 'OUT') {
    return prisma.financial_transactions.create({
      data: {
        source_type: 'MANUAL', origin_type: 'MANUAL',
        account_id: testAccountId, category_id: testCategoryId,
        direction, transaction_type: direction === 'OUT' ? 'EXPENSE' : 'INCOME',
        status: 'POSTED', payment_method: 'PIX',
        competence_date: new Date('2026-08-01'), transaction_date: new Date('2026-08-01'),
        settlement_date: new Date('2026-08-05'),
        gross_amount_cents: BigInt(15000), fee_amount_cents: BigInt(0),
        discount_amount_cents: BigInt(0), retention_amount_cents: BigInt(0),
        net_amount_cents: BigInt(15000),
        description: `Test-${randomUUID().slice(0, 8)}`,
        created_by_admin_id: admin.id, responsible_admin_id: admin.id, approved_by_admin_id: admin.id,
      },
    });
  }

  it('OUT→IN reversal with all fields verified', async () => {
    const original = await createPosted('OUT');
    const result = await reverseFinanceTransaction(original.id, {
      expected_updated_at: original.updated_at,
      reversal_date: new Date('2026-08-10T00:00:00.000Z'),
      reason: 'Duplicado',
    }, admin);

    expect(result.original?.status).toBe('REVERSED');
    expect(result.reversal?.transaction_type).toBe('REVERSAL');
    expect(result.reversal?.status).toBe('POSTED');
    expect(result.reversal?.direction).toBe('IN');
    expect(result.reversal?.reversal_of_id).toBe(original.id);
    expect(result.reversal?.account_id).toBe(testAccountId);
    expect(result.reversal?.category_id).toBe(testCategoryId);
    expect(result.reversal?.gross_amount_cents).toBe(BigInt(15000));
    expect(result.reversal?.net_amount_cents).toBe(BigInt(15000));
    expect(result.reversal?.payment_method).toBe('INTERNAL');
    expect(result.reversal?.due_date).toBeNull();
    expect(result.reversal?.memo).toBe('Duplicado');
    expect(result.reversal?.idempotency_key).toBe(`finance-reversal:${original.id}`);
  });

  it('IN→OUT reversal', async () => {
    const original = await createPosted('IN');
    const result = await reverseFinanceTransaction(original.id, {
      expected_updated_at: original.updated_at,
      reversal_date: new Date('2026-08-10T00:00:00.000Z'),
      reason: 'Erro de classificação',
    }, admin);
    expect(result.reversal?.direction).toBe('OUT');
  });

  it('concurrent: exactly 1 success + 1 rejection (409)', async () => {
    const original = await createPosted();
    const body = { expected_updated_at: original.updated_at, reversal_date: new Date('2026-08-10T00:00:00.000Z'), reason: 'Concurrency' };
    const results = await Promise.allSettled([
      reverseFinanceTransaction(original.id, body, admin),
      reverseFinanceTransaction(original.id, body, admin),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err.status).toBe(409);

    const dbOriginal = await prisma.financial_transactions.findUnique({ where: { id: original.id } });
    expect(dbOriginal?.status).toBe('REVERSED');
    const reversals = await prisma.financial_transactions.count({ where: { reversal_of_id: original.id } });
    expect(reversals).toBe(1);
  });

  it('rollback: P2002 keeps original POSTED, no orphan', async () => {
    const original = await createPosted();
    // Pre-insert with idempotency key
    await prisma.financial_transactions.create({
      data: {
        source_type: 'MANUAL', origin_type: 'MANUAL',
        account_id: testAccountId, category_id: testCategoryId,
        direction: 'IN', transaction_type: 'REVERSAL', status: 'POSTED',
        payment_method: 'INTERNAL',
        competence_date: new Date('2026-08-10'), transaction_date: new Date('2026-08-10'),
        gross_amount_cents: BigInt(15000), fee_amount_cents: BigInt(0),
        discount_amount_cents: BigInt(0), retention_amount_cents: BigInt(0),
        net_amount_cents: BigInt(15000),
        description: 'Blocker', idempotency_key: `finance-reversal:${original.id}`,
        created_by_admin_id: admin.id, responsible_admin_id: admin.id,
      },
    });

    await expect(reverseFinanceTransaction(original.id, {
      expected_updated_at: original.updated_at,
      reversal_date: new Date('2026-08-10T00:00:00.000Z'),
      reason: 'Should fail',
    }, admin)).rejects.toThrow(/já possui um estorno/);

    const dbOriginal = await prisma.financial_transactions.findUnique({ where: { id: original.id } });
    expect(dbOriginal?.status).toBe('POSTED');
    // Only the pre-existing blocker, no new reversal
    const count = await prisma.financial_transactions.count({ where: { reversal_of_id: original.id } });
    expect(count).toBe(0); // The blocker has reversal_of_id null
  });
});
