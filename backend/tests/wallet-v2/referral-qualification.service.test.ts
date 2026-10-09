import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qualifyReferralForRecharge } from
  '../../src/services/wallet-v2/referral-qualification.service';

function setup(options: {
  amount?: string;
  status?: string;
  provider?: string;
  driverStatus?: string;
  suspended?: boolean;
  updatedRows?: number;
  rechargeCreatedAt?: string;
  rechargeConfirmedAt?: string | null;
  driverCreatedAt?: string;
} = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM wallet_recharges')) {
      return {
        rows: [{
          id: 'recharge-1',
          driver_id: 'driver-1',
          amount_cents: options.amount ?? '2000',
          status: options.status ?? 'confirmed',
          payment_provider: options.provider ?? 'sumup',
          created_at: options.rechargeCreatedAt ?? '2026-09-03T10:00:00.000Z',
          confirmed_at: options.rechargeConfirmedAt === undefined
            ? '2026-09-03T10:05:00.000Z'
            : options.rechargeConfirmedAt,
        }],
      };
    }

    if (sql.includes('FROM drivers')) {
      return {
        rows: [{
          id: 'driver-1',
          phone: '11999999999',
          status: options.driverStatus ?? 'approved',
          suspended_at: options.suspended ? new Date() : null,
          banned_at: null,
          deleted_at: null,
          created_at: options.driverCreatedAt ?? '2026-09-02T10:00:00.000Z',
        }],
      };
    }

    if (sql.includes('UPDATE referrals')) {
      return {
        rows: options.updatedRows === 0 ? [] : [{ id: 'referral-1' }],
      };
    }

    throw new Error(`SQL inesperado: ${sql}`);
  });

  return { query } as any;
}

describe('Qualificação de indicações KAVIAR', () => {
  const previousFlag = process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED;
  const previousStart = process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT;

  beforeEach(() => {
    process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = 'true';
    process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT =
      '2026-09-01T00:00:00.000Z';
  });

  afterEach(() => {
    if (previousStart === undefined) {
      delete process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT;
    } else {
      process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT = previousStart;
    }

    if (previousFlag === undefined) {
      delete process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED;
    } else {
      process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = previousFlag;
    }
  });

  it('campanha desativada bloqueia qualificação sem consultar banco', async () => {
    process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED = 'false';

    const client = setup();

    expect(
      await qualifyReferralForRecharge(client, 'recharge-1')
    ).toBe(false);

    expect(client.query).not.toHaveBeenCalled();
  });

  it('campanha sem configuração permanece bloqueada', async () => {
    delete process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED;

    const client = setup();

    expect(
      await qualifyReferralForRecharge(client, 'recharge-1')
    ).toBe(false);

    expect(client.query).not.toHaveBeenCalled();
  });

  it('sem data inicial não qualifica', async () => {
    delete process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT;
    const client = setup();

    expect(await qualifyReferralForRecharge(client, 'recharge-1'))
      .toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('data inicial inválida não qualifica', async () => {
    process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT = 'invalida';
    const client = setup();

    expect(await qualifyReferralForRecharge(client, 'recharge-1'))
      .toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('motorista anterior ao início não qualifica', async () => {
    const client = setup({
      driverCreatedAt: '2026-08-31T10:00:00.000Z',
    });

    expect(await qualifyReferralForRecharge(client, 'recharge-1'))
      .toBe(false);
  });

  it('recarga anterior ao início não qualifica', async () => {
    const client = setup({
      rechargeCreatedAt: '2026-08-31T10:00:00.000Z',
    });

    expect(await qualifyReferralForRecharge(client, 'recharge-1'))
      .toBe(false);
  });

  it('recarga sem confirmação temporal não qualifica', async () => {
    const client = setup({ rechargeConfirmedAt: null });

    expect(await qualifyReferralForRecharge(client, 'recharge-1'))
      .toBe(false);
  });

  it('data futura bloqueia qualificação', async () => {
    process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT =
      '2099-01-01T00:00:00.000Z';

    const client = setup();

    expect(await qualifyReferralForRecharge(client, 'recharge-1'))
      .toBe(false);

    expect(client.query).not.toHaveBeenCalled();
  });

  it('data sem fuso UTC é rejeitada', async () => {
    process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT =
      '2026-09-01T00:00:00';

    const client = setup();

    expect(await qualifyReferralForRecharge(client, 'recharge-1'))
      .toBe(false);

    expect(client.query).not.toHaveBeenCalled();
  });

  it('qualifica recarga SumUp confirmada de R$ 20', async () => {
    const client = setup();
    expect(await qualifyReferralForRecharge(client, 'recharge-1')).toBe(true);
  });

  it('não qualifica recarga inferior a R$ 20', async () => {
    const client = setup({ amount: '1999' });
    expect(await qualifyReferralForRecharge(client, 'recharge-1')).toBe(false);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('não qualifica recarga pendente', async () => {
    const client = setup({ status: 'pending' });
    expect(await qualifyReferralForRecharge(client, 'recharge-1')).toBe(false);
  });

  it('não qualifica crédito administrativo', async () => {
    const client = setup({ provider: 'manual' });
    expect(await qualifyReferralForRecharge(client, 'recharge-1')).toBe(false);
  });

  it('não qualifica motorista suspenso', async () => {
    const client = setup({ suspended: true });
    expect(await qualifyReferralForRecharge(client, 'recharge-1')).toBe(false);
  });

  it('não qualifica motorista pendente', async () => {
    const client = setup({ driverStatus: 'pending' });
    expect(await qualifyReferralForRecharge(client, 'recharge-1')).toBe(false);
  });

  it('não altera indicação já processada', async () => {
    const client = setup({ updatedRows: 0 });
    expect(await qualifyReferralForRecharge(client, 'recharge-1')).toBe(false);
  });

  it('propaga falha do banco para permitir rollback', async () => {
    const client = setup();
    client.query.mockRejectedValueOnce(new Error('DB_ERROR'));

    await expect(
      qualifyReferralForRecharge(client, 'recharge-1')
    ).rejects.toThrow('DB_ERROR');
  });
});
