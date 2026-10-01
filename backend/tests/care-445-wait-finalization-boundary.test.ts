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

  it('requires a compare-and-set on completion even for rides without wait', () => {
    const routeStart = source.indexOf("router.post('/:ride_id/complete'");
    const routeEnd = source.indexOf('// 5.9 Passenger boarding', routeStart);
    const route = source.slice(routeStart, routeEnd);
    expect(routeStart).toBeGreaterThan(0);
    expect(routeEnd).toBeGreaterThan(routeStart);
    expect(route).not.toContain('tx.rides_v2.update({');
    expect(route).toContain("status: 'in_progress'");
    expect(route).toContain('if (completed.count !== 1)');
  });

  it('renders the driver wait notification from the persisted settlement, not a hard-coded rate', () => {
    const routeStart = source.indexOf("router.post('/:ride_id/complete'");
    const routeEnd = source.indexOf('// 5.9 Passenger boarding', routeStart);
    const route = source.slice(routeStart, routeEnd);
    expect(route).toContain('const waitCharge = _shadowWaitCents / 100;');
    expect(route).not.toContain('waitMinutes * 0.50');
  });

  it('does not proceed to wallet or commission on unknown or missing settlement', () => {
    expect(completion).toContain("error: 'PRICING_SETTLEMENT_UNCONFIRMED'");
    expect(completion).toContain('if (!settlement)');
    expect(completion).toContain('return res.status(503)');
    expect(completion).toContain('settlement.wait_charge_cents ?? 0');
  });
});
