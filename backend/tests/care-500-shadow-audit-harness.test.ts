import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const evaluateCareEligibilityFromDbMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/care/care-runtime-eligibility', () => ({
  evaluateCareEligibilityFromDb: evaluateCareEligibilityFromDbMock,
}));

import {
  CARE_ELIGIBILITY_SHADOW_FLAG_KEY,
} from '../src/services/care/care-eligibility-shadow-mode';
import {
  CARE_SHADOW_AUDIT_HARNESS_REASON,
  CARE_SHADOW_AUDIT_HARNESS_VERSION,
  runCareShadowAuditHarnessTx,
  type CareShadowAuditHarnessClient,
} from '../src/services/care/care-shadow-audit-harness';
import { CARE_UNAVAILABLE_CODE } from '../src/services/care/care-readiness-policy';

const now = new Date('2026-10-05T13:30:00.000Z');

const makeTx = () => ({
  $executeRaw: vi.fn().mockResolvedValue(undefined),
}) as unknown as CareShadowAuditHarnessClient;

describe('CARE-500 shadow audit harness', () => {
  beforeEach(() => {
    evaluateCareEligibilityFromDbMock.mockReset();
  });

  it('runs the explicit internal harness and writes a shadow audit trace', async () => {
    evaluateCareEligibilityFromDbMock.mockResolvedValue({
      eligible: true,
      reasons: [],
    });

    const tx = makeTx();

    const result = await runCareShadowAuditHarnessTx(
      tx,
      {
        rideId: ' ride-500 ',
        driverId: ' driver-500 ',
        externalEvidence: null,
        now,
        adminId: 'care-shadow-harness-admin',
        ipAddress: '127.0.0.1',
        userAgent: 'care-500-test',
      },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    );

    expect(evaluateCareEligibilityFromDbMock).toHaveBeenCalledWith(
      tx,
      'ride-500',
      'driver-500',
      null,
      now,
    );

    expect(result).toMatchObject({
      version: CARE_SHADOW_AUDIT_HARNESS_VERSION,
      harnessOnly: true,
      auditWritten: true,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: CARE_UNAVAILABLE_CODE,
    });
    expect(result.decision.status).toBe('SHADOW_EVALUATED');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const call = (tx.$executeRaw as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sql = Array.isArray(call[0]) ? call[0].join(' ') : String(call[0]);
    const values = call.slice(1);

    expect(sql).toContain('INSERT INTO admin_audit_logs');
    expect(values).toContain('care-shadow-harness-admin');
    expect(values).toContain('CARE_ELIGIBILITY_SHADOW_DECISION');
    expect(values).toContain('care_eligibility_shadow');
    expect(values).toContain('ride-500');
    expect(values).toContain(CARE_SHADOW_AUDIT_HARNESS_REASON);
  });

  it('records disabled shadow decisions without reading runtime eligibility', async () => {
    const tx = makeTx();

    const result = await runCareShadowAuditHarnessTx(
      tx,
      {
        rideId: 'ride-disabled-500',
        driverId: 'driver-disabled-500',
        now,
        adminId: 'care-shadow-harness-admin',
        reason: 'manual internal harness check',
      },
      {},
    );

    expect(evaluateCareEligibilityFromDbMock).not.toHaveBeenCalled();
    expect(result.decision.status).toBe('SHADOW_DISABLED');
    expect(result.decision.reasons).toEqual(['CARE_SHADOW_DISABLED']);
    expect(result.auditWritten).toBe(true);
    expect(result.operationAllowed).toBe(false);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);

    const values = (tx.$executeRaw as unknown as ReturnType<typeof vi.fn>).mock.calls[0].slice(1);
    expect(values).toContain('manual internal harness check');
  });

  it('propagates audit persistence errors without granting operation permission', async () => {
    evaluateCareEligibilityFromDbMock.mockResolvedValue({
      eligible: true,
      reasons: [],
    });

    const tx = {
      $executeRaw: vi.fn().mockRejectedValue(new Error('audit insert failed')),
    } as unknown as CareShadowAuditHarnessClient;

    await expect(runCareShadowAuditHarnessTx(
      tx,
      {
        rideId: 'ride-fail-500',
        driverId: 'driver-fail-500',
        now,
        adminId: 'care-shadow-harness-admin',
      },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    )).rejects.toThrow('audit insert failed');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('requires an audit actor and never executes runtime eligibility when shadow is disabled', async () => {
    const tx = makeTx();

    await expect(runCareShadowAuditHarnessTx(
      tx,
      {
        rideId: 'ride-missing-actor-500',
        driverId: 'driver-missing-actor-500',
        now,
        adminId: ' ',
      },
      {},
    )).rejects.toThrow('CARE_SHADOW_AUDIT_ACTOR_INVALID');

    expect(evaluateCareEligibilityFromDbMock).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('is not wired to routes dispatcher acceptance pricing wallet migrations or production', () => {
    const route = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const dispatcher = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const acceptance = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const pricing = readFileSync('src/services/pricing-engine.ts', 'utf8');
    const walletShadow = readFileSync('src/services/wallet-shadow.service.ts', 'utf8');
    const harness = readFileSync('src/services/care/care-shadow-audit-harness.ts', 'utf8');
    const doc = readFileSync('../docs/care/CARE-500-shadow-audit-harness.md', 'utf8');

    expect(route).not.toContain('runCareShadowAuditHarnessTx');
    expect(dispatcher).not.toContain('runCareShadowAuditHarnessTx');
    expect(acceptance).not.toContain('runCareShadowAuditHarnessTx');
    expect(pricing).not.toContain('runCareShadowAuditHarnessTx');
    expect(walletShadow).not.toContain('runCareShadowAuditHarnessTx');

    expect(harness).toContain('runCareShadowAuditHarnessTx');
    expect(harness).toContain('evaluateAndWriteCareEligibilityShadowAuditTx');
    expect(harness).not.toContain('prisma.$transaction');
    expect(harness).not.toContain('dispatchRide');
    expect(harness).not.toContain('acceptOffer');
    expect(harness).not.toContain('WalletSettlementService');

    expect(doc).toContain('sem rota pública');
    expect(doc).toContain('sem dispatcher');
    expect(doc).toContain('sem aceite');
    expect(doc).toContain('sem pricing');
    expect(doc).toContain('sem wallet');
    expect(doc).toContain('sem migration');
    expect(doc).toContain('sem deploy');
  });
});
