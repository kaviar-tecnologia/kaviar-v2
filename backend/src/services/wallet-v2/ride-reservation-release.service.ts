import { Pool } from 'pg';
import { WalletService } from './wallet.service';
import { PromoWalletService } from './promo-wallet.service';
import { DualWalletReservationService } from './dual-wallet-reservation.service';
import { findActiveDualWalletOffer } from './active-dual-wallet-offer.service';

export type ReservationReleaseResult =
  'dual_released' | 'legacy_released' | 'already_finalized';

/**
 * Libera a reserva comprovada no ledger, nunca por estimativa.
 * A existência de histórico financeiro não depende de flags.
 */
export async function releaseRideReservation(
  pool: Pool,
  rideId: string,
  driverId: string
): Promise<ReservationReleaseResult> {
  if (!rideId || !driverId) {
    throw new Error('RIDE_RESERVATION_RELEASE_INVALID_IDENTITY');
  }

  const activeDualOffer = await findActiveDualWalletOffer(
    pool, rideId, driverId
  );

  if (activeDualOffer) {
    const wallet = new WalletService(pool);
    const promo = new PromoWalletService(pool);

    await new DualWalletReservationService(
      pool, wallet, promo
    ).release(driverId, rideId, activeDualOffer);

    return 'dual_released';
  }

  // A reserva tradicional utiliza rideId, não offerId.
  const { rows: legacyRows } = await pool.query(
    `SELECT driver_id, reference_id, reserved_delta_cents
     FROM wallet_ledger
     WHERE idempotency_key = $1
       AND entry_type = 'reserve'
       AND reference_type = 'ride'`,
    [`reserve:ride:${rideId}`]
  );

  if (legacyRows.length > 0) {
    const legacy = legacyRows[0];

    if (
      legacy.driver_id !== driverId ||
      legacy.reference_id !== rideId
    ) {
      throw new Error('RIDE_LEGACY_RESERVATION_IDENTITY_MISMATCH');
    }

    const { rows: terminal } = await pool.query(
      `SELECT 1 FROM wallet_ledger
       WHERE idempotency_key IN ($1, $2)
         AND driver_id = $3
         AND reference_id = $4
       LIMIT 1`,
      [
        `cancel_release:ride:${rideId}`,
        `fee:ride:${rideId}`,
        driverId,
        rideId,
      ]
    );

    if (terminal.length > 0) {
      return 'already_finalized';
    }

    const reserved = BigInt(legacy.reserved_delta_cents);

    if (reserved <= 0n) {
      throw new Error('RIDE_LEGACY_RESERVATION_INVALID_AMOUNT');
    }

    await new WalletService(pool).releaseReserve(
      driverId, reserved, rideId
    );

    return 'legacy_released';
  }

  // Não executar releaseReserve usando uma estimativa
  // quando houve reserva por oferta já finalizada.
  const { rows: history } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM ride_offers o
       WHERE o.ride_id = $1
         AND o.driver_id = $2
         AND (
           EXISTS (
             SELECT 1 FROM driver_promo_ledger p
             WHERE p.idempotency_key = 'promo_reserve:' || o.id
               AND p.driver_id = $2
               AND p.reference_id = $1
           )
           OR EXISTS (
             SELECT 1 FROM wallet_ledger w
             WHERE w.idempotency_key = 'reserve:ride:' || o.id
               AND w.driver_id = $2
               AND w.reference_id = $1
           )
         )
     ) AS existed`,
    [rideId, driverId]
  );

  if (history[0]?.existed === true) {
    return 'already_finalized';
  }

  // Sem prova de reserva, interromper em vez de inventar
  // uma liberação financeira.
  throw new Error('RIDE_WALLET_RESERVATION_NOT_FOUND');
}
