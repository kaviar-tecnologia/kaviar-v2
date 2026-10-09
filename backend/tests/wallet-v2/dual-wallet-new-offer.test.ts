import { describe, expect, it, vi } from 'vitest';
import { DualWalletReservationService }
  from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('Carteira dupla — nova oferta apos redispatch', () => {
  it('permite nova tentativa financeira sem reutilizar reserva encerrada', async () => {
    const rideId = 'ride-redispatch-100';
    const offerB = 'offer-b';
    const driverA = 'driver-a';
    const driverB = 'driver-b';

    // Historico anterior, associado ao mesmo ride_id.
    const query = vi.fn(async (
      sql: string,
      params?: string[]
    ) => {
      if (sql.includes('FROM driver_promo_ledger')) {
        if (params?.includes(`promo_reserve:${rideId}`)) {
          return {
            rows: [{
              driver_id: driverA,
              amount_cents: '300'
            }]
          };
        }

        if (params?.includes(`promo_release:${rideId}`)) {
          return { rows: [{ entry_type: 'release' }] };
        }
      }

      if (sql.includes('FROM wallet_ledger')) {
        if (params?.includes(`reserve:ride:${rideId}`)) {
          return {
            rows: [{
              driver_id: driverA,
              reserved_delta_cents: '200'
            }]
          };
        }

        if (params?.includes(`cancel_release:ride:${rideId}`)) {
          return { rows: [{ entry_type: 'cancel_release' }] };
        }
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

    // Contrato futuro: a nova oferta deve ter identidade propria.
    const reserveWithOffer = service.reserve.bind(service) as unknown as (
      driverId: string,
      rideId: string,
      amountCents: bigint,
      offerId: string
    ) => Promise<{
      promoReservedCents: bigint;
      cashReservedCents: bigint;
    }>;

    await expect(
      reserveWithOffer(driverB, rideId, 500n, offerB)
    ).resolves.toEqual({
      promoReservedCents: 300n,
      cashReservedCents: 200n
    });

    // A identidade da nova oferta deve participar da operacao.
    const usedOfferIdentity = query.mock.calls.some(
      ([, params]) =>
        params?.some(value => value.includes(offerB))
    );

    expect(usedOfferIdentity).toBe(true);

    expect(promoReserve).toHaveBeenCalledOnce();
    expect(cashReserve).toHaveBeenCalledOnce();

    expect(promoReserve).toHaveBeenCalledWith(
      expect.anything(), driverB, rideId, 500n, offerB
    );

    expect(cashReserve).toHaveBeenCalledWith(
      expect.anything(), driverB, 200n, rideId, offerB
    );
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
