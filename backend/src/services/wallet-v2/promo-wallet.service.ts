import { Pool, PoolClient } from 'pg';

export class PromoWalletService {
  constructor(private readonly pool: Pool) {}

  async reserve(
    driverId: string,
    rideId: string,
    amountCents: bigint
  ): Promise<bigint> {
    if (amountCents < 0n) {
      throw new Error('INVALID_PROMO_RESERVE_AMOUNT');
    }

    if (process.env.DRIVER_PERMANENT_WELCOME_ENABLED !== 'true') {
      return 0n;
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const amount = await this.reserveInClient(
        client, driverId, rideId, amountCents
      );
      await client.query('COMMIT');
      return amount;
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

  async reserveInClient(
    client: PoolClient,
    driverId: string,
    rideId: string,
    amountCents: bigint,
    offerId?: string
  ): Promise<bigint> {
    if (amountCents < 0n) {
      throw new Error('INVALID_PROMO_RESERVE_AMOUNT');
    }

    if (process.env.DRIVER_PERMANENT_WELCOME_ENABLED !== 'true') {
      return 0n;
    }

    const attemptId = offerId ?? rideId;

    const walletResult = await client.query(
      `SELECT balance_cents, reserved_cents
       FROM driver_promo_wallets
       WHERE driver_id = $1
       FOR UPDATE`,
      [driverId]
    );

    if (!walletResult.rows[0]) {

      return 0n;
    }

    const existing = await client.query(
      `SELECT driver_id, amount_cents
       FROM driver_promo_ledger
       WHERE idempotency_key = $1`,
      [`promo_reserve:${attemptId}`]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].driver_id !== driverId) {
        throw new Error('PROMO_RESERVE_DRIVER_MISMATCH');
      }

      const terminal = await client.query(
        `SELECT entry_type
         FROM driver_promo_ledger
         WHERE idempotency_key IN ($1, $2)
         LIMIT 1`,
        [
          `promo_release:${attemptId}`,
          `promo_consume:${attemptId}`,
        ]
      );

      if (terminal.rows.length > 0) {
        throw new Error('PROMO_RESERVE_ALREADY_FINALIZED');
      }


      return BigInt(existing.rows[0].amount_cents);
    }

    const balance = BigInt(walletResult.rows[0].balance_cents);
    const reserved = BigInt(walletResult.rows[0].reserved_cents);
    const available = balance - reserved;

    const reservedAmount =
      available > 0n
        ? (available < amountCents ? available : amountCents)
        : 0n;

    if (reservedAmount === 0n) {

      return 0n;
    }

    const newReserved = reserved + reservedAmount;

    await client.query(
      `UPDATE driver_promo_wallets
       SET reserved_cents = $2, updated_at = NOW()
       WHERE driver_id = $1`,
      [driverId, newReserved.toString()]
    );

    await client.query(
      `INSERT INTO driver_promo_ledger
        (driver_id, entry_type, amount_cents,
         balance_after_cents, reserved_delta_cents,
         reserved_after_cents, reference_type, reference_id,
         idempotency_key)
       VALUES ($1, 'reserve', $2, $3, $2, $4,
               'ride', $5, $6)`,
      [
        driverId,
        reservedAmount.toString(),
        balance.toString(),
        newReserved.toString(),
        rideId,
        `promo_reserve:${attemptId}`,
      ]
    );



    return reservedAmount;
  }

