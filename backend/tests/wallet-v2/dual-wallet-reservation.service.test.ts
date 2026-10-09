import { describe, it, expect, vi } from 'vitest';
import { DualWalletReservationService } from '../../src/services/wallet-v2/dual-wallet-reservation.service';

type PromoEntry = {
  driver_id: string;
  amount_cents: string;
};

type CashEntry = {
  driver_id: string;
  reserved_delta_cents: string;
};

function setup(
  promoEntry?: PromoEntry,
  cashEntry?: CashEntry
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('WHERE idempotency_key IN')) {
      return { rows: [] };
    }

    if (sql.includes('FROM driver_promo_ledger')) {
      return { rows: promoEntry ? [promoEntry] : [] };
    }

    if (sql.includes('FROM wallet_ledger')) {
      return { rows: cashEntry ? [cashEntry] : [] };
    }

    return { rows: [] };
  });

  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));

  const promoReserve = vi.fn(async () => 300n);
  const cashReserve = vi.fn(async () => ({}));

  const service = new DualWalletReservationService(
    { connect } as any,
    { reserveInClient: cashReserve } as any,
    { reserveInClient: promoReserve } as any
  );

  return {
    service,
    query,
    release,
    connect,
    promoReserve,
    cashReserve
  };
}

describe('Carteira dupla — reserva atomica', () => {
  it('rejeita taxa invalida', async () => {
    const f = setup();

    await expect(
      f.service.reserve('driver-1', 'ride-1', 0n)
    ).rejects.toThrow('INVALID_ESTIMATED_FEE');

    expect(f.connect).not.toHaveBeenCalled();
  });

  it('divide R$ 5 entre promocional e financeiro', async () => {
    const f = setup();

    const result = await f.service.reserve(
      'driver-1',
      'ride-1',
      500n
    );

    expect(result).toEqual({
      promoReservedCents: 300n,
      cashReservedCents: 200n
    });

    expect(f.promoReserve).toHaveBeenCalledTimes(1);

    expect(f.cashReserve).toHaveBeenCalledWith(
      expect.anything(),
      'driver-1',
      200n,
      'ride-1'
    );

    expect(f.query).toHaveBeenCalledWith('COMMIT');
    expect(f.release).toHaveBeenCalledTimes(1);

    expect(
      f.query.mock.calls.some(
        ([sql]) => sql.includes('pg_advisory_xact_lock')
      )
    ).toBe(true);
  });

  it('nao duplica reserva existente', async () => {
    const f = setup(
      { driver_id: 'driver-1', amount_cents: '300' },
      { driver_id: 'driver-1', reserved_delta_cents: '200' }
    );

    const result = await f.service.reserve(
      'driver-1',
      'ride-1',
      500n
    );

    expect(result.promoReservedCents).toBe(300n);
    expect(result.cashReservedCents).toBe(200n);

    expect(f.promoReserve).not.toHaveBeenCalled();
    expect(f.cashReserve).not.toHaveBeenCalled();
    expect(f.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejeita divergencia em reserva anterior', async () => {
    const f = setup(
      { driver_id: 'driver-1', amount_cents: '300' },
      { driver_id: 'driver-1', reserved_delta_cents: '100' }
    );

    await expect(
      f.service.reserve('driver-1', 'ride-1', 500n)
    ).rejects.toThrow('DUAL_WALLET_RESERVATION_MISMATCH');

    expect(f.query).toHaveBeenCalledWith('ROLLBACK');
    expect(f.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('executa rollback quando reserva financeira falha', async () => {
    const f = setup();

    f.cashReserve.mockRejectedValueOnce(
      new Error('INSUFFICIENT_BALANCE')
    );

    await expect(
      f.service.reserve('driver-1', 'ride-1', 500n)
    ).rejects.toThrow('INSUFFICIENT_BALANCE');

    expect(f.query).toHaveBeenCalledWith('ROLLBACK');
    expect(f.query).not.toHaveBeenCalledWith('COMMIT');
    expect(f.release).toHaveBeenCalledTimes(1);
  });
});
