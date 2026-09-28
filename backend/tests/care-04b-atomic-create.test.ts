import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CareRideMode } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  createRide: vi.fn(),
  transaction: vi.fn(),
  txCreateRide: vi.fn(),
  txCreateRequirements: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    rides_v2: { create: mocks.createRide },
    $transaction: mocks.transaction,
  },
}));

import {
  CareDraftValidationError,
  createRideWithRequirements,
  validateCareDraftRequirements,
} from '../src/services/care/care-ride-create';

const baseDraft = () => ({
  mode: CareRideMode.ASSISTED,
  foldingWheelchair: false,
  remainInWheelchair: false,
  canSelfTransfer: null,
  needsExtraBoardingTime: true,
  guideDog: true,
  companionSeats: 1,
});

const args = () => ({
  data: {
    passenger_id: 'synthetic-passenger',
    ride_type: 'care',
    service_category: 'CARE_ASSISTED',
    status: 'requested',
    origin_lat: '-22.90',
    origin_lng: '-43.20',
    dest_lat: '-22.91',
    dest_lng: '-43.21',
  },
});

describe('CARE-04B common atomic creation boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createRide.mockResolvedValue({ id: 'normal-ride' });
    mocks.txCreateRide.mockResolvedValue({ id: 'care-ride-1' });
    mocks.txCreateRequirements.mockResolvedValue({ id: 'requirement-1' });
    mocks.transaction.mockImplementation(async (callback: any) =>
      callback({
        rides_v2: { create: mocks.txCreateRide },
        care_trip_requirements: { create: mocks.txCreateRequirements },
      }));
  });

  it('leaves normal ride creation delegated verbatim to existing Prisma, without transaction', async () => {
    const input: any = { data: { ...args().data, service_category: 'CAR_NORMAL', ride_type: 'normal' } };
    const ride = await createRideWithRequirements(input);
    expect(ride).toEqual({ id: 'normal-ride' });
    expect(mocks.createRide).toHaveBeenCalledTimes(1);
    expect(mocks.createRide).toHaveBeenCalledWith(input);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('writes both records in one transaction, always DRAFT without approval fields', async () => {
    const input: any = args();
    const ride = await createRideWithRequirements(input, baseDraft());
    expect(ride).toEqual({ id: 'care-ride-1' });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txCreateRide).toHaveBeenCalledTimes(1);
    expect(mocks.txCreateRide).toHaveBeenCalledWith(input);
    expect(mocks.txCreateRequirements).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ride_id: 'care-ride-1',
        mode: 'ASSISTED',
        status: 'DRAFT',
        guide_dog: true,
        companion_seats: 1,
      }),
    });
    // These are intentionally omitted, not sent as undefined.
    const data = mocks.txCreateRequirements.mock.calls[0][0].data;
    expect(Object.keys(data)).not.toContain('reviewed_at');
    expect(Object.keys(data)).not.toContain('reviewed_by_admin_id');
    expect(Object.keys(data)).not.toContain('medical_notes');
    expect(mocks.createRide).not.toHaveBeenCalled();
  });

  it('propagates requirement failure without returning a successful ride', async () => {
    mocks.txCreateRequirements.mockRejectedValue(new Error('synthetic child write failure'));
    await expect(createRideWithRequirements(args() as any, baseDraft()))
      .rejects.toThrow('synthetic child write failure');
    expect(mocks.txCreateRide).toHaveBeenCalledTimes(1);
    expect(mocks.txCreateRequirements).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatch, preassignment and invalid state before opening a transaction', async () => {
    for (const changes of [
      { service_category: 'CAR_NORMAL' },
      { driver_id: 'synthetic-preassigned-driver' },
      { status: 'accepted' },
      { ride_type: 'normal' },
    ]) {
      const input: any = args();
      Object.assign(input.data, changes);
      await expect(createRideWithRequirements(input, baseDraft()))
        .rejects.toBeInstanceOf(CareDraftValidationError);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('requires explicit self-transfer for folding and wheelchair occupancy for adapted', () => {
    expect(() => validateCareDraftRequirements({
      ...baseDraft(),
      mode: CareRideMode.FOLDING_WHEELCHAIR,
      foldingWheelchair: true,
    })).toThrow('CARE_SELF_TRANSFER_REQUIRED');
    expect(() => validateCareDraftRequirements({
      ...baseDraft(),
      mode: CareRideMode.ADAPTED_WHEELCHAIR,
      remainInWheelchair: false,
    })).toThrow('CARE_ADAPTED_VEHICLE_REQUIRED');
    expect(validateCareDraftRequirements({
      ...baseDraft(),
      mode: CareRideMode.FOLDING_WHEELCHAIR,
      foldingWheelchair: true,
      canSelfTransfer: true,
    }).canSelfTransfer).toBe(true);
  });

  it('rejects invalid counts and prevents client-supplied review/medical fields from being forwarded', () => {
    for (const companionSeats of [-1, 1.5, 17, NaN]) {
      expect(() => validateCareDraftRequirements({ ...baseDraft(), companionSeats }))
        .toThrow('CARE_COMPANION_SEATS_INVALID');
    }
    const untrusted: any = {
      ...baseDraft(),
      reviewed_at: '2099-01-01',
      reviewed_by_admin_id: 'fake-admin',
      medical_notes: 'Sensitive',
      status: 'READY',
    };
    const clean = validateCareDraftRequirements(untrusted);
    expect(clean).not.toHaveProperty('reviewed_at');
    expect(clean).not.toHaveProperty('reviewed_by_admin_id');
    expect(clean).not.toHaveProperty('medical_notes');
    expect(clean).not.toHaveProperty('status');
  });

  it('has one centralized creation call in the existing rides-v2 route', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/routes/rides-v2.ts', 'utf8');
    expect(source).toContain('const ride = await createRideWithRequirements({');
    expect(source).not.toContain('const ride = await prisma.rides_v2.create({');
    expect(source.indexOf('if (isUnsupportedCareIntent(req.body))')).toBeLessThan(
      source.indexOf('const ride = await createRideWithRequirements({'),
    );
  });
});