  async consumeInClient(
    client: PoolClient,
    driverId: string,
    rideId: string,
    amountCents: bigint,
    offerId?: string
  ): Promise<bigint> {
    if (amountCents < 0n) {
      throw new Error('INVALID_PROMO_CONSUME_AMOUNT');
    }

    if (offerId !== undefined && !offerId.trim()) {
      throw new Error('INVALID_PROMO_CONSUME_OFFER_ID');
    }

    const attemptId = offerId ?? rideId;

    const walletResult = await client.query(
      `SELECT balance_cents, reserved_cents
       FROM driver_promo_wallets
       WHERE driver_id = $1
       FOR UPDATE`,
      [driverId]
    );

    if (!walletResult.rows[0]) {
      if (amountCents > 0n) {
        throw new Error('PROMO_WALLET_NOT_FOUND');
      }
      return 0n;
    }

    const existing = await client.query(
      `SELECT driver_id, amount_cents, reference_id
       FROM driver_promo_ledger
       WHERE idempotency_key = $1`,
      [`promo_consume:${attemptId}`]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].driver_id !== driverId ||
          existing.rows[0].reference_id !== rideId ||
          BigInt(existing.rows[0].amount_cents) !== -amountCents) {
        throw new Error('PROMO_CONSUME_IDEMPOTENCY_MISMATCH');
      }
      return amountCents;
    }

    const released = await client.query(
      `SELECT id
       FROM driver_promo_ledger
       WHERE idempotency_key = $1`,
      [`promo_release:${attemptId}`]
    );

    if (released.rows.length > 0) {
      throw new Error('PROMO_RESERVE_ALREADY_RELEASED');
    }

    const reservedResult = await client.query(
      `SELECT driver_id, amount_cents, reference_id
       FROM driver_promo_ledger
       WHERE idempotency_key = $1`,
      [`promo_reserve:${attemptId}`]
    );

    const reservation = reservedResult.rows[0];

    if (!reservation) {
      if (amountCents === 0n) return 0n;
      throw new Error('PROMO_RESERVATION_NOT_FOUND');
    }

    if (reservation.driver_id !== driverId) {
      throw new Error('PROMO_RESERVE_DRIVER_MISMATCH');
    }

    if (reservation.reference_id !== rideId) {
      throw new Error('PROMO_RESERVE_RIDE_MISMATCH');
    }

    const reservedForRide = BigInt(reservation.amount_cents);

    if (amountCents > reservedForRide) {
      throw new Error('PROMO_CONSUME_EXCEEDS_RESERVATION');
    }

    const balance = BigInt(walletResult.rows[0].balance_cents);
    const reserved = BigInt(walletResult.rows[0].reserved_cents);

    if (amountCents > balance || reservedForRide > reserved) {
      throw new Error('PROMO_BALANCE_INVARIANT');
    }

    const newBalance = balance - amountCents;
    const newReserved = reserved - reservedForRide;

    await client.query(
      `UPDATE driver_promo_wallets
       SET balance_cents = $2,
           reserved_cents = $3,
           updated_at = NOW()
       WHERE driver_id = $1`,
      [
        driverId,
        newBalance.toString(),
        newReserved.toString(),
      ]
    );

    await client.query(
      `INSERT INTO driver_promo_ledger
        (driver_id, entry_type, amount_cents,
         balance_after_cents, reserved_delta_cents,
         reserved_after_cents, reference_type, reference_id,
         idempotency_key)
       VALUES ($1, 'consume', $2, $3, $4, $5,
               'ride', $6, $7)`,
      [
        driverId,
        (-amountCents).toString(),
        newBalance.toString(),
        (-reservedForRide).toString(),
        newReserved.toString(),
        rideId,
        `promo_consume:${attemptId}`,
      ]
    );

    return amountCents;
  }


  // Libera uma reserva promocional identificada pela oferta.
  // A transacao pertence ao chamador.
  async releaseInClient(
    client: PoolClient,
    driverId: string,
    rideId: string,
    offerId: string
  ): Promise<bigint> {
    if (!rideId || !offerId) {
      throw new Error('INVALID_PROMO_RELEASE_IDENTITY');
    }

    const walletResult = await client.query(
      `SELECT balance_cents, reserved_cents
       FROM driver_promo_wallets
       WHERE driver_id = $1
       FOR UPDATE`,
      [driverId]
    );

    const existing = await client.query(
      `SELECT driver_id
       FROM driver_promo_ledger
       WHERE idempotency_key = $1`,
      [`promo_release:${offerId}`]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].driver_id !== driverId) {
        throw new Error('PROMO_RELEASE_DRIVER_MISMATCH');
      }
      return 0n;
    }

    const consumed = await client.query(
      `SELECT id
       FROM driver_promo_ledger
       WHERE idempotency_key = $1`,
      [`promo_consume:${offerId}`]
    );

    if (consumed.rows.length > 0) {
      throw new Error('PROMO_RESERVE_ALREADY_CONSUMED');
    }

    const reservation = await client.query(
      `SELECT driver_id, amount_cents, reference_id
       FROM driver_promo_ledger
       WHERE idempotency_key = $1`,
      [`promo_reserve:${offerId}`]
    );

    if (!reservation.rows[0]) {
      return 0n;
    }

    const original = reservation.rows[0];

    if (original.driver_id !== driverId) {
      throw new Error('PROMO_RELEASE_DRIVER_MISMATCH');
    }

    if (original.reference_id !== rideId) {
      throw new Error('PROMO_RELEASE_RIDE_MISMATCH');
    }

    if (!walletResult.rows[0]) {
      throw new Error('PROMO_WALLET_NOT_FOUND');
    }

    const amount = BigInt(original.amount_cents);
    const balance = BigInt(walletResult.rows[0].balance_cents);
    const reserved = BigInt(walletResult.rows[0].reserved_cents);

    if (amount <= 0n || amount > reserved) {
      throw new Error('PROMO_RELEASE_INVARIANT');
    }

    const newReserved = reserved - amount;

    await client.query(
      `UPDATE driver_promo_wallets
       SET reserved_cents = $2, updated_at = NOW()
       WHERE driver_id = $1`,
      [driverId, newReserved.toString()]
    );

    await client.query(
      `INSERT INTO driver_promo_ledger
        (driver_id, entry_type, amount_cents,
         balance_after_cents, reserved_delta_cents,
         reserved_after_cents, reference_type, reference_id,
         idempotency_key)
       VALUES ($1, 'release', $2, $3, $4, $5,
               'ride', $6, $7)`,
      [
        driverId,
        amount.toString(),
        balance.toString(),
        (-amount).toString(),
        newReserved.toString(),
        rideId,
        `promo_release:${offerId}`
      ]
    );

    return amount;
  }

  async release(
    driverId: string,
    rideId: string
  ): Promise<bigint> {
    if (process.env.DRIVER_PERMANENT_WELCOME_ENABLED !== 'true') {
      return 0n;
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const walletResult = await client.query(
        `SELECT balance_cents, reserved_cents
         FROM driver_promo_wallets
         WHERE driver_id = $1
         FOR UPDATE`,
        [driverId]
      );

      if (!walletResult.rows[0]) {
        await client.query('COMMIT');
        return 0n;
      }

      const existing = await client.query(
        `SELECT amount_cents
         FROM driver_promo_ledger
         WHERE idempotency_key = $1`,
        [`promo_release:${rideId}`]
      );

      if (existing.rows[0]) {
        await client.query('COMMIT');
        return 0n;
      }

      // Uma reserva consumida não pode ser liberada posteriormente.
      const consumed = await client.query(
        `SELECT id
         FROM driver_promo_ledger
         WHERE idempotency_key = $1`,
        [`promo_consume:${rideId}`]
      );

      if (consumed.rows.length > 0) {
        throw new Error('PROMO_RESERVE_ALREADY_CONSUMED');
      }

      const reservation = await client.query(
        `SELECT amount_cents
         FROM driver_promo_ledger
         WHERE idempotency_key = $1
           AND driver_id = $2`,
        [`promo_reserve:${rideId}`, driverId]
      );

      if (!reservation.rows[0]) {
        await client.query('COMMIT');
        return 0n;
      }

      const amount = BigInt(reservation.rows[0].amount_cents);
      const balance = BigInt(walletResult.rows[0].balance_cents);
      const reserved = BigInt(walletResult.rows[0].reserved_cents);

      if (amount > reserved) {
        throw new Error('PROMO_RESERVE_INVARIANT');
      }

      const newReserved = reserved - amount;

      await client.query(
        `UPDATE driver_promo_wallets
         SET reserved_cents = $2, updated_at = NOW()
         WHERE driver_id = $1`,
        [driverId, newReserved.toString()]
      );

      await client.query(
        `INSERT INTO driver_promo_ledger
          (driver_id, entry_type, amount_cents,
           balance_after_cents, reserved_delta_cents,
           reserved_after_cents, reference_type, reference_id,
           idempotency_key)
         VALUES ($1, 'release', $2, $3, $4, $5,
                 'ride', $6, $7)`,
        [
          driverId,
          amount.toString(),
          balance.toString(),
          (-amount).toString(),
          newReserved.toString(),
          rideId,
          `promo_release:${rideId}`,
        ]
      );

      await client.query('COMMIT');
      return amount;
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
