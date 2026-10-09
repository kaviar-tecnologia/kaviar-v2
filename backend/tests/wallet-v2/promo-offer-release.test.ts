import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromoWalletService } from '../../src/services/wallet-v2/promo-wallet.service';

describe('KAVIAR Incentivos — liberacao promocional por oferta', () => {
  const originalFlag = process.env.DRIVER_PERMANENT_WELCOME_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
    } else {
      process.env.DRIVER_PERMANENT_WELCOME_ENABLED = originalFlag;
    }
  });

  function setup(options: {
    released?: boolean;
    consumed?: boolean;
    owner?: string;
    referenceId?: string;
    reserved?: string;
  } = {}) {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM driver_promo_wallets')) {
        return {
          rows: [{
            balance_cents: '2000',
            reserved_cents: options.reserved ?? '300'
          }]
        };
      }

      if (sql.includes('FROM driver_promo_ledger')) {
        const key = String(params?.[0] ?? '');

        if (key === 'promo_release:offer-a') {
          return {
            rows: options.released
              ? [{ driver_id: 'driver-a' }]
              : []
          };
        }

        if (key === 'promo_consume:offer-a') {
          return {
            rows: options.consumed ? [{ id: 'consumed-1' }] : []
          };
        }

        if (key === 'promo_reserve:offer-a') {
          return {
            rows: [{
              driver_id: options.owner ?? 'driver-a',
              amount_cents: '300',
              reference_id: options.referenceId ?? 'ride-100'
            }]
          };
        }
      }

      return { rows: [] };
    });

    const service = new PromoWalletService({} as any);
    const client = { query } as any;

    return { service, client, query };
  }

  it('libera exatamente os creditos da oferta', async () => {
    const { service, client, query } = setup();

    const released = await service.releaseInClient(
      client, 'driver-a', 'ride-100', 'offer-a'
    );

    expect(released).toBe(300n);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE driver_promo_wallets'),
      ['driver-a', '0']
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO driver_promo_ledger'),
      [
        'driver-a', '300', '2000', '-300',
        '0', 'ride-100', 'promo_release:offer-a'
      ]
    );
  });

  it('nao libera duas vezes', async () => {
    const { service, client, query } = setup({
      released: true
    });

    expect(await service.releaseInClient(
      client, 'driver-a', 'ride-100', 'offer-a'
    )).toBe(0n);

    expect(query.mock.calls.some(
      ([sql]) => sql.includes('UPDATE driver_promo_wallets')
    )).toBe(false);
  });

  it('impede liberar reserva de outro motorista', async () => {
    const { service, client } = setup({
      owner: 'driver-b'
    });

    await expect(service.releaseInClient(
      client, 'driver-a', 'ride-100', 'offer-a'
    )).rejects.toThrow('PROMO_RELEASE_DRIVER_MISMATCH');
  });

  it('impede liberar reserva de outra corrida', async () => {
    const { service, client } = setup({
      referenceId: 'ride-200'
    });

    await expect(service.releaseInClient(
      client, 'driver-a', 'ride-100', 'offer-a'
    )).rejects.toThrow('PROMO_RELEASE_RIDE_MISMATCH');
  });

  it('impede liberar reserva ja consumida', async () => {
    const { service, client } = setup({
      consumed: true
    });

    await expect(service.releaseInClient(
      client, 'driver-a', 'ride-100', 'offer-a'
    )).rejects.toThrow('PROMO_RESERVE_ALREADY_CONSUMED');
  });

  it('libera reserva existente mesmo com campanha desligada', async () => {
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'false';

    const { service, client } = setup();

    expect(await service.releaseInClient(
      client, 'driver-a', 'ride-100', 'offer-a'
    )).toBe(300n);
  });

  it('impede liberar valor superior ao reservado', async () => {
    const { service, client } = setup({
      reserved: '200'
    });

    await expect(service.releaseInClient(
      client, 'driver-a', 'ride-100', 'offer-a'
    )).rejects.toThrow('PROMO_RELEASE_INVARIANT');
  });
});
