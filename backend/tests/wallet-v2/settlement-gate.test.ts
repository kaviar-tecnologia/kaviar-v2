/**
 * Settlement Maintenance Gate Tests (Marco 3.2A - Commit 3)
 */

import { afterEach, describe, expect, it } from 'vitest';
import { assertSettlementActive, isSettlementPaused, SettlementPausedError } from '../../src/services/wallet-v2/settlement-gate';

describe('Settlement Maintenance Gate', () => {
  afterEach(() => {
    delete process.env.SETTLEMENT_PAUSED;
  });

  it('isSettlementPaused returns false when env is not set', () => {
    delete process.env.SETTLEMENT_PAUSED;
    expect(isSettlementPaused()).toBe(false);
  });

  it('isSettlementPaused returns false when env is "false"', () => {
    process.env.SETTLEMENT_PAUSED = 'false';
    expect(isSettlementPaused()).toBe(false);
  });

  it('isSettlementPaused returns true when env is "true"', () => {
    process.env.SETTLEMENT_PAUSED = 'true';
    expect(isSettlementPaused()).toBe(true);
  });

  it('assertSettlementActive does not throw when not paused', () => {
    process.env.SETTLEMENT_PAUSED = 'false';
    expect(() => assertSettlementActive()).not.toThrow();
  });

  it('assertSettlementActive throws SettlementPausedError when paused', () => {
    process.env.SETTLEMENT_PAUSED = 'true';
    expect(() => assertSettlementActive()).toThrow(SettlementPausedError);
  });

  it('SettlementPausedError has correct code and statusCode', () => {
    const error = new SettlementPausedError();
    expect(error.code).toBe('SETTLEMENT_PAUSED');
    expect(error.statusCode).toBe(503);
    expect(error.message).toContain('paused for maintenance');
  });

  it('settleRide would throw when paused (unit verification)', () => {
    process.env.SETTLEMENT_PAUSED = 'true';

    // Verify the gate function itself works (settleRide calls it first)
    let caught: any = null;
    try {
      assertSettlementActive();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SettlementPausedError);
    expect(caught.code).toBe('SETTLEMENT_PAUSED');
  });

  it('operations proceed normally when SETTLEMENT_PAUSED=false', () => {
    process.env.SETTLEMENT_PAUSED = 'false';
    // Should not throw
    assertSettlementActive();
    assertSettlementActive();
    assertSettlementActive();
  });
});
