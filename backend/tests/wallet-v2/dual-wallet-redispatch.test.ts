import { describe, expect, it, vi } from 'vitest';

import { DualWalletReservationService }
  from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('Carteira dupla — redispatch', () => {
  it('bloqueia reutilizacao de reserva encerrada sem nova identidade financeira', async () => {
    const rideId = 'ride-redispatch-test';
    const originalDriver = 'driver-a';
    const newDriver = 'driver-b';

    const query = vi.fn(async (
      sql: string,
      params?: string[]
    ) => {
      if (sql.includes('FROM driver_promo_ledger')) {
        if (sql.includes('idempotency_key IN')) {
          return { rows: [{ entry_type: 'release' }] };
        }

        if (params?.[0] === `promo_reserve:${rideId}`) {
          return {
            rows: [{
              driver_id: originalDriver,
              amount_cents: '300'
            }]
          };
        }
      }

      if (sql.includes('FROM wallet_ledger')) {
        if (sql.includes('idempotency_key IN')) {
          return {
            rows: [{ entry_type: 'cancel_release' }]
          };
        }

        if (params?.[0] === `reserve:ride:${rideId}`) {
          return {
            rows: [{
              driver_id: originalDriver,
              reserved_delta_cents: '200'
            }]
          };
        }
      }

      return { rows: [] };
    });

    const release = vi.fn();

    const pool = {
      connect: vi.fn(async () => ({ query, release }))
    };

    const wallet = {
      reserveInClient: vi.fn(async () => undefined)
    };

    const promo = {
      reserveInClient: vi.fn(async () => 300n)
    };

    const service = new DualWalletReservationService(
      pool as any,
      wallet as any,
      promo as any
    );

    // A oferta anterior foi encerrada.
    // O novo motorista deve poder reservar a mesma corrida
    // usando uma tentativa financeira independente.
    await expect(
      service.reserve(newDriver, rideId, 500n)
    ).rejects.toThrow(
      'DUAL_WALLET_RESERVATION_ALREADY_FINALIZED'
    );

    expect(wallet.reserveInClient).not.toHaveBeenCalled();
    expect(promo.reserveInClient).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(query).not.toHaveBeenCalledWith('COMMIT');

    expect(release).toHaveBeenCalledTimes(1);
  });
});
