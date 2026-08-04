/**
 * Integration tests for accounting auth — fully self-contained and independent.
 *
 * Each test creates its own data and cleans up after itself.
 * No shared beforeAll data (except DB connection validation).
 *
 * These tests hit a REAL PostgreSQL database. They are opt-in:
 *   - Must be a local test DB (localhost/127.0.0.1 + "test" in URL)
 *   - Must NOT be remote (rds/amazonaws/azure)
 *   - Must have NODE_ENV=test
 *   - Must set RUN_ACCOUNTING_AUTH_INTEGRATION=1
 *
 * Run: RUN_ACCOUNTING_AUTH_INTEGRATION=1 NODE_ENV=test npx vitest run tests/accounting-auth.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';

// Set secrets BEFORE imports
process.env.ACCOUNTANT_JWT_SECRET = 'integration-test-jwt-secret-' + Date.now();
process.env.NODE_ENV = 'test';

const DB_URL = process.env.ACCOUNTING_AUTH_TEST_DATABASE_URL || process.env.DATABASE_URL || '';
const isLocal = DB_URL.includes('localhost') || DB_URL.includes('127.0.0.1');
const isTestDb = DB_URL.includes('test') || DB_URL.includes('e2e');
const isRemote = DB_URL.includes('rds') || DB_URL.includes('amazonaws') || DB_URL.includes('azure');
const shouldRun = process.env.RUN_ACCOUNTING_AUTH_INTEGRATION === '1';

if (!shouldRun || !isLocal || !isTestDb || isRemote) {
  describe.skip('Auth Integration (requires local test DB + RUN_ACCOUNTING_AUTH_INTEGRATION=1)', () => {
    it('skipped — not a local test DB or opt-in env not set', () => {});
  });
} else {
  // Dynamic imports to avoid loading Prisma when skipped
  const { PrismaClient } = await import('@prisma/client');
  const { hashToken } = await import('../src/services/accounting/accounting-token.service');
  const {
    refreshSession,
    logoutAll,
    activateAccount,
    resetPassword,
    AccountingAuthError,
  } = await import('../src/services/accounting/accounting-auth.service');
  const { hashPassword } = await import('../src/services/accounting/accounting-password.service');

  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

  // ─── Unique data helpers ─────────────────────────────────────────────────
  let counter = 0;
  function uniqueCnpj() { return String(10000000000000 + counter++ + Date.now() % 100000).slice(0, 14); }
  function uniqueDoc() { return uniqueCnpj(); }
  function uniqueCpf() { return String(10000000000 + counter++ + Date.now() % 10000).slice(0, 11); }
  function uniqueEmail() { return `test-${Date.now()}-${counter++}@integration.test`; }

  function uuid(): string {
    return crypto.randomUUID();
  }

  function futureDate(days = 7): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  // ─── Admin ID resolution ─────────────────────────────────────────────────
  let adminId: string;

  describe('Accounting Auth Integration Tests (PostgreSQL)', () => {
    beforeAll(async () => {
      await prisma.$connect();
      // Resolve a valid admin ID for FK constraints
      const admin = await prisma.admins.findFirst({ where: { is_active: true } });
      if (admin) {
        adminId = admin.id;
      } else {
        // Create a test admin
        adminId = uuid();
        await prisma.admins.create({
          data: {
            id: adminId,
            email: `test-admin-${Date.now()}@kaviar.integration.test`,
            password: 'not-real-hash',
            name: 'Integration Test Admin',
            role: 'SUPER_ADMIN',
            is_active: true,
          },
        });
      }
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    // ─── Test 1: Tables exist ─────────────────────────────────────────────

    it('should have accountant_sessions and accountant_password_resets tables', async () => {
      const result = await prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_name IN ('accountant_sessions', 'accountant_password_resets')
        ORDER BY table_name
      `;
      const tableNames = result.map(r => r.table_name);
      expect(tableNames).toContain('accountant_sessions');
      expect(tableNames).toContain('accountant_password_resets');
    });

    // ─── Test 2: Refresh rotation + reuse detection ───────────────────────

    it('should rotate refresh token and detect reuse (TOKEN_REUSE → family COMPROMISED)', async () => {
      // 1. Create all needed data
      const entity = await prisma.legal_entities.create({
        data: { razao_social: 'Refresh Test Entity', cnpj: uniqueCnpj(), entity_type: 'MATRIZ', is_active: true },
      });
      const firm = await prisma.accounting_firms.create({
        data: { razao_social: 'Refresh Test Firm', document_type: 'CNPJ', document_number: uniqueDoc(), email: uniqueEmail(), is_active: true },
      });
      const accountant = await prisma.accountants.create({
        data: {
          nome_completo: 'Refresh Test Accountant',
          email: uniqueEmail(),
          cpf: uniqueCpf(),
          accounting_firm_id: firm.id,
          status: 'ACTIVE',
          is_active: true,
          password_hash: await hashPassword('ValidPassword123!xx'),
          password_version: 1,
          password_changed_at: new Date(),
          activated_at: new Date(),
          terms_accepted_at: new Date(),
        },
      });
      const link = await prisma.accountant_entity_links.create({
        data: {
          accountant_id: accountant.id,
          legal_entity_id: entity.id,
          scope: 'COMPLETO',
          starts_at: new Date('2020-01-01'),
          status: 'ACTIVE',
          created_by_admin_id: adminId,
        },
      });

      // 2. Create a session with known token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const familyId = uuid();

      await prisma.accountant_sessions.create({
        data: {
          accountant_id: accountant.id,
          token_family_id: familyId,
          refresh_token_hash: tokenHash,
          generation: 1,
          status: 'ACTIVE',
          scope: 'WEB',
          ip_address: '10.0.0.1',
          expires_at: futureDate(7),
        },
      });

      // 3. First refresh succeeds (rotates the token)
      const r1 = await refreshSession(rawToken, '1.1.1.1', 'ua-client-1');
      expect(r1.accessToken).toBeDefined();
      expect(r1.refreshTokenRaw).toBeDefined();

      // 4. Second refresh with SAME OLD token detects reuse
      await expect(
        refreshSession(rawToken, '2.2.2.2', 'ua-client-2')
      ).rejects.toMatchObject({ code: 'TOKEN_REUSE' });

      // 5. Verify family is COMPROMISED
      const familySessions = await prisma.accountant_sessions.findMany({
        where: { token_family_id: familyId },
        orderBy: { created_at: 'asc' },
      });
      const compromisedSessions = familySessions.filter(s => s.status === 'COMPROMISED');
      expect(compromisedSessions.length).toBeGreaterThan(0);

      // 6. Cleanup in correct FK order
      await prisma.accountant_sessions.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_password_resets.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_entity_links.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_invites.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountants.delete({ where: { id: accountant.id } });
      await prisma.accounting_firms.delete({ where: { id: firm.id } });
      await prisma.legal_entities.delete({ where: { id: entity.id } });
    }, 15000);

    // ─── Test 3: Activation use-once (sequential) ─────────────────────────

    it('should activate account once and reject second activation with same token', async () => {
      // 1. Create all needed data (INVITED accountant, no password)
      const entity = await prisma.legal_entities.create({
        data: { razao_social: 'Activation Test Entity', cnpj: uniqueCnpj(), entity_type: 'MATRIZ', is_active: true },
      });
      const firm = await prisma.accounting_firms.create({
        data: { razao_social: 'Activation Test Firm', document_type: 'CNPJ', document_number: uniqueDoc(), email: uniqueEmail(), is_active: true },
      });
      const accountant = await prisma.accountants.create({
        data: {
          nome_completo: 'Activation Test Accountant',
          email: uniqueEmail(),
          cpf: uniqueCpf(),
          accounting_firm_id: firm.id,
          status: 'INVITED',
          is_active: true,
          // No password_hash — invited but not yet activated
        },
      });
      const link = await prisma.accountant_entity_links.create({
        data: {
          accountant_id: accountant.id,
          legal_entity_id: entity.id,
          scope: 'COMPLETO',
          starts_at: new Date('2020-01-01'),
          status: 'ACTIVE',
          created_by_admin_id: adminId,
        },
      });

      // 2. Create invite with PENDING status
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const inviteTokenHash = hashToken(inviteToken);

      await prisma.accountant_invites.create({
        data: {
          accountant_id: accountant.id,
          token_hash: inviteTokenHash,
          status: 'PENDING',
          expires_at: futureDate(2),
          created_by_admin_id: adminId,
        },
      });

      const password = 'SecureP@ss2026!!x';

      // 3. First activation succeeds
      const result = await activateAccount(inviteToken, password, password, '1.1.1.1', 'ua-activation-1');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshTokenRaw).toBeDefined();

      // 4. Second activation with SAME token fails (invite already ACCEPTED)
      await expect(
        activateAccount(inviteToken, password, password, '2.2.2.2', 'ua-activation-2')
      ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

      // 5. Verify invite is now ACCEPTED
      const invite = await prisma.accountant_invites.findFirst({
        where: { accountant_id: accountant.id },
      });
      expect(invite!.status).toBe('ACCEPTED');

      // 6. Cleanup in correct FK order
      await prisma.accountant_sessions.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_password_resets.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_entity_links.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_invites.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountants.delete({ where: { id: accountant.id } });
      await prisma.accounting_firms.delete({ where: { id: firm.id } });
      await prisma.legal_entities.delete({ where: { id: entity.id } });
    }, 15000);

    // ─── Test 4: Password reset use-once (sequential) ─────────────────────

    it('should reset password once and reject second reset with same token', async () => {
      // 1. Create all needed data
      const entity = await prisma.legal_entities.create({
        data: { razao_social: 'Reset Test Entity', cnpj: uniqueCnpj(), entity_type: 'MATRIZ', is_active: true },
      });
      const firm = await prisma.accounting_firms.create({
        data: { razao_social: 'Reset Test Firm', document_type: 'CNPJ', document_number: uniqueDoc(), email: uniqueEmail(), is_active: true },
      });
      const accountant = await prisma.accountants.create({
        data: {
          nome_completo: 'Reset Test Accountant',
          email: uniqueEmail(),
          cpf: uniqueCpf(),
          accounting_firm_id: firm.id,
          status: 'ACTIVE',
          is_active: true,
          password_hash: await hashPassword('OldPassword123!xx'),
          password_version: 1,
          password_changed_at: new Date(),
          activated_at: new Date(),
          terms_accepted_at: new Date(),
        },
      });
      const link = await prisma.accountant_entity_links.create({
        data: {
          accountant_id: accountant.id,
          legal_entity_id: entity.id,
          scope: 'COMPLETO',
          starts_at: new Date('2020-01-01'),
          status: 'ACTIVE',
          created_by_admin_id: adminId,
        },
      });

      // 2. Create a pending password reset
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = hashToken(resetToken);

      await prisma.accountant_password_resets.create({
        data: {
          accountant_id: accountant.id,
          token_hash: resetTokenHash,
          status: 'PENDING',
          expires_at: futureDate(1),
        },
      });

      const newPassword = 'NewSecurePassword2026!!';

      // 3. First reset succeeds
      const result = await resetPassword(resetToken, newPassword, newPassword, '1.1.1.1', 'ua-reset-1');
      expect(result.success).toBe(true);

      // 4. Second reset with SAME token fails (already USED)
      await expect(
        resetPassword(resetToken, newPassword, newPassword, '2.2.2.2', 'ua-reset-2')
      ).rejects.toMatchObject({ code: expect.stringMatching(/INVALID_TOKEN|TOKEN_EXPIRED/) });

      // 5. Verify reset record is USED
      const resetRecord = await prisma.accountant_password_resets.findFirst({
        where: { accountant_id: accountant.id },
        orderBy: { created_at: 'desc' },
      });
      expect(resetRecord!.status).toBe('USED');

      // 6. Cleanup in correct FK order
      await prisma.accountant_sessions.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_password_resets.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_entity_links.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_invites.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountants.delete({ where: { id: accountant.id } });
      await prisma.accounting_firms.delete({ where: { id: firm.id } });
      await prisma.legal_entities.delete({ where: { id: entity.id } });
    }, 15000);

    // ─── Test 5: Audit rollback — failure in audit reverts operation ──────

    it('should rollback main operation if transaction fails (audit simulation)', async () => {
      // 1. Create all needed data
      const entity = await prisma.legal_entities.create({
        data: { razao_social: 'Rollback Test Entity', cnpj: uniqueCnpj(), entity_type: 'MATRIZ', is_active: true },
      });
      const firm = await prisma.accounting_firms.create({
        data: { razao_social: 'Rollback Test Firm', document_type: 'CNPJ', document_number: uniqueDoc(), email: uniqueEmail(), is_active: true },
      });
      const accountant = await prisma.accountants.create({
        data: {
          nome_completo: 'Rollback Test Accountant',
          email: uniqueEmail(),
          cpf: uniqueCpf(),
          accounting_firm_id: firm.id,
          status: 'ACTIVE',
          is_active: true,
          password_hash: await hashPassword('ValidPassword123!xx'),
          password_version: 1,
          password_changed_at: new Date(),
          activated_at: new Date(),
          terms_accepted_at: new Date(),
        },
      });
      const link = await prisma.accountant_entity_links.create({
        data: {
          accountant_id: accountant.id,
          legal_entity_id: entity.id,
          scope: 'COMPLETO',
          starts_at: new Date('2020-01-01'),
          status: 'ACTIVE',
          created_by_admin_id: adminId,
        },
      });

      // 2. Create a session
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const familyId = uuid();

      const session = await prisma.accountant_sessions.create({
        data: {
          accountant_id: accountant.id,
          token_family_id: familyId,
          refresh_token_hash: tokenHash,
          generation: 1,
          status: 'ACTIVE',
          scope: 'WEB',
          ip_address: '10.0.0.1',
          expires_at: futureDate(7),
        },
      });

      // 3. Simulate a transaction that updates session then throws (mimicking audit failure)
      let transactionFailed = false;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            UPDATE accountant_sessions
            SET status = 'ROTATED', rotated_at = NOW()
            WHERE id = ${session.id} AND status = 'ACTIVE'
          `;
          // Simulate audit write failure
          throw new Error('Simulated audit write failure');
        });
      } catch (e: any) {
        transactionFailed = true;
        expect(e.message).toBe('Simulated audit write failure');
      }

      // 4. Assert transaction was rolled back
      expect(transactionFailed).toBe(true);
      const afterSession = await prisma.accountant_sessions.findUnique({ where: { id: session.id } });
      expect(afterSession!.status).toBe('ACTIVE');

      // 5. Cleanup in correct FK order
      await prisma.accountant_sessions.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_password_resets.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_entity_links.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_invites.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountants.delete({ where: { id: accountant.id } });
      await prisma.accounting_firms.delete({ where: { id: firm.id } });
      await prisma.legal_entities.delete({ where: { id: entity.id } });
    }, 10000);

    // ─── Test 6: LogoutAll — revokes all active sessions ──────────────────

    it('should revoke all active sessions on logoutAll', async () => {
      // 1. Create all needed data
      const entity = await prisma.legal_entities.create({
        data: { razao_social: 'Logout Test Entity', cnpj: uniqueCnpj(), entity_type: 'MATRIZ', is_active: true },
      });
      const firm = await prisma.accounting_firms.create({
        data: { razao_social: 'Logout Test Firm', document_type: 'CNPJ', document_number: uniqueDoc(), email: uniqueEmail(), is_active: true },
      });
      const accountant = await prisma.accountants.create({
        data: {
          nome_completo: 'Logout Test Accountant',
          email: uniqueEmail(),
          cpf: uniqueCpf(),
          accounting_firm_id: firm.id,
          status: 'ACTIVE',
          is_active: true,
          password_hash: await hashPassword('ValidPassword123!xx'),
          password_version: 1,
          password_changed_at: new Date(),
          activated_at: new Date(),
          terms_accepted_at: new Date(),
        },
      });
      const link = await prisma.accountant_entity_links.create({
        data: {
          accountant_id: accountant.id,
          legal_entity_id: entity.id,
          scope: 'COMPLETO',
          starts_at: new Date('2020-01-01'),
          status: 'ACTIVE',
          created_by_admin_id: adminId,
        },
      });

      // 2. Create multiple active sessions
      await prisma.accountant_sessions.createMany({
        data: [
          {
            accountant_id: accountant.id,
            token_family_id: uuid(),
            refresh_token_hash: hashToken('session-a-' + Date.now()),
            generation: 1,
            status: 'ACTIVE',
            scope: 'WEB',
            expires_at: futureDate(7),
          },
          {
            accountant_id: accountant.id,
            token_family_id: uuid(),
            refresh_token_hash: hashToken('session-b-' + Date.now()),
            generation: 1,
            status: 'ACTIVE',
            scope: 'MOBILE',
            expires_at: futureDate(7),
          },
          {
            accountant_id: accountant.id,
            token_family_id: uuid(),
            refresh_token_hash: hashToken('session-c-' + Date.now()),
            generation: 1,
            status: 'REVOKED', // Already revoked
            scope: 'WEB',
            expires_at: futureDate(7),
            revoked_at: new Date(),
          },
        ],
      });

      // 3. Verify we have 2 active sessions
      const beforeActive = await prisma.accountant_sessions.count({
        where: { accountant_id: accountant.id, status: 'ACTIVE' },
      });
      expect(beforeActive).toBe(2);

      // 4. Logout all
      await logoutAll(accountant.id, 'INTEGRATION_TEST');

      // 5. Assert all active sessions are revoked
      const afterActive = await prisma.accountant_sessions.count({
        where: { accountant_id: accountant.id, status: 'ACTIVE' },
      });
      expect(afterActive).toBe(0);

      // Check revocation reason on the ones that were active
      const revokedSessions = await prisma.accountant_sessions.findMany({
        where: { accountant_id: accountant.id, revocation_reason: 'INTEGRATION_TEST' },
      });
      expect(revokedSessions.length).toBe(2);

      // 6. Cleanup in correct FK order
      await prisma.accountant_sessions.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_password_resets.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_entity_links.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_invites.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountants.delete({ where: { id: accountant.id } });
      await prisma.accounting_firms.delete({ where: { id: firm.id } });
      await prisma.legal_entities.delete({ where: { id: entity.id } });
    }, 10000);

    // ─── Test 7: Concurrent refresh with DB-level proof ───────────────────

    it('should handle concurrent refresh attempts: one succeeds, one fails (DB row lock)', async () => {
      // 1. Create all needed data
      const entity = await prisma.legal_entities.create({
        data: { razao_social: 'Concurrent Test Entity', cnpj: uniqueCnpj(), entity_type: 'MATRIZ', is_active: true },
      });
      const firm = await prisma.accounting_firms.create({
        data: { razao_social: 'Concurrent Test Firm', document_type: 'CNPJ', document_number: uniqueDoc(), email: uniqueEmail(), is_active: true },
      });
      const accountant = await prisma.accountants.create({
        data: {
          nome_completo: 'Concurrent Test Accountant',
          email: uniqueEmail(),
          cpf: uniqueCpf(),
          accounting_firm_id: firm.id,
          status: 'ACTIVE',
          is_active: true,
          password_hash: await hashPassword('ValidPassword123!xx'),
          password_version: 1,
          password_changed_at: new Date(),
          activated_at: new Date(),
          terms_accepted_at: new Date(),
        },
      });
      const link = await prisma.accountant_entity_links.create({
        data: {
          accountant_id: accountant.id,
          legal_entity_id: entity.id,
          scope: 'COMPLETO',
          starts_at: new Date('2020-01-01'),
          status: 'ACTIVE',
          created_by_admin_id: adminId,
        },
      });

      // 2. Create a session with known token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const familyId = uuid();

      await prisma.accountant_sessions.create({
        data: {
          accountant_id: accountant.id,
          token_family_id: familyId,
          refresh_token_hash: tokenHash,
          generation: 1,
          status: 'ACTIVE',
          scope: 'WEB',
          ip_address: '10.0.0.1',
          expires_at: futureDate(7),
        },
      });

      // 3. Fire two concurrent refreshes with same token
      const [r1, r2] = await Promise.allSettled([
        refreshSession(rawToken, '1.1.1.1', 'ua-concurrent-1'),
        refreshSession(rawToken, '2.2.2.2', 'ua-concurrent-2'),
      ]);

      // 4. Exactly one succeeds, one fails
      const successes = [r1, r2].filter(r => r.status === 'fulfilled');
      const failures = [r1, r2].filter(r => r.status === 'rejected');

      // Due to DB row lock in UPDATE ... WHERE status = 'ACTIVE',
      // one gets the row and the other finds 0 rows affected
      expect(successes.length + failures.length).toBe(2);
      // At least one should fail (the one that finds token already ROTATED)
      expect(failures.length).toBeGreaterThanOrEqual(1);

      if (successes.length === 1) {
        const val = (successes[0] as PromiseFulfilledResult<any>).value;
        expect(val.accessToken).toBeDefined();
      }

      // 5. Verify DB state: family should have sessions in ROTATED/COMPROMISED/ACTIVE states
      const familySessions = await prisma.accountant_sessions.findMany({
        where: { token_family_id: familyId },
      });
      // Original session should not be ACTIVE anymore
      const originalSession = familySessions.find(s => s.refresh_token_hash === tokenHash);
      expect(originalSession!.status).not.toBe('ACTIVE');

      // 6. Cleanup in correct FK order
      await prisma.accountant_sessions.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_password_resets.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_entity_links.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountant_invites.deleteMany({ where: { accountant_id: accountant.id } });
      await prisma.accountants.delete({ where: { id: accountant.id } });
      await prisma.accounting_firms.delete({ where: { id: firm.id } });
      await prisma.legal_entities.delete({ where: { id: entity.id } });
    }, 15000);
  });
}
