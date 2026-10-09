import { Pool } from 'pg';
import { WalletService } from './wallet.service';
import { PromoWalletService } from './promo-wallet.service';

export interface DualWalletReservation {
  promoReservedCents: bigint;
  cashReservedCents: bigint;
}

export class DualWalletReservationService {
  constructor(
    private readonly pool: Pool,
    private readonly wallet: WalletService,
    private readonly promo: PromoWalletService
  ) {}


  // Encerra uma tentativa financeira por oferta.
  // Promoção e saldo financeiro compartilham BEGIN/COMMIT/ROLLBACK.
  async release(
    driverId: string,
    rideId: string,
    offerId: string
  ): Promise<DualWalletReservation> {
    if (!driverId || !rideId || !offerId) {
      throw new Error('INVALID_DUAL_WALLET_RELEASE_IDENTITY');
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`dual-wallet-reserve:${rideId}`]
      );

      const promoReservedCents = await this.promo.releaseInClient(
        client, driverId, rideId, offerId
      );

      const cashReservedCents =
        await this.wallet.releaseOfferReserveInClient(
          client, driverId, rideId, offerId
        );

      await client.query('COMMIT');

      return { promoReservedCents, cashReservedCents };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preservar o erro original.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async reserve(
    driverId: string,
    rideId: string,
    estimatedFeeCents: bigint,
    offerId?: string
  ): Promise<DualWalletReservation> {
    if (estimatedFeeCents <= 0n) {
      throw new Error('INVALID_ESTIMATED_FEE');
    }

    if (offerId !== undefined && offerId.length === 0) {
      throw new Error('INVALID_FINANCIAL_OFFER_ID');
    }

    const attemptId = offerId ?? rideId;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`dual-wallet-reserve:${rideId}`]
      );

      // Uma corrida nao pode manter reservas ativas de ofertas diferentes.
      // A operacao ocorre sob o advisory lock da corrida.
      const activePromoOffer = await client.query(
        `SELECT 1
         FROM public.driver_promo_ledger r
         WHERE r.reference_type = 'ride'
           AND r.reference_id = $1
           AND r.entry_type = 'reserve'
           AND r.idempotency_key LIKE 'promo_reserve:%'
           AND r.idempotency_key <> $2
           AND NOT EXISTS (
             SELECT 1
             FROM public.driver_promo_ledger terminal
             WHERE terminal.idempotency_key IN (
               'promo_release:' ||
                 substring(
                   r.idempotency_key
                   FROM length('promo_reserve:') + 1
                 ),
               'promo_consume:' ||
                 substring(
                   r.idempotency_key
                   FROM length('promo_reserve:') + 1
                 )
             )
           )
         LIMIT 1`,
        [rideId, `promo_reserve:${attemptId}`]
      );

      const activeCashOffer = await client.query(
        `SELECT 1
         FROM public.wallet_ledger r
         WHERE r.reference_type = 'ride'
           AND r.reference_id = $1
           AND r.entry_type = 'reserve'
           AND r.idempotency_key LIKE 'reserve:ride:%'
           AND r.idempotency_key <> $2
           AND NOT EXISTS (
             SELECT 1
             FROM public.wallet_ledger terminal
             WHERE terminal.idempotency_key IN (
               'cancel_release:ride:' ||
                 substring(
                   r.idempotency_key
                   FROM length('reserve:ride:') + 1
                 ),
               'fee:ride:' || $1
             )
           )
         LIMIT 1`,
        [rideId, `reserve:ride:${attemptId}`]
      );

      if (
        activePromoOffer.rows.length > 0 ||
        activeCashOffer.rows.length > 0
      ) {
        throw new Error('DUAL_WALLET_ACTIVE_OFFER_EXISTS');
      }

      // Consultar reservas anteriores antes de calcular nova divisão.
      const existingPromo = await client.query(
        `SELECT driver_id, amount_cents
         FROM driver_promo_ledger
         WHERE idempotency_key = $1`,
        [`promo_reserve:${attemptId}`]
      );

      const existingCash = await client.query(
        `SELECT driver_id, reserved_delta_cents
         FROM wallet_ledger
         WHERE idempotency_key = $1`,
        [`reserve:ride:${attemptId}`]
      );

      // Bloquear reutilizacao de reservas ja finalizadas.
      const finalizedPromo = await client.query(
        `SELECT 1
         FROM driver_promo_ledger
         WHERE idempotency_key IN ($1, $2)
         LIMIT 1`,
        [
          `promo_release:${attemptId}`,
          `promo_consume:${attemptId}`
        ]
      );

      const finalizedCash = await client.query(
        `SELECT 1
         FROM wallet_ledger
         WHERE idempotency_key IN ($1, $2)
           AND driver_id = $3
           AND reference_id = $4
         LIMIT 1`,
        [
          `cancel_release:ride:${attemptId}`,
          `fee:ride:${rideId}`,
          driverId,
          rideId
        ]
      );

      if (
        finalizedPromo.rows.length > 0 ||
        finalizedCash.rows.length > 0
      ) {
        throw new Error(
          'DUAL_WALLET_RESERVATION_ALREADY_FINALIZED'
        );
      }

      const hasPreviousReservation =
        existingPromo.rows.length > 0 ||
        existingCash.rows.length > 0;

      if (hasPreviousReservation) {
        const promoAmount = existingPromo.rows.length
          ? BigInt(existingPromo.rows[0].amount_cents)
          : 0n;

        const cashAmount = existingCash.rows.length
          ? BigInt(existingCash.rows[0].reserved_delta_cents)
          : 0n;

        if (
          (existingPromo.rows[0] &&
            existingPromo.rows[0].driver_id !== driverId) ||
          (existingCash.rows[0] &&
            existingCash.rows[0].driver_id !== driverId) ||
          promoAmount + cashAmount !== estimatedFeeCents
        ) {
          throw new Error('DUAL_WALLET_RESERVATION_MISMATCH');
        }

        await client.query('COMMIT');

        return {
          promoReservedCents: promoAmount,
          cashReservedCents: cashAmount
        };
      }

      const promoReservedCents = offerId === undefined
        ? await this.promo.reserveInClient(
            client, driverId, rideId, estimatedFeeCents
          )
        : await this.promo.reserveInClient(
            client, driverId, rideId, estimatedFeeCents, offerId
          );

      const cashReservedCents =
        estimatedFeeCents - promoReservedCents;

      if (cashReservedCents > 0n) {
        if (offerId === undefined) {
          await this.wallet.reserveInClient(
            client, driverId, cashReservedCents, rideId
          );
        } else {
          await this.wallet.reserveInClient(
            client, driverId, cashReservedCents, rideId, offerId
          );
        }
      }

      await client.query('COMMIT');

      return {
        promoReservedCents,
        cashReservedCents
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preservar erro original.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
