import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const evaluateCareEligibilityFromDbMock = vi.hoisted(() => vi.fn());

vi.mock('../src/services/care/care-runtime-eligibility', () => ({
  evaluateCareEligibilityFromDb: evaluateCareEligibilityFromDbMock,
}));

import {
  CARE_ELIGIBILITY_SHADOW_FLAG_KEY,
  evaluateCareEligibilityShadowMode,
  isCareEligibilityShadowEnabled,
} from '../src/services/care/care-eligibility-shadow-mode';
import { CARE_UNAVAILABLE_CODE } from '../src/services/care/care-readiness-policy';
import type { CareReadClient } from '../src/services/care/care-runtime-eligibility';

const db = {} as CareReadClient;
const now = new Date('2026-10-05T12:00:00.000Z');

describe('CARE-497 eligibility shadow mode', () => {
  beforeEach(() => {
    evaluateCareEligibilityFromDbMock.mockReset();
  });

  it('is disabled by default and does not read CARE runtime eligibility', async () => {
    expect(isCareEligibilityShadowEnabled({})).toBe(false);

    const decision = await evaluateCareEligibilityShadowMode(
      db,
      { rideId: 'ride-1', driverId: 'driver-1', now },
      {},
    );

    expect(evaluateCareEligibilityFromDbMock).not.toHaveBeenCalled();
    expect(decision).toMatchObject({
      shadowOnly: true,
      status: 'SHADOW_DISABLED',
      shadowEnabled: false,
      eligibility: null,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: CARE_UNAVAILABLE_CODE,
      reasons: ['CARE_SHADOW_DISABLED'],
    });
  });

  it('requires explicit internal flag and rejects invalid input without DB reads', async () => {
    expect(isCareEligibilityShadowEnabled({ [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' })).toBe(true);

    const decision = await evaluateCareEligibilityShadowMode(
      db,
      { rideId: ' ', driverId: 'driver-1', now },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    );

    expect(evaluateCareEligibilityFromDbMock).not.toHaveBeenCalled();
    expect(decision.status).toBe('SHADOW_INPUT_INVALID');
    expect(decision.reasons).toEqual(['CARE_SHADOW_INPUT_INVALID']);
    expect(decision.operationAllowed).toBe(false);
    expect(decision.dispatchAllowed).toBe(false);
    expect(decision.acceptanceAllowed).toBe(false);
    expect(decision.walletAllowed).toBe(false);
  });

  it('evaluates eligibility in shadow while keeping all operation permissions false', async () => {
    evaluateCareEligibilityFromDbMock.mockResolvedValue({
      eligible: true,
      reasons: [],
    });

    const decision = await evaluateCareEligibilityShadowMode(
      db,
      { rideId: ' ride-2 ', driverId: ' driver-2 ', externalEvidence: null, now },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    );

    expect(evaluateCareEligibilityFromDbMock).toHaveBeenCalledWith(
      db,
      'ride-2',
      'driver-2',
      null,
      now,
    );

    expect(decision.status).toBe('SHADOW_EVALUATED');
    expect(decision.eligibility).toEqual({ eligible: true, reasons: [] });
    expect(decision.reasons).toEqual(['CARE_SHADOW_ONLY_NOT_OPERATIONAL']);
    expect(decision.operationAllowed).toBe(false);
    expect(decision.dispatchAllowed).toBe(false);
    expect(decision.acceptanceAllowed).toBe(false);
    expect(decision.walletAllowed).toBe(false);
    expect(decision.publicCode).toBe(CARE_UNAVAILABLE_CODE);
    expect(decision.auditEvent).toMatchObject({
      kind: 'CARE_ELIGIBILITY_SHADOW_DECISION',
      rideId: 'ride-2',
      driverId: 'driver-2',
      shadowEnabled: true,
      eligibilityEligible: true,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: CARE_UNAVAILABLE_CODE,
      reasons: ['CARE_SHADOW_ONLY_NOT_OPERATIONAL'],
    });
  });

  it('keeps ineligible runtime reasons as observation only', async () => {
    evaluateCareEligibilityFromDbMock.mockResolvedValue({
      eligible: false,
      reasons: ['CARE_PRICE_UNCONFIRMED', 'INSURANCE_NOT_CONFIRMED'],
    });

    const decision = await evaluateCareEligibilityShadowMode(
      db,
      { rideId: 'ride-3', driverId: 'driver-3', now },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    );

    expect(decision.status).toBe('SHADOW_EVALUATED');
    expect(decision.eligibility?.eligible).toBe(false);
    expect(decision.reasons).toEqual([
      'CARE_SHADOW_ONLY_NOT_OPERATIONAL',
      'CARE_PRICE_UNCONFIRMED',
      'INSURANCE_NOT_CONFIRMED',
    ]);
    expect(decision.operationAllowed).toBe(false);
    expect(decision.publicCode).toBe(CARE_UNAVAILABLE_CODE);
  });

  it('fails closed if the shadow evaluator throws', async () => {
    evaluateCareEligibilityFromDbMock.mockRejectedValue(new Error('unexpected runtime failure'));

    const decision = await evaluateCareEligibilityShadowMode(
      db,
      { rideId: 'ride-4', driverId: 'driver-4', now },
      { [CARE_ELIGIBILITY_SHADOW_FLAG_KEY]: 'true' },
    );

    expect(decision.status).toBe('SHADOW_EVALUATION_FAILED');
    expect(decision.eligibility).toBeNull();
    expect(decision.reasons).toEqual(['CARE_SHADOW_EVALUATION_EXCEPTION']);
    expect(decision.operationAllowed).toBe(false);
    expect(decision.dispatchAllowed).toBe(false);
    expect(decision.acceptanceAllowed).toBe(false);
    expect(decision.walletAllowed).toBe(false);
  });

  it('is not wired to public routes dispatcher acceptance pricing or wallet', () => {
    const route = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const dispatcher = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const acceptance = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const pricing = readFileSync('src/services/pricing-engine.ts', 'utf8');
    const walletShadow = readFileSync('src/services/wallet-shadow.service.ts', 'utf8');
    const shadowService = readFileSync('src/services/care/care-eligibility-shadow-mode.ts', 'utf8');
    const doc = readFileSync('../docs/care/CARE-497-eligibility-shadow-mode.md', 'utf8');

    expect(route).not.toContain('evaluateCareEligibilityShadowMode');
    expect(dispatcher).not.toContain('evaluateCareEligibilityShadowMode');
    expect(acceptance).not.toContain('evaluateCareEligibilityShadowMode');
    expect(pricing).not.toContain('evaluateCareEligibilityShadowMode');
    expect(walletShadow).not.toContain('evaluateCareEligibilityShadowMode');

    expect(shadowService).toContain('operationAllowed: false');
    expect(shadowService).toContain('dispatchAllowed: false');
    expect(shadowService).toContain('acceptanceAllowed: false');
    expect(shadowService).toContain('walletAllowed: false');
    expect(shadowService).toContain('CARE_UNAVAILABLE_CODE');

    expect(doc).toContain('não cria corrida CARE real');
    expect(doc).toContain('não envia oferta para motorista');
    expect(doc).toContain('não permite aceite CARE real');
    expect(doc).toContain('não altera wallet');
    expect(doc).toContain('não faz deploy');
  });
});
