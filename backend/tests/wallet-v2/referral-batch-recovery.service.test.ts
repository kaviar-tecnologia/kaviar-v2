import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, recoverMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  recoverMock: vi.fn(),
}));

vi.mock('../../src/db', () => ({
  pool: { query: queryMock },
}));

vi.mock('../../src/services/wallet-v2/referral-recovery.service', () => ({
  recoverReferralQualification: recoverMock,
}));

import { recoverPendingReferrals } from
  '../../src/services/wallet-v2/referral-batch-recovery.service';

describe('Recuperação em lotes de indicações', () => {
  const oldEnabled = process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED;
  const oldStart = process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = 'true';
    process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT =
      '2026-09-01T00:00:00.000Z';

    queryMock.mockResolvedValue({ rows: [] });
    recoverMock.mockResolvedValue(true);
  });

  afterEach(() => {
    if (oldEnabled === undefined) {
      delete process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED;
    } else {
      process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = oldEnabled;
    }

    if (oldStart === undefined) {
      delete process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT;
    } else {
      process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT = oldStart;
    }
  });

  it('campanha desligada não consulta banco', async () => {
    process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = 'false';

    expect(await recoverPendingReferrals()).toEqual({
      scanned: 0,
      qualified: 0,
      errors: 0,
    });

    expect(queryMock).not.toHaveBeenCalled();
  });

  it('data inválida bloqueia processamento', async () => {
    process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT = 'invalida';

    const result = await recoverPendingReferrals();

    expect(result.scanned).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('recupera indicações elegíveis', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { recharge_id: 'recarga-1' },
        { recharge_id: 'recarga-2' },
      ],
    });

    const result = await recoverPendingReferrals();

    expect(result).toEqual({
      scanned: 2,
      qualified: 2,
      errors: 0,
    });

    expect(recoverMock).toHaveBeenCalledTimes(2);
  });

  it('falha individual não interrompe lote', async () => {
    const errorSpy = vi.spyOn(console, 'error')
      .mockImplementation(() => {});

    queryMock.mockResolvedValueOnce({
      rows: [
        { recharge_id: 'recarga-1' },
        { recharge_id: 'recarga-2' },
      ],
    });

    recoverMock
      .mockRejectedValueOnce(new Error('FALHA_SIMULADA'))
      .mockResolvedValueOnce(true);

    const result = await recoverPendingReferrals();

    expect(result).toEqual({
      scanned: 2,
      qualified: 1,
      errors: 1,
    });

    errorSpy.mockRestore();
  });

  it('limita lote ao máximo de 100 registros', async () => {
    await recoverPendingReferrals(500);

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      [expect.any(Date), 100]
    );
  });
});
