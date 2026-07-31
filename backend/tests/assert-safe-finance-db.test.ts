import { describe, it, expect } from 'vitest';
import {
  assertSafeFinanceDatabase,
  PRODUCTION_BLOCKED_ERROR,
} from '../src/lib/assert-safe-finance-db';

describe('assertSafeFinanceDatabase', () => {
  // ═══════════════════════════════════════════════════════════════════
  // RULE 1: NODE_ENV=production always blocks
  // ═══════════════════════════════════════════════════════════════════

  it('blocks when NODE_ENV=production (even with test DB name)', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'production',
        databaseUrl: 'postgresql://user:pass@localhost:5432/kaviar_test',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('blocks NODE_ENV=production even with ALLOW_LOCAL_FINANCE_DATABASE=true', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'production',
        allowLocalFinanceDatabase: 'true',
        databaseUrl: 'postgresql://user:pass@localhost:5432/kaviar_test',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  // ═══════════════════════════════════════════════════════════════════
  // RULE 2: Blocked hostname patterns (absolute, no override)
  // ═══════════════════════════════════════════════════════════════════

  it('blocks rds.amazonaws.com URLs', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl:
          'postgresql://user:pass@kaviar-db.abc123.us-east-2.rds.amazonaws.com:5432/kaviar',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('blocks rds.amazonaws.com even with test DB name', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl:
          'postgresql://user:pass@kaviar-db.abc123.us-east-2.rds.amazonaws.com:5432/kaviar_test',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('blocks rds.amazonaws.com even with ALLOW_LOCAL_FINANCE_DATABASE=true', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        allowLocalFinanceDatabase: 'true',
        databaseUrl:
          'postgresql://user:pass@host.rds.amazonaws.com:5432/kaviar_test',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('blocks URLs containing "production" in hostname', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@production-db.internal:5432/kaviar',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('blocks URLs containing "kaviar-prod" in hostname', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@kaviar-prod.cluster-xyz.rds.amazonaws.com:5432/kaviar',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  // ═══════════════════════════════════════════════════════════════════
  // RULE 3: DB name containing "test" or "dev" → allowed
  // ═══════════════════════════════════════════════════════════════════

  it('allows localhost with DB name containing "test"', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@localhost:5432/kaviar_test',
      })
    ).not.toThrow();
  });

  it('allows localhost with DB name containing "dev"', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'development',
        databaseUrl: 'postgresql://user:pass@localhost:5432/kaviar_dev',
      })
    ).not.toThrow();
  });

  it('allows 127.0.0.1 with test DB', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@127.0.0.1:5432/kaviar_test',
      })
    ).not.toThrow();
  });

  it('allows [::1] with dev DB', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'development',
        databaseUrl: 'postgresql://user:pass@[::1]:5432/kaviar_dev',
      })
    ).not.toThrow();
  });

  it('allows non-local hostname with test DB name', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@custom-staging-host:5432/kaviar_test',
      })
    ).not.toThrow();
  });

  it('allows non-local hostname with dev DB name', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'development',
        databaseUrl: 'postgresql://user:pass@staging.internal:5432/kaviar_dev',
      })
    ).not.toThrow();
  });

  // ═══════════════════════════════════════════════════════════════════
  // RULE 4/5: localhost WITHOUT test/dev in DB name
  // ═══════════════════════════════════════════════════════════════════

  it('BLOCKS localhost without test/dev in DB name (no override)', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@localhost:5432/kaviar',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('BLOCKS 127.0.0.1 without test/dev in DB name (no override)', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@127.0.0.1:5432/kaviar',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('allows localhost without test/dev when ALLOW_LOCAL_FINANCE_DATABASE=true', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        allowLocalFinanceDatabase: 'true',
        databaseUrl: 'postgresql://user:pass@localhost:5432/kaviar',
      })
    ).not.toThrow();
  });

  it('allows 127.0.0.1 without test/dev when ALLOW_LOCAL_FINANCE_DATABASE=true', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        allowLocalFinanceDatabase: 'true',
        databaseUrl: 'postgresql://user:pass@127.0.0.1:5432/kaviar',
      })
    ).not.toThrow();
  });

  it('allows [::1] without test/dev when ALLOW_LOCAL_FINANCE_DATABASE=true', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        allowLocalFinanceDatabase: 'true',
        databaseUrl: 'postgresql://user:pass@[::1]:5432/kaviar',
      })
    ).not.toThrow();
  });

  it('does NOT allow localhost with ALLOW_LOCAL_FINANCE_DATABASE=false', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        allowLocalFinanceDatabase: 'false',
        databaseUrl: 'postgresql://user:pass@localhost:5432/kaviar',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('blocks unknown remote hosts without test/dev in DB name', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@some-unknown-host.company.com:5432/kaviar',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('blocks unknown remote hosts even with ALLOW_LOCAL_FINANCE_DATABASE=true (not local)', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        allowLocalFinanceDatabase: 'true',
        databaseUrl: 'postgresql://user:pass@remote-host.company.com:5432/kaviar',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════

  it('blocks when DATABASE_URL is not set', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: undefined,
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  it('blocks when DATABASE_URL is not a valid URL', () => {
    expect(() =>
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'not-a-url',
      })
    ).toThrowError(PRODUCTION_BLOCKED_ERROR);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Error message quality / credential safety
  // ═══════════════════════════════════════════════════════════════════

  it('includes the hostname in error message for blocked patterns', () => {
    try {
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl:
          'postgresql://user:pass@kaviar-db.abc123.us-east-2.rds.amazonaws.com:5432/kaviar',
      });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('rds.amazonaws.com');
      expect(err.message).not.toContain('user:pass');
    }
  });

  it('never exposes credentials in error messages', () => {
    const secretUrl = 'postgresql://admin:super_secret_pass@localhost:5432/kaviar';
    try {
      assertSafeFinanceDatabase({ nodeEnv: 'test', databaseUrl: secretUrl });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).not.toContain('super_secret_pass');
      expect(err.message).not.toContain('admin');
    }
  });

  it('error message for local DB includes DB name and instructions', () => {
    try {
      assertSafeFinanceDatabase({
        nodeEnv: 'test',
        databaseUrl: 'postgresql://user:pass@localhost:5432/kaviar',
      });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('kaviar');
      expect(err.message).toContain('ALLOW_LOCAL_FINANCE_DATABASE');
    }
  });
});
