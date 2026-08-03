/**
 * Integration tests for finance transaction reversal.
 * Requires: PostgreSQL at DATABASE_URL (local, not production).
 * Tests: atomicity, concurrency, rollback with real transactions.
 */
import { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { reverseFinanceTransaction } from '../src/services/finance/finance-transaction-reversal.service';

const TEST_DB_URL = process.env.DATABASE_URL;
if (!TEST_DB_URL || !TEST_DB_URL.includes('127.0.0.1')) {
  throw new Error('Integration tests require DATABASE_URL pointing to 127.0.0.1');
}

const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
const admin = { id: 'test-admin-001', email: 'test@test.local', role: 'SUPER_ADMIN' };

let testAccountId: string;
let testCategoryId: string;
let testAdminId: string;

beforeAll(async () => {
  // Create test admin
  const adm = await prisma.admins.create({ data: { id: admin.id, email: admin.email, name: 'Test Admin', role: 'SUPER_ADMIN', password: 'test-hash-not-real', is_active: true } });
  testAdminId = adm.id;

  // Create test account
  const acc = await prisma.financial_accounts.create({ data: { code: 'TEST-INT-001', name: 'Integration Test', type: 'BANK', is_active: true, is_cash_equivalent: false, allows_negative_balance: false, created_by_admin_id: testAdminId } });
  testAccountId = acc.id;

  // Create test category
  const cat = await prisma.financial_categories.create({ data: { code: 'TEST-INT-CAT', name: 'Test Category', kind: 'EXPENSE', is_active: true, is_postable: true, created_by_admin_id: testAdminId } });
  testCategoryId = cat.id;
});

afterAll(async () => {
  await prisma.financial_transactions.deleteMany({ where: { created_by_admin_id: testAdminId } });
  await prisma.financial_categories.deleteMany({ where: { code: 'TEST-INT-CAT' } });
  await prisma.financial_accounts.deleteMany({ where: { code: 'TEST-INT-001' } });
  await prisma.admins.deleteMany({ where: { id: testAdminId } });
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.financial_transactions.deleteMany({ where: { created_by_admin_id: testAdminId } });
});

async function createPostedTransaction(suffix = '') {
  return prisma.financial_transactions.create({
    data: {
      source_type: 'MANUAL', origin_type: 'MANUAL',
      account_id: testAccountId, category_id: testCategoryId,
      direction: 'OUT', transaction_type: 'EXPENSE', status: 'POSTED',
      payment_method: 'PIX',
      competence_date: new Date('2026-08-01'), transaction_date: new Date('2026-08-01'),
      settlement_date: new Date('2026-08-05'),
      gross_amount_cents: BigInt(15000), fee_amount_cents: BigInt(0),
      discount_amount_cents: BigInt(0), retention_amount_cents: BigInt(0),
      net_amount_cents: BigInt(15000),
      description: `Integration Test ${suffix}`,
      created_by_admin_id: testAdminId, responsible_admin_id: testAdminId,
      approved_by_admin_id: testAdminId,
    },
  });
}

describe('Reversal Integration — Real PostgreSQL', () => {
  it('successfully reverses a POSTED transaction', async () => {
    const original = await createPostedTransaction('success');

    const result = await reverseFinanceTransaction(original.id, {
      expected_updated_at: original.updated_at,
      reversal_date: new Date('2026-08-10T00:00:00.000Z'),
      reason: 'Pagamento duplicado',
    }, admin);

    expect(result.original?.status).toBe('REVERSED');
    expect(result.reversal?.transaction_type).toBe('REVERSAL');
    expect(result.reversal?.status).toBe('POSTED');
    expect(result.reversal?.direction).toBe('IN'); // reversed from OUT
    expect(result.reversal?.reversal_of_id).toBe(original.id);
    expect(result.reversal?.gross_amount_cents).toBe(BigInt(15000));
    expect(result.reversal?.payment_method).toBe('INTERNAL');
    expect(result.reversal?.idempotency_key).toBe(`finance-reversal:${original.id}`);

    // Verify in DB
    const dbOriginal = await prisma.financial_transactions.findUnique({ where: { id: original.id } });
    expect(dbOriginal?.status).toBe('REVERSED');

    const dbReversals = await prisma.financial_transactions.findMany({ where: { reversal_of_id: original.id } });
    expect(dbReversals).toHaveLength(1);
  });

  it('concurrent reversals: exactly one succeeds', async () => {
    const original = await createPostedTransaction('concurrency');
    const updatedAt = original.updated_at;

    const body = { expected_updated_at: updatedAt, reversal_date: new Date('2026-08-10T00:00:00.000Z'), reason: 'Concurrency test' };

    const results = await Promise.allSettled([
      reverseFinanceTransaction(original.id, body, admin),
      reverseFinanceTransaction(original.id, body, admin),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // Verify DB state
    const dbOriginal = await prisma.financial_transactions.findUnique({ where: { id: original.id } });
    expect(dbOriginal?.status).toBe('REVERSED');

    const reversals = await prisma.financial_transactions.findMany({ where: { reversal_of_id: original.id } });
    expect(reversals).toHaveLength(1);
  });

  it('rollback: P2002 idempotency conflict keeps original POSTED', async () => {
    const original = await createPostedTransaction('rollback');

    // Pre-insert a record with the idempotency key to force P2002
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
        description: 'Pre-existing', idempotency_key: `finance-reversal:${original.id}`,
        created_by_admin_id: testAdminId, responsible_admin_id: testAdminId,
      },
    });

    // Attempt reversal — should fail with 409 due to P2002 on idempotency_key
    await expect(
      reverseFinanceTransaction(original.id, {
        expected_updated_at: original.updated_at,
        reversal_date: new Date('2026-08-10T00:00:00.000Z'),
        reason: 'Should fail',
      }, admin)
    ).rejects.toThrow(/já possui um estorno/);

    // Verify original is still POSTED (transaction rolled back)
    const dbOriginal = await prisma.financial_transactions.findUnique({ where: { id: original.id } });
    expect(dbOriginal?.status).toBe('POSTED');
  });
});
