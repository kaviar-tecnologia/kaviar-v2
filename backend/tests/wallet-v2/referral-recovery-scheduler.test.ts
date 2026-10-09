import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { connectMock, queryMock, releaseMock, sumupMock, referralMock } =
  vi.hoisted(() => ({
    connectMock: vi.fn(),
    queryMock: vi.fn(),
    releaseMock: vi.fn(),
    sumupMock: vi.fn(),
    referralMock: vi.fn(),
  }));

vi.mock('../../src/db', () => ({
  pool: { connect: connectMock },
}));

vi.mock('../../src/services/wallet-v2/sumup-recharge.service', () => ({
  reconcilePendingSumUpRecharges: sumupMock,
}));

vi.mock('../../src/services/wallet-v2/referral-batch-recovery.service', () => ({
  recoverPendingReferrals: referralMock,
}));

import { startSumUpRechargeReconcileScheduler } from
  '../../src/services/wallet-v2/sumup-recharge-reconcile-scheduler';

describe('Agendador SumUp com recuperação de indicações', () => {
  const oldFlag = process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = 'false';

    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return { rows: [{ locked: true }] };
      }
      return { rows: [] };
    });

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock,
    });

    sumupMock.mockResolvedValue({
      scanned: 0,
      confirmed: 0,
      expired: 0,
      pending: 0,
      errors: 0,
    });

    referralMock.mockResolvedValue({
      scanned: 0,
      qualified: 0,
      errors: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();

    if (oldFlag === undefined) {
      delete process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED;
    } else {
      process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = oldFlag;
    }
  });

  it('campanha desligada não executa recuperação', async () => {
    startSumUpRechargeReconcileScheduler();

    await vi.advanceTimersByTimeAsync(300000);

    expect(sumupMock).toHaveBeenCalledTimes(1);
    expect(referralMock).not.toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('campanha ligada executa recuperação após SumUp', async () => {
    process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = 'true';

    startSumUpRechargeReconcileScheduler();

    await vi.advanceTimersByTimeAsync(300000);

    expect(sumupMock).toHaveBeenCalledTimes(1);
    expect(referralMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['kaviar:sumup_recharge_reconcile_scheduler']
    );
  });

  it('falha na recuperação preserva o ciclo SumUp', async () => {
    process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = 'true';

    const errorSpy = vi.spyOn(console, 'error')
      .mockImplementation(() => {});

    referralMock.mockRejectedValueOnce(new Error('REFERRAL_TEST_ERROR'));

    startSumUpRechargeReconcileScheduler();

    await vi.advanceTimersByTimeAsync(300000);

    expect(sumupMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[REFERRAL_RECOVERY_SCHEDULER_ERROR]',
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('falha na reconciliação SumUp não impede recuperação', async () => {
    process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = 'true';

    const errorSpy = vi.spyOn(console, 'error')
      .mockImplementation(() => {});

    sumupMock.mockRejectedValueOnce(
      new Error('SUMUP_FAILURE_TEST')
    );

    startSumUpRechargeReconcileScheduler();

    await vi.advanceTimersByTimeAsync(300000);

    expect(sumupMock).toHaveBeenCalledTimes(1);
    expect(referralMock).toHaveBeenCalledTimes(1);

    expect(queryMock).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['kaviar:sumup_recharge_reconcile_scheduler']
    );

    expect(releaseMock).toHaveBeenCalledTimes(1);

    expect(errorSpy).toHaveBeenCalledWith(
      '[SUMUP_RECONCILE_CYCLE_ERROR]',
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('sem advisory lock não executa processamento', async () => {
    queryMock.mockResolvedValue({ rows: [{ locked: false }] });

    startSumUpRechargeReconcileScheduler();

    await vi.advanceTimersByTimeAsync(300000);

    expect(sumupMock).not.toHaveBeenCalled();
    expect(referralMock).not.toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
