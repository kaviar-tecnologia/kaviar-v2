import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const evaluateCareEligibilityFromDbMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/care/care-runtime-eligibility', () => ({
  evaluateCareEligibilityFromDb: evaluateCareEligibilityFromDbMock,
}));

import {
  CARE_ELIGIBILITY_SHADOW_FLAG_KEY,
  evaluateAndWriteCareEligibilityShadowAuditTx,
  type CareEligibilityShadowAuditCallerClient,
} from '../src/services/care/care-eligibility-shadow-mode';
import { CARE_UNAVAILABLE_CODE } from '../src/services/care/care-readiness-policy';

const now = new Date('2026-10-05T13:00:00.000Z');

const makeTx = () => ({
  $executeRaw: vi.fn().mockResolvedValue(undefined),
}) as unknown as CareEligibilityShadowAuditCallerClient;

describe('CARE-499 shadow audit caller', () => {
  beforeEach(() => {
    evaluateCareEligibilityFromDbMock.mockReset();
  });

  it('evaluates shadow eligibility and writes the audit trace when explicitly called', async () => {
    evaluateCareEligibilityFromDbMock.mockResolvedValue({
      eligible: true,
      reasons: [],
    });

    const tx = makeTx();

    const result = await evaluateAndWriteCareEligibilityShadowAuditTx(
      tx,
      {
        rideId: ' ride-499 ',
        driverId: ' driver-499 ',
        externalEvidence: null,
        now,
        adminId: 'care-shadow-caller-admin',
        ipAddress: '127.0.0.1',
        userAgent: 'care-499-test',
      },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    );

    expect(evaluateCareEligibilityFromDbMock).toHaveBeenCalledWith(
      tx,
      'ride-499',
      'driver-499',
      null,
      now,
    );

    expect(result).toMatchObject({
      auditWritten: true,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: CARE_UNAVAILABLE_CODE,
    });
    expect(result.decision.status).toBe('SHADOW_EVALUATED');
    expect(result.decision.reasons).toEqual(['CARE_SHADOW_ONLY_NOT_OPERATIONAL']);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const call = (tx.$executeRaw as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sql = Array.isArray(call[0]) ? call[0].join(' ') : String(call[0]);
    const values = call.slice(1);

    expect(sql).toContain('INSERT INTO admin_audit_logs');
    expect(values).toContain('care-shadow-caller-admin');
    expect(values).toContain('CARE_ELIGIBILITY_SHADOW_DECISION');
    expect(values).toContain('care_eligibility_shadow');
    expect(values).toContain('ride-499');

    const serializedPayload = values.find((value: unknown) =>
      typeof value === 'string' && value.includes('care-eligibility-shadow-v1'),
    ) as string;

    expect(JSON.parse(serializedPayload)).toMatchObject({
      rideId: 'ride-499',
      driverId: 'driver-499',
      status: 'SHADOW_EVALUATED',
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: CARE_UNAVAILABLE_CODE,
    });
  });

  it('can record an explicit disabled-shadow decision without reading runtime eligibility', async () => {
    const tx = makeTx();

    const result = await evaluateAndWriteCareEligibilityShadowAuditTx(
      tx,
      {
        rideId: 'ride-disabled-499',
        driverId: 'driver-disabled-499',
        now,
        adminId: 'care-shadow-caller-admin',
        reason: 'explicit disabled shadow trace',
      },
      {},
    );

    expect(evaluateCareEligibilityFromDbMock).not.toHaveBeenCalled();
    expect(result.decision.status).toBe('SHADOW_DISABLED');
    expect(result.decision.reasons).toEqual(['CARE_SHADOW_DISABLED']);
    expect(result.auditWritten).toBe(true);
    expect(result.operationAllowed).toBe(false);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('propagates audit persistence errors and never turns them into operation permission', async () => {
    evaluateCareEligibilityFromDbMock.mockResolvedValue({
      eligible: true,
      reasons: [],
    });

    const tx = {
      $executeRaw: vi.fn().mockRejectedValue(new Error('audit insert failed')),
    } as unknown as CareEligibilityShadowAuditCallerClient;

    await expect(evaluateAndWriteCareEligibilityShadowAuditTx(
      tx,
      {
        rideId: 'ride-fail-499',
        driverId: 'driver-fail-499',
        now,
        adminId: 'care-shadow-caller-admin',
      },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    )).rejects.toThrow('audit insert failed');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects missing audit actor before persisting the trace', async () => {
    const tx = makeTx();

    await expect(evaluateAndWriteCareEligibilityShadowAuditTx(
      tx,
      {
        rideId: 'ride-missing-actor-499',
        driverId: 'driver-missing-actor-499',
        now,
        adminId: ' ',
      },
      {},
    )).rejects.toThrow('CARE_SHADOW_AUDIT_ACTOR_INVALID');

    expect(evaluateCareEligibilityFromDbMock).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('is not wired to rides routes dispatcher acceptance pricing wallet migrations or production', () => {
    const route = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const dispatcher = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const acceptance = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const pricing = readFileSync('src/services/pricing-engine.ts', 'utf8');
    const walletShadow = readFileSync('src/services/wallet-shadow.service.ts', 'utf8');
    const service = readFileSync('src/services/care/care-eligibility-shadow-mode.ts', 'utf8');
    const doc = readFileSync('../docs/care/CARE-499-shadow-audit-caller.md', 'utf8');

    expect(route).not.toContain('evaluateAndWriteCareEligibilityShadowAuditTx');
    expect(dispatcher).not.toContain('evaluateAndWriteCareEligibilityShadowAuditTx');
    expect(acceptance).not.toContain('evaluateAndWriteCareEligibilityShadowAuditTx');
    expect(pricing).not.toContain('evaluateAndWriteCareEligibilityShadowAuditTx');
    expect(walletShadow).not.toContain('evaluateAndWriteCareEligibilityShadowAuditTx');

    expect(service).toContain('evaluateAndWriteCareEligibilityShadowAuditTx');
    expect(service).toContain('evaluateCareEligibilityShadowMode');
    expect(service).toContain('writeCareEligibilityShadowAuditTx');
    expect(service).not.toContain('prisma.$transaction');
    expect(service).not.toContain('dispatchRide');
    expect(service).not.toContain('acceptOffer');
    expect(service).not.toContain('WalletSettlementService');

    expect(doc).toContain('sem rota pública');
    expect(doc).toContain('sem dispatcher');
    expect(doc).toContain('sem aceite');
    expect(doc).toContain('sem pricing');
    expect(doc).toContain('sem wallet');
    expect(doc).toContain('sem migration');
    expect(doc).toContain('sem deploy');
  });
});
