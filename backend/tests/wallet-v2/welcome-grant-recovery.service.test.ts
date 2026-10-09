import {
  afterEach, beforeEach, describe, expect, it, vi
} from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  grantOnce: vi.fn()
}));

vi.mock('../../src/db', () => ({
  pool: { query: mocks.query }
}));

vi.mock(
  '../../src/services/wallet-v2/driver-welcome-promo.service',
  () => ({
    DriverWelcomePromoService: class {
      grantOnce = mocks.grantOnce;
    }
  })
);

import { recoverPendingWelcomeGrants }
  from '../../src/services/wallet-v2/welcome-grant-recovery.service';

describe('KAVIAR — recuperação de boas-vindas', () => {
  const previousFlag =
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED;

  const previousDate =
    process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM;

  let eligibleFrom: string;

  beforeEach(() => {
    vi.clearAllMocks();

    eligibleFrom = new Date(
      Date.now() - 86400000
    ).toISOString();

    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'true';

    process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM =
      eligibleFrom;

    mocks.query.mockResolvedValue({ rows: [] });

    mocks.grantOnce.mockResolvedValue({
      granted: true,
      balanceCents: 2000n
    });
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
    } else {
      process.env.DRIVER_PERMANENT_WELCOME_ENABLED =
        previousFlag;
    }

    if (previousDate === undefined) {
      delete process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM;
    } else {
      process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM =
        previousDate;
    }

    vi.restoreAllMocks();
  });

  it('não acessa banco com campanha desligada', async () => {
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'false';

    expect(await recoverPendingWelcomeGrants(20)).toEqual({
      scanned: 0,
      granted: 0,
      errors: 0
    });

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('não processa data de elegibilidade inválida', async () => {
    process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM =
      'DATA_INVALIDA';

    expect(await recoverPendingWelcomeGrants(20)).toEqual({
      scanned: 0,
      granted: 0,
      errors: 0
    });

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('recupera concessões pendentes sem duplicar benefício', async () => {
    mocks.query.mockResolvedValue({
      rows: [
        { id: 'driver-a' },
        { id: 'driver-b' }
      ]
    });

    mocks.grantOnce
      .mockResolvedValueOnce({
        granted: true,
        balanceCents: 2000n
      })
      .mockResolvedValueOnce({
        granted: false,
        balanceCents: 2000n
      });

    const result = await recoverPendingWelcomeGrants(2);

    expect(result).toEqual({
      scanned: 2,
      granted: 1,
      errors: 0
    });

    expect(mocks.grantOnce).toHaveBeenCalledTimes(2);
    expect(mocks.grantOnce).toHaveBeenCalledWith('driver-a');
    expect(mocks.grantOnce).toHaveBeenCalledWith('driver-b');

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("v.status = 'APPROVED'"),
      [eligibleFrom, 2]
    );

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('NOT EXISTS'),
      [eligibleFrom, 2]
    );
  });

  it('continua processando após falha individual', async () => {
    const log = vi.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mocks.query.mockResolvedValue({
      rows: [
        { id: 'driver-a' },
        { id: 'driver-b' }
      ]
    });

    mocks.grantOnce
      .mockRejectedValueOnce(new Error('TEMPORARY_DB_ERROR'))
      .mockResolvedValueOnce({
        granted: true,
        balanceCents: 2000n
      });

    expect(await recoverPendingWelcomeGrants(20)).toEqual({
      scanned: 2,
      granted: 1,
      errors: 1
    });

    expect(mocks.grantOnce).toHaveBeenCalledTimes(2);

    expect(log).toHaveBeenCalledWith(
      '[WELCOME_RECOVERY_GRANT_ERROR]',
      'driver-a',
      'TEMPORARY_DB_ERROR'
    );
  });

  it('limita a recuperação a 200 candidatos por lote', async () => {
    await recoverPendingWelcomeGrants(999);

    expect(mocks.query).toHaveBeenCalledWith(
      expect.any(String),
      [eligibleFrom, 200]
    );
  });
});
