import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CARE_INTERNAL_PILOT_FLAG_KEY,
  getCareInternalPilotDecision,
  isCareInternalPilotPassenger,
  type CareInternalPilotReadClient,
} from '../src/services/care/care-internal-pilot-gate';

function mockDb(result: unknown, reject = false): CareInternalPilotReadClient {
  return {
    feature_flag_allowlist: {
      findUnique: reject
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
    },
  } as unknown as CareInternalPilotReadClient;
}

describe('CARE-487 internal pilot read-only gate', () => {
  it('allows only passenger explicitly present in CARE_INTERNAL_PILOT allowlist', async () => {
    const db = mockDb({ id: 'allow-1' });

    const decision = await getCareInternalPilotDecision(db, ' passenger-1 ');

    expect(decision).toEqual({
      allowed: true,
      key: CARE_INTERNAL_PILOT_FLAG_KEY,
      passengerId: 'passenger-1',
      reason: 'PASSENGER_ALLOWLISTED',
    });
    expect(db.feature_flag_allowlist.findUnique).toHaveBeenCalledWith({
      where: {
        key_passenger_id: {
          key: 'CARE_INTERNAL_PILOT',
          passenger_id: 'passenger-1',
        },
      },
      select: { id: true },
    });
  });

  it('fails closed when passenger is not allowlisted', async () => {
    const db = mockDb(null);

    await expect(isCareInternalPilotPassenger(db, 'passenger-2')).resolves.toBe(false);
    await expect(getCareInternalPilotDecision(db, 'passenger-2')).resolves.toMatchObject({
      allowed: false,
      reason: 'PASSENGER_NOT_ALLOWLISTED',
    });
  });

  it('fails closed when passenger id is missing or invalid', async () => {
    const db = mockDb({ id: 'should-not-read' });

    await expect(getCareInternalPilotDecision(db, '')).resolves.toEqual({
      allowed: false,
      key: CARE_INTERNAL_PILOT_FLAG_KEY,
      passengerId: null,
      reason: 'PASSENGER_ID_MISSING',
    });
    expect(db.feature_flag_allowlist.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when allowlist table/read is unavailable', async () => {
    const db = mockDb(new Error('db unavailable'), true);

    await expect(getCareInternalPilotDecision(db, 'passenger-3')).resolves.toEqual({
      allowed: false,
      key: CARE_INTERNAL_PILOT_FLAG_KEY,
      passengerId: 'passenger-3',
      reason: 'ALLOWLIST_UNAVAILABLE',
    });
  });

  it('does not wire the internal pilot gate into runtime ride creation yet', () => {
    const rides = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const readiness = readFileSync('src/services/care/care-readiness-policy.ts', 'utf8');

    expect(rides).not.toContain('getCareInternalPilotDecision');
    expect(rides).not.toContain('isCareInternalPilotPassenger');
    expect(readiness).not.toContain('CARE_INTERNAL_PILOT');
    expect(readiness).toContain('CARE_OFFICIAL_BLOCKED_PENDING_INTEGRATION');
  });

  it('keeps official CARE flags fail closed', () => {
    const flags = readFileSync('src/services/care/care-feature-flags.ts', 'utf8');

    expect(flags).toContain('CARE_PUBLIC_REQUEST_ENABLED: false');
    expect(flags).toContain('CARE_OFFICIAL_ENABLED: false');
    expect(flags).toContain('CARE_DISPATCH_ENABLED: false');
    expect(flags).toContain('CARE_DRIVER_ACCEPTANCE_ENABLED: false');
  });
});
