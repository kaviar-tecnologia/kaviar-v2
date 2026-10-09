import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromoWalletService } from '../../src/services/wallet-v2/promo-wallet.service';

type Options = {
  reservationRide?: string;
  reservationDriver?: string;
  consumed?: boolean;
  released?: boolean;
};

function makeClient(options: Options = {}) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM driver_promo_wallets')) {
      return {
        rows: [{ balance_cents: '2000', reserved_cents: '900' }]
      };
    }

    if (sql.includes('FROM driver_promo_ledger')) {
      const key = params[0];

      if (key === 'promo_consume:offer-1') {
        return {
          rows: options.consumed
            ? [{
                driver_id: 'driver-1',
                amount_cents: '-900',
                reference_id: 'ride-1'
              }]
            : []
        };
      }

      if (key === 'promo_release:offer-1') {
        return {
          rows: options.released ? [{ id: 'release-1' }] : []
        };
      }

      if (key === 'promo_reserve:offer-1') {
        return {
          rows: [{
            driver_id: options.reservationDriver ?? 'driver-1',
            amount_cents: '900',
            reference_id: options.reservationRide ?? 'ride-1'
          }]
        };
      }

      throw new Error(`UNEXPECTED_LEDGER_KEY: ${String(key)}`);
    }

    if (
      sql.includes('UPDATE driver_promo_wallets') ||
      sql.includes('INSERT INTO driver_promo_ledger')
    ) {
      return { rows: [] };
    }

    throw new Error('UNEXPECTED_SQL');
  });

  return { query };
}

function hasWrites(client: ReturnType<typeof makeClient>): boolean {
  return client.query.mock.calls.some(([sql]) =>
    sql.includes('UPDATE driver_promo_wallets') ||
    sql.includes('INSERT INTO driver_promo_ledger')
  );
}

describe('KAVIAR — consumo promocional por oferta', () => {
  const previousFlag = process.env.DRIVER_PERMANENT_WELCOME_ENABLED;

  beforeEach(() => {
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'true';
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
    } else {
      process.env.DRIVER_PERMANENT_WELCOME_ENABLED = previousFlag;
    }
  });

  const service = new PromoWalletService({} as any);

  it('consome reserva existente mesmo com campanha desligada', async () => {
    const client = makeClient();

    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'false';

    const amount = await service.consumeInClient(
      client as any,
      'driver-1',
      'ride-1',
      900n,
      'offer-1'
    );

    expect(amount).toBe(900n);
    expect(hasWrites(client)).toBe(true);
  });

  it('consome somente a reserva da oferta correta', async () => {
    const client = makeClient();

    const amount = await service.consumeInClient(
      client as any, 'driver-1', 'ride-1', 900n, 'offer-1'
    );

    expect(amount).toBe(900n);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM driver_promo_ledger'),
      ['promo_reserve:offer-1']
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE driver_promo_wallets'),
      ['driver-1', '1100', '0']
    );
  });

  it('impede débito duplicado na repetição', async () => {
    const client = makeClient({ consumed: true });

    expect(await service.consumeInClient(
      client as any, 'driver-1', 'ride-1', 900n, 'offer-1'
    )).toBe(900n);

    expect(hasWrites(client)).toBe(false);
  });

  it('rejeita oferta vinculada a outra corrida', async () => {
    const client = makeClient({ reservationRide: 'ride-2' });

    await expect(service.consumeInClient(
      client as any, 'driver-1', 'ride-1', 900n, 'offer-1'
    )).rejects.toThrow('PROMO_RESERVE_RIDE_MISMATCH');

    expect(hasWrites(client)).toBe(false);
  });

  it('rejeita oferta vinculada a outro motorista', async () => {
    const client = makeClient({ reservationDriver: 'driver-2' });

    await expect(service.consumeInClient(
      client as any, 'driver-1', 'ride-1', 900n, 'offer-1'
    )).rejects.toThrow('PROMO_RESERVE_DRIVER_MISMATCH');

    expect(hasWrites(client)).toBe(false);
  });

  it('impede consumo de reserva cancelada', async () => {
    const client = makeClient({ released: true });

    await expect(service.consumeInClient(
      client as any, 'driver-1', 'ride-1', 900n, 'offer-1'
    )).rejects.toThrow('PROMO_RESERVE_ALREADY_RELEASED');

    expect(hasWrites(client)).toBe(false);
  });
});
