import type { Pool } from 'pg';

export interface RedispatchRecoveryResult {
  scanned: number;
  attempted: number;
  skipped: number;
  errors: number;
  disabled: boolean;
}

interface RedispatchCandidate {
  ride_id: string;
}

/**
 * Localiza redistribuições interrompidas.
 *
 * Nunca solicita dispatch enquanto existir uma reserva
 * promocional ou financeira sem finalização comprovada.
 */
async function findRecoverableRedispatches(
  pool: Pool,
  limit: number,
  rideId?: string
): Promise<RedispatchCandidate[]> {
  const { rows } = await pool.query<RedispatchCandidate>(
    `SELECT r.id::text AS ride_id
     FROM rides_v2 r
     WHERE r.status = 'requested'
       AND r.driver_id IS NULL
       AND r.trip_details->>'_redispatch_count' = '1'
       AND ($2::text IS NULL OR r.id::text = $2)

       -- Exigir histórico de oferta cancelada.
       AND EXISTS (
         SELECT 1 FROM ride_offers o
         WHERE o.ride_id = r.id
           AND o.status = 'canceled'
       )

       -- Nunca duplicar oferta pendente ou aceita.
       AND NOT EXISTS (
         SELECT 1 FROM ride_offers o
         WHERE o.ride_id = r.id
           AND o.status IN ('pending', 'accepted')
       )

       -- Não redistribuir com bônus ainda reservado.
       AND NOT EXISTS (
         SELECT 1 FROM driver_promo_ledger p
         WHERE p.reference_id = r.id
           AND p.reference_type = 'ride'
           AND p.entry_type = 'reserve'
           AND p.idempotency_key LIKE 'promo_reserve:%'
           AND NOT EXISTS (
             SELECT 1 FROM driver_promo_ledger t
             WHERE t.driver_id = p.driver_id
               AND t.reference_id = p.reference_id
               AND t.idempotency_key IN (
                 'promo_release:' ||
                   substring(
                     p.idempotency_key
                     FROM length('promo_reserve:') + 1
                   ),
                 'promo_consume:' ||
                   substring(
                     p.idempotency_key
                     FROM length('promo_reserve:') + 1
                   )
               )
           )
       )

       -- Não redistribuir com dinheiro ainda reservado.
       AND NOT EXISTS (
         SELECT 1 FROM wallet_ledger w
         WHERE w.reference_id = r.id
           AND w.reference_type = 'ride'
           AND w.entry_type = 'reserve'
           AND w.idempotency_key LIKE 'reserve:ride:%'
           AND NOT EXISTS (
             SELECT 1 FROM wallet_ledger t
             WHERE t.driver_id = w.driver_id
               AND t.reference_id = w.reference_id
               AND t.idempotency_key IN (
                 'cancel_release:ride:' ||
                   substring(
                     w.idempotency_key
                     FROM length('reserve:ride:') + 1
                   ),
                 'fee:ride:' || r.id
               )
           )
       )

     ORDER BY r.id
     LIMIT $1`,
    [limit, rideId ?? null]
  );

  return rows;
}

/**
 * Reutiliza o dispatcher oficial.
 *
 * O bloqueio de concorrência do dispatcher continua sendo
 * a proteção definitiva contra duas ofertas simultâneas.
 */
export async function resumeInterruptedRedispatches(
  pool: Pool,
  dispatchRide: (rideId: string) => Promise<void>,
  limit = 20
): Promise<RedispatchRecoveryResult> {
  const result: RedispatchRecoveryResult = {
    scanned: 0,
    attempted: 0,
    skipped: 0,
    errors: 0,
    disabled: false,
  };

  if (
    process.env.DRIVER_INTERRUPTED_REDISPATCH_RECOVERY_ENABLED !== 'true'
  ) {
    result.disabled = true;
    return result;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('REDISPATCH_RECOVERY_INVALID_LIMIT');
  }

  const candidates = await findRecoverableRedispatches(
    pool,
    limit
  );

  for (const candidate of candidates) {
    result.scanned++;

    try {
      // Revalidar imediatamente antes de solicitar redispatch.
      const eligible = await findRecoverableRedispatches(
        pool,
        1,
        candidate.ride_id
      );

      if (eligible.length !== 1) {
        result.skipped++;
        continue;
      }

      await dispatchRide(candidate.ride_id);
      result.attempted++;
    } catch (error) {
      result.errors++;

      console.error(
        '[INTERRUPTED_REDISPATCH_RECOVERY_ERROR]',
        error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      );
    }
  }

  return result;
}
