import type { Pool } from 'pg';
import { releaseRideReservation } from './ride-reservation-release.service';

export interface CanceledReservationCandidate {
  ride_id: string;
  driver_id: string;
  offer_id: string;
}

/**
 * Localiza reservas potencialmente abandonadas.
 *
 * Somente leitura. Não movimenta saldos.
 * Não depende das flags atuais do bônus.
 */
export async function findCanceledReservations(
  pool: Pool,
  limit = 20
): Promise<CanceledReservationCandidate[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('RECOVERY_INVALID_BATCH_LIMIT');
  }

  const { rows } = await pool.query<CanceledReservationCandidate>(
    `SELECT DISTINCT
       o.ride_id::text AS ride_id,
       o.driver_id::text AS driver_id,
       o.id::text AS offer_id
     FROM ride_offers o
     JOIN rides_v2 r ON r.id = o.ride_id
     WHERE o.driver_id IS NOT NULL
       AND (
         (
           o.status = 'canceled'
           AND (
             r.driver_id IS DISTINCT FROM o.driver_id
             OR r.status IN (
               'canceled_by_passenger',
               'canceled_by_driver'
             )
           )
         )
         OR (
           r.status IN (
             'canceled_by_passenger',
             'canceled_by_driver'
           )
           AND r.driver_id = o.driver_id
           AND o.status = 'accepted'
         )
       )
       AND (
         EXISTS (
           SELECT 1 FROM driver_promo_ledger p
           WHERE p.idempotency_key = 'promo_reserve:' || o.id
             AND p.driver_id = o.driver_id
             AND p.reference_id = o.ride_id
             AND p.reference_type = 'ride'
             AND p.entry_type = 'reserve'
             AND NOT EXISTS (
               SELECT 1 FROM driver_promo_ledger t
               WHERE t.idempotency_key IN (
                 'promo_release:' || o.id,
                 'promo_consume:' || o.id
               )
               AND t.driver_id = o.driver_id
               AND t.reference_id = o.ride_id
             )
         )
         OR EXISTS (
           SELECT 1 FROM wallet_ledger w
           WHERE w.idempotency_key = 'reserve:ride:' || o.id
             AND w.driver_id = o.driver_id
             AND w.reference_id = o.ride_id
             AND w.reference_type = 'ride'
             AND w.entry_type = 'reserve'
             AND NOT EXISTS (
               SELECT 1 FROM wallet_ledger t
               WHERE t.idempotency_key IN (
                 'cancel_release:ride:' || o.id,
                 'fee:ride:' || o.ride_id
               )
               AND t.driver_id = o.driver_id
               AND t.reference_id = o.ride_id
             )
         )
         OR EXISTS (
           SELECT 1 FROM wallet_ledger w
           WHERE w.idempotency_key = 'reserve:ride:' || o.ride_id
             AND w.driver_id = o.driver_id
             AND w.reference_id = o.ride_id
             AND w.reference_type = 'ride'
             AND w.entry_type = 'reserve'
             AND NOT EXISTS (
               SELECT 1 FROM wallet_ledger t
               WHERE t.idempotency_key IN (
                 'cancel_release:ride:' || o.ride_id,
                 'fee:ride:' || o.ride_id
               )
               AND t.driver_id = o.driver_id
               AND t.reference_id = o.ride_id
             )
         )
       )
     ORDER BY ride_id, driver_id, offer_id
     LIMIT $1`,
    [limit]
  );

  return rows;
}


export interface CanceledReservationRecoveryResult {
  scanned: number;
  released: number;
  already_finalized: number;
  skipped: number;
  errors: number;
  disabled: boolean;
}

/**
 * Recupera reservas de ofertas canceladas.
 *
 * Revalida corrida e oferta sob bloqueio no PostgreSQL.
 * Usa a liberação financeira já existente e idempotente.
 * Independente das flags de concessão e uso promocional.
 */
export async function recoverCanceledReservations(
  pool: Pool,
  limit = 20
): Promise<CanceledReservationRecoveryResult> {
  const result: CanceledReservationRecoveryResult = {
    scanned: 0,
    released: 0,
    already_finalized: 0,
    skipped: 0,
    errors: 0,
    disabled: false
  };

  if (process.env.DRIVER_CANCEL_RESERVATION_RECOVERY_ENABLED !== 'true') {
    result.disabled = true;
    return result;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('RECOVERY_INVALID_BATCH_LIMIT');
  }

  // A consulta protegida utilizará uma conexão e a
  // liberação financeira poderá utilizar outra.
  const maxConnections = (
    pool as unknown as { options?: { max?: number } }
  ).options?.max ?? 10;

  if (maxConnections < 2) {
    throw new Error('RECOVERY_REQUIRES_TWO_POOL_CONNECTIONS');
  }

  const candidates = await findCanceledReservations(pool, limit);

  for (const candidate of candidates) {
    result.scanned++;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Bloquear primeiro a corrida, depois a oferta.
      // A aceitação não pode trocar a atribuição enquanto
      // esta recuperação realiza a liberação.
      const rideResult = await client.query<{
        id: string;
        driver_id: string | null;
        status: string;
      }>(
        `SELECT id::text AS id,
                driver_id::text AS driver_id,
                status
         FROM rides_v2
         WHERE id = $1
         FOR UPDATE`,
        [candidate.ride_id]
      );

      const offerResult = await client.query<{
        id: string;
        ride_id: string;
        driver_id: string;
        status: string;
      }>(
        `SELECT id::text AS id,
                ride_id::text AS ride_id,
                driver_id::text AS driver_id,
                status
         FROM ride_offers
         WHERE id = $1
         FOR UPDATE`,
        [candidate.offer_id]
      );

      const ride = rideResult.rows[0];
      const offer = offerResult.rows[0];

      if (
        !ride ||
        !offer ||
        offer.ride_id !== candidate.ride_id ||
        offer.driver_id !== candidate.driver_id
      ) {
        result.skipped++;
        await client.query('ROLLBACK');
        continue;
      }

      const canceledStatuses = new Set([
        'canceled_by_passenger',
        'canceled_by_driver'
      ]);

      const redispatchStatuses = new Set([
        'requested',
        'offered',
        'pending_adjustment',
        'accepted',
        'arrived',
        'in_progress',
        'completed',
        'canceled_by_passenger',
        'canceled_by_driver'
      ]);

      const rideCanceled = canceledStatuses.has(ride.status);

      const originalDriverNoLongerAssigned =
        ride.driver_id === null ||
        ride.driver_id !== candidate.driver_id;

      const canceledOriginalOffer =
        offer.status === 'canceled' &&
        originalDriverNoLongerAssigned &&
        redispatchStatuses.has(ride.status);

      const canceledAssignedRide =
        rideCanceled &&
        ['accepted', 'canceled'].includes(offer.status);

      if (!canceledOriginalOffer && !canceledAssignedRide) {
        result.skipped++;
        await client.query('ROLLBACK');
        continue;
      }

      const outcome = await releaseRideReservation(
        pool,
        candidate.ride_id,
        candidate.driver_id
      );

      if (outcome === 'already_finalized') {
        result.already_finalized++;
      } else {
        result.released++;
      }

      await client.query('COMMIT');
    } catch (error) {
      result.errors++;

      try {
        await client.query('ROLLBACK');
      } catch {
        // Preservar o erro original.
      }

      console.error(
        '[CANCELED_RESERVATION_RECOVERY_ITEM_ERROR]',
        error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      );
    } finally {
      client.release();
    }
  }

  return result;
}
