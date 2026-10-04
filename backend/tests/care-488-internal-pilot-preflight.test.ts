import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CARE_UNAVAILABLE_CODE,
} from '../src/services/care/care-readiness-policy';
import {
  getCareInternalPilotPreflightDecision,
} from '../src/services/care/care-internal-pilot-preflight';
import type {
  CareInternalPilotReadClient,
} from '../src/services/care/care-internal-pilot-gate';

const allOfficialFlagsEnabled = {
  CARE_ADMIN_ENABLED: 'true',
  CARE_PUBLIC_REQUEST_ENABLED: 'true',
  CARE_OFFICIAL_ENABLED: 'true',
  CARE_DISPATCH_ENABLED: 'true',
  CARE_DRIVER_ACCEPTANCE_ENABLED: 'true',
  CARE_AUDIT_STRICT_ENABLED: 'true',
};

function mockDb(result: unknown, reject = false): CareInternalPilotReadClient {
  return {
    feature_flag_allowlist: {
      findUnique: reject
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
    },
  } as unknown as CareInternalPilotReadClient;
}

describe('CARE-488 internal pilot composed preflight', () => {
  it('does not query allowlist and does not block when there is no CARE intent', async () => {
    const db = mockDb({ id: 'should-not-read' });

    const decision = await getCareInternalPilotPreflightDecision(
      db,
      { service_category: 'CAR_NORMAL' },
      'passenger-1',
    );

    expect(decision).toMatchObject({
      isCareIntent: false,
      internalPilotAllowed: false,
      canProceed: false,
      unsupported: false,
      code: null,
      reason: 'NO_CARE_INTENT',
      pilot: null,
    });
    expect(db.feature_flag_allowlist.findUnique).not.toHaveBeenCalled();
  });

  it('blocks CARE when passenger id is missing before any official release path', async () => {
    const db = mockDb({ id: 'should-not-read' });

    const decision = await getCareInternalPilotPreflightDecision(
      db,
      { service_category: 'CARE_ASSISTED' },
      '',
    );

    expect(decision).toMatchObject({
      isCareIntent: true,
      internalPilotAllowed: false,
      canProceed: false,
      unsupported: true,
      code: CARE_UNAVAILABLE_CODE,
      reason: 'PASSENGER_ID_MISSING',
      pilot: {
        allowed: false,
        passengerId: null,
        reason: 'PASSENGER_ID_MISSING',
      },
    });
    expect(db.feature_flag_allowlist.findUnique).not.toHaveBeenCalled();
  });

  it('blocks CARE when passenger is not in CARE_INTERNAL_PILOT allowlist', async () => {
    const db = mockDb(null);

    const decision = await getCareInternalPilotPreflightDecision(
      db,
      { service_category: 'CARE_ASSISTED' },
      'passenger-2',
    );

    expect(decision).toMatchObject({
      isCareIntent: true,
      internalPilotAllowed: false,
      canProceed: false,
      unsupported: true,
      code: CARE_UNAVAILABLE_CODE,
      reason: 'PASSENGER_NOT_ALLOWLISTED',
      pilot: {
        allowed: false,
        passengerId: 'passenger-2',
        reason: 'PASSENGER_NOT_ALLOWLISTED',
      },
    });
  });

  it('blocks allowlisted CARE while official flags remain closed', async () => {
    const db = mockDb({ id: 'allow-1' });

    const decision = await getCareInternalPilotPreflightDecision(
      db,
      { service_category: 'CARE_ASSISTED' },
      'passenger-3',
    );

    expect(decision).toMatchObject({
      isCareIntent: true,
      internalPilotAllowed: true,
      officialFlagsReady: false,
      canProceed: false,
      unsupported: true,
      code: CARE_UNAVAILABLE_CODE,
      reason: 'PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLAGS_NOT_READY',
      pilot: {
        allowed: true,
        passengerId: 'passenger-3',
        reason: 'PASSENGER_ALLOWLISTED',
      },
    });
  });

  it('still blocks allowlisted CARE even when official flags are all true', async () => {
    const db = mockDb({ id: 'allow-2' });

    const decision = await getCareInternalPilotPreflightDecision(
      db,
      { service_category: 'CARE_ASSISTED' },
      'passenger-4',
      allOfficialFlagsEnabled,
    );

    expect(decision).toMatchObject({
      isCareIntent: true,
      internalPilotAllowed: true,
      officialFlagsReady: true,
      canProceed: false,
      unsupported: true,
      code: CARE_UNAVAILABLE_CODE,
      reason: 'PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLOW_NOT_IMPLEMENTED',
      readiness: {
        isCareIntent: true,
        unsupported: true,
        reason: 'CARE_OFFICIAL_BLOCKED_PENDING_INTEGRATION',
      },
    });
  });

  it('fails closed when allowlist lookup is unavailable', async () => {
    const db = mockDb(new Error('db unavailable'), true);

    const decision = await getCareInternalPilotPreflightDecision(
      db,
      { service_category: 'CARE_ASSISTED' },
      'passenger-5',
      allOfficialFlagsEnabled,
    );

    expect(decision).toMatchObject({
      isCareIntent: true,
      internalPilotAllowed: false,
      officialFlagsReady: true,
      canProceed: false,
      unsupported: true,
      code: CARE_UNAVAILABLE_CODE,
      reason: 'ALLOWLIST_UNAVAILABLE',
    });
  });

  it('does not wire the preflight into runtime routes or readiness policy yet', () => {
    const rides = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const readiness = readFileSync('src/services/care/care-readiness-policy.ts', 'utf8');

    expect(rides).not.toContain('getCareInternalPilotPreflightDecision');
    expect(rides).not.toContain('care-internal-pilot-preflight');
    expect(readiness).not.toContain('getCareInternalPilotPreflightDecision');
    expect(readiness).not.toContain('CARE_INTERNAL_PILOT');
    expect(readiness).toContain('CARE_OFFICIAL_BLOCKED_PENDING_INTEGRATION');
  });
});
