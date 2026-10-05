import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const evaluateCareEligibilityFromDbMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/care/care-runtime-eligibility', () => ({
  evaluateCareEligibilityFromDb: evaluateCareEligibilityFromDbMock,
}));

import {
  CARE_ELIGIBILITY_SHADOW_AUDIT_ACTION,
  CARE_ELIGIBILITY_SHADOW_AUDIT_ENTITY_TYPE,
  CARE_ELIGIBILITY_SHADOW_FLAG_KEY,
  buildCareEligibilityShadowAuditPayload,
  evaluateCareEligibilityShadowMode,
  writeCareEligibilityShadowAuditTx,
  type CareEligibilityShadowAuditWriteClient,
} from '../src/services/care/care-eligibility-shadow-mode';
import { CARE_UNAVAILABLE_CODE } from '../src/services/care/care-readiness-policy';
import type { CareReadClient } from '../src/services/care/care-runtime-eligibility';

const db = {} as CareReadClient;
const now = new Date('2026-10-05T12:30:00.000Z');

describe('CARE-498 shadow audit trace', () => {
  it('builds a safe audit payload from the existing shadow decision', async () => {
    evaluateCareEligibilityFromDbMock.mockResolvedValue({
      eligible: false,
      reasons: ['CARE_PRICE_UNCONFIRMED', 'INSURANCE_NOT_CONFIRMED'],
    });

    const decision = await evaluateCareEligibilityShadowMode(
      db,
      { rideId: 'ride-shadow-1', driverId: 'driver-shadow-1', externalEvidence: null, now },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    );

    const payload = buildCareEligibilityShadowAuditPayload(decision);

    expect(payload).toEqual({
      version: 'care-eligibility-shadow-v1',
      kind: 'CARE_ELIGIBILITY_SHADOW_DECISION',
      rideId: 'ride-shadow-1',
      driverId: 'driver-shadow-1',
      evaluatedAt: now.toISOString(),
      shadowEnabled: true,
      status: 'SHADOW_EVALUATED',
      eligibilityEligible: false,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: CARE_UNAVAILABLE_CODE,
      reasons: [
        'CARE_SHADOW_ONLY_NOT_OPERATIONAL',
        'CARE_PRICE_UNCONFIRMED',
        'INSURANCE_NOT_CONFIRMED',
      ],
    });
    expect(JSON.stringify(payload)).not.toMatch(/password|token|medical|diagnosis|cid/i);
  });

  it('persists the shadow trace only through an explicit audit writer', async () => {
    evaluateCareEligibilityFromDbMock.mockResolvedValue({
      eligible: true,
      reasons: [],
    });

    const decision = await evaluateCareEligibilityShadowMode(
      db,
      { rideId: ' ride-shadow-2 ', driverId: ' driver-shadow-2 ', externalEvidence: null, now },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    );

    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
    } as unknown as CareEligibilityShadowAuditWriteClient;

    await writeCareEligibilityShadowAuditTx(tx, {
      adminId: 'care-shadow-auditor',
      decision,
      ipAddress: '127.0.0.1',
      userAgent: 'care-shadow-test',
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);

    const call = (tx.$executeRaw as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sql = Array.isArray(call[0]) ? call[0].join(' ') : String(call[0]);
    const values = call.slice(1);

    expect(sql).toContain('INSERT INTO admin_audit_logs');
    expect(sql).toContain('old_value, new_value, reason, ip_address, user_agent');

    expect(values).toContain('care-shadow-auditor');
    expect(values).toContain(CARE_ELIGIBILITY_SHADOW_AUDIT_ACTION);
    expect(values).toContain(CARE_ELIGIBILITY_SHADOW_AUDIT_ENTITY_TYPE);
    expect(values).toContain('ride-shadow-2');
    expect(values).toContain('CARE_SHADOW_ONLY_NOT_OPERATIONAL');
    expect(values).toContain('127.0.0.1');
    expect(values).toContain('care-shadow-test');

    const serializedPayload = values.find((value: unknown) =>
      typeof value === 'string' && value.includes('care-eligibility-shadow-v1'),
    ) as string;
    expect(JSON.parse(serializedPayload)).toMatchObject({
      version: 'care-eligibility-shadow-v1',
      rideId: 'ride-shadow-2',
      driverId: 'driver-shadow-2',
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: CARE_UNAVAILABLE_CODE,
    });
  });

  it('rejects missing audit actor and does not write a trace', async () => {
    const decision = await evaluateCareEligibilityShadowMode(
      db,
      { rideId: 'ride-shadow-3', driverId: 'driver-shadow-3', now },
      {},
    );

    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
    } as unknown as CareEligibilityShadowAuditWriteClient;

    await expect(writeCareEligibilityShadowAuditTx(tx, {
      adminId: ' ',
      decision,
    })).rejects.toThrow('CARE_SHADOW_AUDIT_ACTOR_INVALID');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not wire the shadow trace into routes dispatcher acceptance pricing wallet or migrations', () => {
    const route = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const dispatcher = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const acceptance = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const pricing = readFileSync('src/services/pricing-engine.ts', 'utf8');
    const walletShadow = readFileSync('src/services/wallet-shadow.service.ts', 'utf8');
    const service = readFileSync('src/services/care/care-eligibility-shadow-mode.ts', 'utf8');
    const doc = readFileSync('../docs/care/CARE-498-shadow-audit-trace.md', 'utf8');

    expect(route).not.toContain('writeCareEligibilityShadowAuditTx');
    expect(dispatcher).not.toContain('writeCareEligibilityShadowAuditTx');
    expect(acceptance).not.toContain('writeCareEligibilityShadowAuditTx');
    expect(pricing).not.toContain('writeCareEligibilityShadowAuditTx');
    expect(walletShadow).not.toContain('writeCareEligibilityShadowAuditTx');

    expect(service).toContain('INSERT INTO admin_audit_logs');
    expect(service).not.toContain('prisma.$transaction');
    expect(service).not.toContain('dispatchRide');
    expect(service).not.toContain('acceptOffer');
    expect(service).not.toContain('WalletSettlementService');

    expect(doc).toContain('sem migration');
    expect(doc).toContain('sem rota pública');
    expect(doc).toContain('sem dispatcher');
    expect(doc).toContain('sem aceite');
    expect(doc).toContain('sem pricing');
    expect(doc).toContain('sem wallet');
    expect(doc).toContain('sem deploy');
  });
});
