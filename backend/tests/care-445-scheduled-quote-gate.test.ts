import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(),
  dispatchRide: vi.fn(), reminder: vi.fn(), searching: vi.fn(),
  withLock: vi.fn(), tick: null as null | (() => Promise<void>),
}));
vi.mock('../src/lib/prisma', () => ({
  prisma: { rides_v2: {
    findMany: mocks.findMany, updateMany: mocks.updateMany, update: mocks.update,
  } },
}));
vi.mock('../src/services/dispatcher.service', () => ({
  dispatcherService: { dispatchRide: mocks.dispatchRide },
}));
vi.mock('../src/modules/whatsapp', () => ({
  whatsappEvents: {
    rideScheduledReminder: mocks.reminder, rideScheduledSearching: mocks.searching,
  },
}));
vi.mock('../src/lib/scheduler-lock', () => ({
  withSchedulerLock: mocks.withLock,
}));

import { startScheduledDispatchJob } from '../src/jobs/scheduled-dispatch.job';

const ride = (settlement: any) => ({
  id: 'scheduled-445', status: 'scheduled',
  scheduled_for: new Date(Date.now() + 5 * 60_000),
  trip_details: {},
  passenger: { name: 'Synthetic', phone: 'synthetic-ci' },
  pricing_profile_id: 'profile-1', quoted_price: '23.00', locked_price: '23.00',
  platform_fee: '4.14', driver_earnings: '18.86', settlement,
});
const settlement = () => ({
  ride_id: 'scheduled-445', pricing_profile_id: 'profile-1',
  quoted_price: '23.00', locked_price: '23.00',
  fee_amount: '4.14', driver_earnings: '18.86',
  quoted_at: new Date('2026-09-29T12:00:00Z'),
  locked_at: new Date('2026-09-29T12:00:00Z'),
});

describe('CARE-445 scheduled ride pricing boundary', () => {
  let interval: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.dispatchRide.mockResolvedValue(undefined);
    mocks.searching.mockResolvedValue(undefined);
    mocks.reminder.mockResolvedValue(undefined);
    mocks.withLock.mockImplementation(async (_key: string, fn: () => Promise<void>) => fn());
    interval = vi.spyOn(global, 'setInterval').mockImplementation(((fn: () => Promise<void>) => {
      mocks.tick = fn;
      return 1 as any;
    }) as any);
    startScheduledDispatchJob();
  });
  afterEach(() => {
    interval.mockRestore();
    mocks.tick = null;
  });

  it('never transitions or advertises searching for an unpriced scheduled ride', async () => {
    mocks.findMany.mockResolvedValueOnce([ride(null)]);
    await mocks.tick!();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'scheduled-445', status: 'scheduled' },
      data: { status: 'no_driver' },
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.searching).not.toHaveBeenCalled();
    expect(mocks.dispatchRide).not.toHaveBeenCalled();
  });

  it('does not dispatch if the status transition lost a race', async () => {
    mocks.findMany.mockResolvedValueOnce([ride(settlement())]);
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    await mocks.tick!();
    expect(mocks.searching).not.toHaveBeenCalled();
    expect(mocks.dispatchRide).not.toHaveBeenCalled();
  });

  it('still dispatches a valid, officially quoted scheduled ride once', async () => {
    mocks.findMany.mockResolvedValueOnce([ride(settlement())]);
    await mocks.tick!();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'scheduled-445', status: 'scheduled' },
      data: { status: 'requested' },
    });
    expect(mocks.dispatchRide).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchRide).toHaveBeenCalledWith('scheduled-445');
  });
});
