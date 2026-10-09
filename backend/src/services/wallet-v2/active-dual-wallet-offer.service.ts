import { Pool } from 'pg';

interface OfferReservationRow {
  offer_id: string;
  promo_reserved: boolean;
  cash_reserved: boolean;
  promo_finalized: boolean;
  cash_finalized: boolean;
}

/**
 * Identifica uma reserva dupla ativa pelos lançamentos financeiros.
 * Não depende das flags atuais do bônus.
 *
 * Não modifica dados.
 */
export async function findActiveDualWalletOffer(
  pool: Pool,
  rideId: string,
  driverId: string
): Promise<string | null> {
  if (!rideId || !driverId) {
    throw new Error('DUAL_WALLET_LOOKUP_INVALID_IDENTITY');
  }

  const { rows } = await pool.query<OfferReservationRow>(
    `SELECT
       o.id AS offer_id,

       EXISTS (
         SELECT 1 FROM driver_promo_ledger p
         WHERE p.idempotency_key = 'promo_reserve:' || o.id
           AND p.driver_id = $2
           AND p.reference_id = $1
           AND p.reference_type = 'ride'
           AND p.entry_type = 'reserve'
       ) AS promo_reserved,

       EXISTS (
         SELECT 1 FROM wallet_ledger w
         WHERE w.idempotency_key = 'reserve:ride:' || o.id
           AND w.driver_id = $2
           AND w.reference_id = $1
           AND w.reference_type = 'ride'
           AND w.entry_type = 'reserve'
       ) AS cash_reserved,

       EXISTS (
         SELECT 1 FROM driver_promo_ledger p
         WHERE p.idempotency_key IN (
           'promo_release:' || o.id,
           'promo_consume:' || o.id
         )
       ) AS promo_finalized,

       EXISTS (
         SELECT 1 FROM wallet_ledger w
         WHERE w.idempotency_key IN (
           'cancel_release:ride:' || o.id,
           'fee:ride:' || $1
         )
           AND w.driver_id = $2
           AND w.reference_id = $1
       ) AS cash_finalized

     FROM ride_offers o
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
       )`,
    [rideId, driverId]
  );

  const active: string[] = [];

  for (const row of rows) {
    const promoActive =
      row.promo_reserved && !row.promo_finalized;

    const cashActive =
      row.cash_reserved && !row.cash_finalized;

    // Uma metade liberada/consumida e a outra ainda
    // reservada indica situação financeira inconsistente.
    if (
      row.promo_reserved &&
      row.cash_reserved &&
      promoActive !== cashActive
    ) {
      throw new Error('DUAL_WALLET_PARTIAL_FINALIZATION');
    }

    if (promoActive || cashActive) {
      active.push(row.offer_id);
    }
  }

  if (active.length > 1) {
    throw new Error('DUAL_WALLET_MULTIPLE_ACTIVE_OFFERS');
  }

  return active[0] ?? null;
}
