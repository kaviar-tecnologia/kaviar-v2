import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-482 dispatcher filters gated', () => {
  it('keeps CARE dispatch blocked before candidates and offers', () => {
    const source = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const block = source.indexOf('CARE_DISPATCH_BLOCKED');
    const candidates = source.indexOf('const allCandidates = await this.findCandidates(ride)');
    const offer = source.indexOf('tx.ride_offers.create({');
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(candidates);
    expect(block).toBeLessThan(offer);
    expect(source).toContain('care_ineligible: 0');
    expect(source).toContain('evaluateCareEligibilityFromDb');
    expect(source).toContain('throw new Error(CARE_UNAVAILABLE_CODE)');
  });
});
