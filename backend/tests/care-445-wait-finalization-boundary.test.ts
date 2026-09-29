import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/rides-v2.ts'), 'utf8');
const start = source.indexOf('    // The official engine settles the locked fare');
const end = source.indexOf('    // Partner commission:', start);
const completion = source.slice(start, end);

describe('CARE-445 — complete uses only the official economic settlement writer', () => {
  it('does not mutate the official settlement in a second wait transaction', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(completion).toContain('pricingEngine.settle(');
    expect(completion).toContain('waitRatePerMinute: config.wait.ratePerMin');
    expect(completion).not.toContain('prisma.$executeRaw');
    expect(completion).not.toContain('prisma.$transaction');
    expect(completion).not.toContain('rides_v2.update(');
    expect(completion).not.toContain('WAIT_CHARGE_FAILED');
  });

  it('does not proceed to wallet or commission on unknown or missing settlement', () => {
    expect(completion).toContain("error: 'PRICING_SETTLEMENT_UNCONFIRMED'");
    expect(completion).toContain('if (!settlement)');
    expect(completion).toContain('return res.status(503)');
    expect(completion).toContain('settlement.wait_charge_cents ?? 0');
  });
});
