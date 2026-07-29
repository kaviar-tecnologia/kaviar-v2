/**
 * FeeSplitService Tests (Marco 3.2A - Commit 5)
 */
import { describe, expect, it } from 'vitest';
import { FeeSplitService, referenceMonthFromDate, COMPETENCE_TIMEZONE } from '../../src/services/wallet-v2/fee-split.service';

describe('FeeSplitService', () => {
  it('calculateSplit uses applyBasisPoints (18% fee, 40% manager)', () => {
    const svc = new FeeSplitService({} as any);
    const split = svc.calculateSplit(10000n);
    expect(split.fee_amount_cents).toBe(1800n);
    expect(split.manager_share_cents).toBe(720n);
    expect(split.matrix_share_cents).toBe(1080n);
    expect(split.matrix_share_cents + split.manager_share_cents).toBe(split.fee_amount_cents);
  });

  it('calculateSplit deterministic for odd amounts', () => {
    const svc = new FeeSplitService({} as any);
    const split = svc.calculateSplit(3333n);
    // 3333 * 1800 / 10000 = 5999400 / 10000 = 599.94 → rounds to 600
    expect(split.fee_amount_cents).toBe(600n);
    // 600 * 4000 / 10000 = 2400000 / 10000 = 240
    expect(split.manager_share_cents).toBe(240n);
    expect(split.matrix_share_cents).toBe(360n);
  });

  it('referenceMonthFromDate uses America/Sao_Paulo', () => {
    // Feb 1 02:59 UTC = Jan 31 23:59 BRT
    const d = new Date('2026-02-01T02:59:00.000Z');
    expect(referenceMonthFromDate(d)).toBe('2026-01');

    // Feb 1 03:00 UTC = Feb 1 00:00 BRT
    const d2 = new Date('2026-02-01T03:00:00.000Z');
    expect(referenceMonthFromDate(d2)).toBe('2026-02');
  });

  it('COMPETENCE_TIMEZONE is America/Sao_Paulo', () => {
    expect(COMPETENCE_TIMEZONE).toBe('America/Sao_Paulo');
  });
});
