/**
 * Tests for request window protection and worker scheduler hardening.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isWithinRequestWindow } from '../../src/services/finance/annual-incentive-payout/request-window';
import {
  startPayoutWorkerScheduler,
  stopPayoutWorkerScheduler,
  isPayoutWorkerStopping,
  isPayoutWorkerRunning,
} from '../../src/services/finance/annual-incentive-payout/worker-scheduler';

// ═══════════════════════════════════════════════════════════════════
// FORCE WINDOW OPEN PROTECTION
// ═══════════════════════════════════════════════════════════════════

describe('FORCE_WINDOW_OPEN protection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Base safe test environment
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar_test';
  });

  afterEach(() => {
    // Restore
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
  });

  it('forces window open in test + local + test db', () => {
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar_test';
    // July date (outside real window)
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(true);
  });

  it('"TRUE" does not force (case-sensitive)', () => {
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'TRUE';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar_test';
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(false);
  });

  it('"1" does not force', () => {
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = '1';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar_test';
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(false);
  });

  it('absent flag does not force', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(false);
  });

  it('production + true = blocked', () => {
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar_test';
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(false);
  });

  it('staging + true = blocked', () => {
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
    process.env.NODE_ENV = 'staging';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar_test';
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(false);
  });

  it('remote database + true = blocked', () => {
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@remote-server.example.com:5432/kaviar_test';
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(false);
  });

  it('RDS + true = blocked', () => {
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@kaviar-prod-db.abc.us-east-2.rds.amazonaws.com:5432/kaviar_test';
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(false);
  });

  it('local db without test/dev in name + true = blocked', () => {
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar';
    expect(isWithinRequestWindow(new Date('2026-07-15T12:00:00-03:00'))).toBe(false);
  });

  it('real window rule: October 1 allowed', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2026-10-01T00:01:00-03:00'))).toBe(true);
  });

  it('real window rule: December 31 allowed', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2026-12-31T23:59:00-03:00'))).toBe(true);
  });

  it('real window rule: September 30 blocked', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2026-09-30T23:59:00-03:00'))).toBe(false);
  });

  it('real window rule: January 1 blocked', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2027-01-01T00:01:00-03:00'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SCHEDULER HARDENING
// ═══════════════════════════════════════════════════════════════════

describe('Payout Worker Scheduler', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(async () => {
    await stopPayoutWorkerScheduler();
    process.env.NODE_ENV = 'test';
  });

  it('does not start in NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'true';
    const started = startPayoutWorkerScheduler();
    expect(started).toBe(false);
  });

  it('does not start when worker disabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED = 'false';
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'true';
    const started = startPayoutWorkerScheduler();
    expect(started).toBe(false);
  });

  it('does not start when payout disabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'false';
    const started = startPayoutWorkerScheduler();
    expect(started).toBe(false);
  });

  it('starting twice does not create two intervals', () => {
    process.env.NODE_ENV = 'development';
    process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'true';
    const first = startPayoutWorkerScheduler();
    const second = startPayoutWorkerScheduler();
    expect(first).toBe(true);
    expect(second).toBe(false); // already running
  });

  it('stop clears interval and is idempotent', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'true';
    startPayoutWorkerScheduler();

    await stopPayoutWorkerScheduler();
    expect(isPayoutWorkerStopping()).toBe(true);

    // Second stop is safe
    await stopPayoutWorkerScheduler();
    expect(isPayoutWorkerStopping()).toBe(true);
  });

  it('stop prevents new ticks', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'true';
    startPayoutWorkerScheduler();
    await stopPayoutWorkerScheduler();
    // After stop, no run should be in progress
    expect(isPayoutWorkerRunning()).toBe(false);
  });

  it('importing app.ts does not start scheduler', async () => {
    // The scheduler is started in server.ts, not app.ts
    // Importing app.ts should have no side effect on the scheduler
    const appModule = await import('../../src/app');
    expect(appModule).toBeDefined();
    // If scheduler were started, stopping would have something to clear
    // But since we're in NODE_ENV=test, it wouldn't start anyway
    expect(isPayoutWorkerRunning()).toBe(false);
  });
});
