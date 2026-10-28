import { describe, expect, it, vi } from 'vitest';
import { WalletSettlementService } from '../src/services/wallet-v2/wallet-settlement.service';
import { MANAGER_COMMISSION_RATE_BPS, PLATFORM_FEE_RATE_BPS } from '../src/services/finance/territory/monetary';

const ELIGIBLE = {
  id: 'assignment-1', admin_id: 'manager-1',
  admin_is_active: true, admin_role: 'TERRITORIAL_MANAGER',
  profile_id: 'profile-1', operator_profile_id: 'profile-1',
  relationship_type: 'territorial_manager', is_active: true,
  document_status: 'verified', contract_status: 'signed', terms_version: 'v1.2',
  contract_url: 'contracts/example.pdf', pix_key: 'pix-example',
  responsibility_terms_accepted_at: new Date(),
  confidentiality_terms_accepted_at: new Date(),
};

async function observeManagerCommission(candidate: Record<string, unknown>) {
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      queries.push({ sql, args });
      if (sql.includes('clock_timestamp()')) return { rows: [{ ts: new Date('2026-10-28T20:00:00Z') }] };
      if (sql.includes('FROM territory_manager_assignments tma')) return { rows: [candidate] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const feeSplit = {
    getExistingSnapshot: vi.fn(async () => null),
    calculateSplit: vi.fn(() => { throw new Error('OBSERVED_COMMISSION'); }),
  };
  const service = new WalletSettlementService(
    { connect: async () => client } as any, {} as any, feeSplit as any,
    {} as any, {} as any, {} as any,
  );
  await expect(service.settleRide({
    rideId: 'ride-1', driverId: 'driver-1', finalPriceCents: 10000n,
    reservedCents: 1800n, territoryId: 'saquarema-id',
  })).rejects.toThrow('OBSERVED_COMMISSION');
  expect(client.release).toHaveBeenCalledOnce();
  const sql = queries.find(q => q.sql.includes('FROM territory_manager_assignments tma'));
  expect(sql?.sql).toContain('territory_manager_neighborhood_scope_versions');
  expect(sql?.sql).toContain('v.effective_from <= $2');
  expect(sql?.sql).toContain('v.canceled_at IS NULL');
  expect(sql?.args).toEqual(['saquarema-id', new Date('2026-10-28T20:00:00Z'), 'ride-1']);
  return feeSplit.calculateSplit.mock.calls[0]?.[2];
}

describe('Wallet V2: versioned financial neighborhood scope', () => {
  it('does not change legacy unversioned participation', async () => {
    expect(await observeManagerCommission({ ...ELIGIBLE, scope_version_id: null, origin_neighborhood_id: 'a' }))
      .toBe(MANAGER_COMMISSION_RATE_BPS);
  });

  it('grants commission only to an origin in the active version', async () => {
    expect(await observeManagerCommission({
      ...ELIGIBLE, scope_version_id: 'version-1', scope_neighborhood_ids: ['a', 'b'], origin_neighborhood_id: 'a',
    })).toBe(MANAGER_COMMISSION_RATE_BPS);
    expect(await observeManagerCommission({
      ...ELIGIBLE, scope_version_id: 'version-1', scope_neighborhood_ids: ['a', 'b'], origin_neighborhood_id: 'c',
    })).toBe(0);
  });

  it('defaults to KAVIAR for a missing origin or an explicitly empty scope', async () => {
    expect(await observeManagerCommission({
      ...ELIGIBLE, scope_version_id: 'version-2', scope_neighborhood_ids: [], origin_neighborhood_id: 'a',
    })).toBe(0);
    expect(await observeManagerCommission({
      ...ELIGIBLE, scope_version_id: 'version-2', scope_neighborhood_ids: ['a'], origin_neighborhood_id: null,
    })).toBe(0);
  });
});
