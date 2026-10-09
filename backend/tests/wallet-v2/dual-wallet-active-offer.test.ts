import { describe, expect, it, vi } from 'vitest';

import { DualWalletReservationService }
  from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('Carteira dupla — ofertas concorrentes', () => {
  it('bloqueia outra oferta enquanto a anterior possui reserva ativa', async () => {
    const rideId = 'ride-shared-100';
    const offerA = 'offer-a';
    const offerB = 'offer-b';
    const driverA = 'driver-a';
    const driverB = 'driver-b';

    const query = vi.fn(async (
      sql: string,
      params?: string[]
    ) => {
      // Historico de reserva ativa da oferta A.
      if (
        sql.includes('FROM public.driver_promo_ledger') &&
        sql.includes('reference_id')
      ) {
        return {
          rows: [{
            driver_id: driverA,
            reference_id: rideId,
            idempotency_key: `promo_reserve:${offerA}`,
            amount_cents: '300'
          }]
        };
      }

      if (
        sql.includes('FROM public.wallet_ledger') &&
        sql.includes('reference_id')
      ) {
        return {
          rows: [{
            driver_id: driverA,
            reference_id: rideId,
            idempotency_key: `reserve:ride:${offerA}`,
            reserved_delta_cents: '200'
          }]
        };
      }

      // A oferta B ainda nao possui lancamentos.
      if (
        sql.includes('FROM driver_promo_ledger') ||
        sql.includes('FROM wallet_ledger')
      ) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const release = vi.fn();

    const pool = {
      connect: vi.fn(async () => ({ query, release }))
    };

    const cashReserve = vi.fn(async () => undefined);
    const promoReserve = vi.fn(async () => 300n);

    const service = new DualWalletReservationService(
      pool as any,
      { reserveInClient: cashReserve } as any,
      { reserveInClient: promoReserve } as any
    );

    await expect(
      service.reserve(driverB, rideId, 500n, offerB)
    ).rejects.toThrow(
      'DUAL_WALLET_ACTIVE_OFFER_EXISTS'
    );

    expect(promoReserve).not.toHaveBeenCalled();
    expect(cashReserve).not.toHaveBeenCalled();

    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(query).not.toHaveBeenCalledWith('COMMIT');

    expect(release).toHaveBeenCalledTimes(1);
  });
});
