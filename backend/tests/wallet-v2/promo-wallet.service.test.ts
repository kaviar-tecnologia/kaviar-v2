import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromoWalletService } from '../../src/services/wallet-v2/promo-wallet.service';

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn();

const pool = { connect: connectMock } as any;

describe('Carteira promocional — segurança', () => {
  const previousFlag = process.env.DRIVER_PERMANENT_WELCOME_ENABLED;

  beforeEach(() => {
    vi.resetAllMocks();

    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'true';

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock,
    });
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
    } else {
      process.env.DRIVER_PERMANENT_WELCOME_ENABLED = previousFlag;
    }
  });

  it('não acessa banco quando desligada', async () => {
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'false';

    const service = new PromoWalletService(pool);

    expect(await service.reserve('driver-1', 'ride-1', 900n)).toBe(0n);
    expect(await service.release('driver-1', 'ride-1')).toBe(0n);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('rejeita reserva negativa', async () => {
    const service = new PromoWalletService(pool);

    await expect(service.reserve('driver-1', 'ride-1', -1n))
      .rejects.toThrow('INVALID_PROMO_RESERVE_AMOUNT');

    expect(connectMock).not.toHaveBeenCalled();
  });

  it('impede reutilizar reserva de outro motorista', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '2000', reserved_cents: '900' }],
      })
      .mockResolvedValueOnce({
        rows: [{ driver_id: 'driver-2', amount_cents: '900' }],
      })
      .mockResolvedValueOnce({}); // ROLLBACK

    const service = new PromoWalletService(pool);

    await expect(service.reserve('driver-1', 'ride-1', 900n))
      .rejects.toThrow('PROMO_RESERVE_DRIVER_MISMATCH');

    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    expect(queryMock).not.toHaveBeenCalledWith('COMMIT');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('impede liberar uma reserva consumida', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '1100', reserved_cents: '0' }],
      })
      .mockResolvedValueOnce({ rows: [] }) // release anterior
      .mockResolvedValueOnce({ rows: [{ id: '1' }] }) // consumo
      .mockResolvedValueOnce({}); // ROLLBACK

    const service = new PromoWalletService(pool);

    await expect(service.release('driver-1', 'ride-1'))
      .rejects.toThrow('PROMO_RESERVE_ALREADY_CONSUMED');

    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    expect(queryMock).not.toHaveBeenCalledWith('COMMIT');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('impede reutilizar reserva cancelada', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '2000', reserved_cents: '0' }],
      })
      .mockResolvedValueOnce({
        rows: [{ driver_id: 'driver-1', amount_cents: '900' }],
      })
      .mockResolvedValueOnce({
        rows: [{ entry_type: 'release' }],
      })
      .mockResolvedValueOnce({}); // ROLLBACK

    const service = new PromoWalletService(pool);

    await expect(service.reserve('driver-1', 'ride-1', 900n))
      .rejects.toThrow('PROMO_RESERVE_ALREADY_FINALIZED');

    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    expect(queryMock).not.toHaveBeenCalledWith('COMMIT');
  });

  it('impede reutilizar reserva consumida', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '1100', reserved_cents: '0' }],
      })
      .mockResolvedValueOnce({
        rows: [{ driver_id: 'driver-1', amount_cents: '900' }],
      })
      .mockResolvedValueOnce({
        rows: [{ entry_type: 'consume' }],
      })
      .mockResolvedValueOnce({}); // ROLLBACK

    const service = new PromoWalletService(pool);

    await expect(service.reserve('driver-1', 'ride-1', 900n))
      .rejects.toThrow('PROMO_RESERVE_ALREADY_FINALIZED');

    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
  });

  it('consome R$ 9 e libera integralmente a reserva', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '2000', reserved_cents: '900' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ driver_id: 'driver-1', amount_cents: '900', reference_id: 'ride-1' }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const service = new PromoWalletService(pool);
    const client = { query: queryMock } as any;

    expect(await service.consumeInClient(
      client, 'driver-1', 'ride-1', 900n
    )).toBe(900n);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE driver_promo_wallets'),
      ['driver-1', '1100', '0']
    );
  });

  it('consumo parcial libera a reserva não utilizada', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '2000', reserved_cents: '1500' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ driver_id: 'driver-1', amount_cents: '1500', reference_id: 'ride-2' }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const service = new PromoWalletService(pool);
    const client = { query: queryMock } as any;

    expect(await service.consumeInClient(
      client, 'driver-1', 'ride-2', 1200n
    )).toBe(1200n);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE driver_promo_wallets'),
      ['driver-1', '800', '0']
    );
  });

  it('consumo repetido é idempotente', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '1100', reserved_cents: '0' }],
      })
      .mockResolvedValueOnce({
        rows: [{ driver_id: 'driver-1', amount_cents: '-900', reference_id: 'ride-1' }],
      });

    const service = new PromoWalletService(pool);
    const client = { query: queryMock } as any;

    expect(await service.consumeInClient(
      client, 'driver-1', 'ride-1', 900n
    )).toBe(900n);

    expect(queryMock).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE driver_promo_wallets'),
      expect.anything()
    );
  });

  it('impede consumo de reserva cancelada', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '2000', reserved_cents: '0' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '1' }] });

    const service = new PromoWalletService(pool);
    const client = { query: queryMock } as any;

    await expect(service.consumeInClient(
      client, 'driver-1', 'ride-1', 900n
    )).rejects.toThrow('PROMO_RESERVE_ALREADY_RELEASED');
  });

  it('impede consumo acima da reserva', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '2000', reserved_cents: '500' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ driver_id: 'driver-1', amount_cents: '500', reference_id: 'ride-1' }],
      });

    const service = new PromoWalletService(pool);
    const client = { query: queryMock } as any;

    await expect(service.consumeInClient(
      client, 'driver-1', 'ride-1', 900n
    )).rejects.toThrow('PROMO_CONSUME_EXCEEDS_RESERVATION');
  });

  it('reserva somente o saldo promocional disponível', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '2000', reserved_cents: '900' }],
      })
      .mockResolvedValueOnce({ rows: [] }) // sem reserva anterior
      .mockResolvedValueOnce({}) // UPDATE
      .mockResolvedValueOnce({}) // INSERT ledger
      .mockResolvedValueOnce({}); // COMMIT

    const service = new PromoWalletService(pool);

    expect(await service.reserve('driver-1', 'ride-2', 1500n))
      .toBe(1100n);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE driver_promo_wallets'),
      ['driver-1', '2000']
    );

    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
