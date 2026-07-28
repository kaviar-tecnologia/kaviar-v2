import { Pool, PoolClient } from 'pg';

type Queryable = Pick<PoolClient, 'query'>;

export interface WalletBalance {
  balance_cents: bigint;
  reserved_cents: bigint;
  available_cents: bigint;
}

export interface LedgerEntry {
  id: bigint;
  balance_after_cents: bigint;
  reserved_after_cents: bigint;
  already_processed: boolean;
  createdAt: Date;
}

/** Extended result for InClient callers that need full context for downstream integration */
export interface DebitFeeResult extends LedgerEntry {
  driverId: string;
  entryType: 'fee_debit';
  amountCents: bigint;
  reservedDeltaCents: bigint;
  balanceBeforeCents: bigint;
  reservedBeforeCents: bigint;
  idempotencyKey: string;
  rideId: string;
}

export interface DebitPendingResult extends LedgerEntry {
  driverId: string;
  entryType: 'pending_resolve';
  amountCents: bigint;
  balanceBeforeCents: bigint;
  reservedBeforeCents: bigint;
  idempotencyKey: string;
  pendingDebitId: string;
}

export class WalletService {
  constructor(private pool: Pool) {}

  async ensureWallet(driverId: string, client?: PoolClient): Promise<void> {
    const db = this.getDb(client);
    await db.query(
      `INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at)
       VALUES ($1, 0, 0, NOW()) ON CONFLICT (driver_id) DO NOTHING`,
      [driverId]
    );
  }

  async getBalance(driverId: string): Promise<WalletBalance> {
    const r = await this.pool.query(
      'SELECT balance_cents, reserved_cents FROM driver_wallets WHERE driver_id = $1',
      [driverId]
    );
    if (!r.rows[0]) return { balance_cents: BigInt(0), reserved_cents: BigInt(0), available_cents: BigInt(0) };
    const bal = BigInt(r.rows[0].balance_cents);
    const res = BigInt(r.rows[0].reserved_cents);
    return { balance_cents: bal, reserved_cents: res, available_cents: bal - res };
  }

  async creditRecharge(driverId: string, amountCents: bigint, rechargeId: string, client?: PoolClient): Promise<LedgerEntry> {
    if (client) {
      return this.creditRechargeInClient(client, driverId, amountCents, rechargeId);
    }

    return this.withTransaction(async (client) => {
      return this.creditRechargeInClient(client, driverId, amountCents, rechargeId);
    });
  }

  async creditRechargeBonus(driverId: string, bonusCents: bigint, rechargeId: string): Promise<LedgerEntry> {
    return this.withTransaction(async (client) => {
      const key = `recharge_bonus:${rechargeId}`;
      const existing = await this.checkIdempotency(client, key);
      if (existing) return existing;

      const wallet = await this.lockWallet(client, driverId);
      const newBalance = wallet.balance_cents + bonusCents;

      await client.query(
        'UPDATE driver_wallets SET balance_cents = $2, updated_at = NOW() WHERE driver_id = $1',
        [driverId, newBalance.toString()]
      );

      return this.insertLedger(client, {
        driverId, entryType: 'recharge_bonus', balanceDelta: bonusCents, reservedDelta: BigInt(0),
        balanceAfter: newBalance, reservedAfter: wallet.reserved_cents,
        referenceType: 'recharge', referenceId: rechargeId,
        actorType: 'system', actorId: 'bonus_engine', reason: `recharge_bonus:${rechargeId}`, key,
      });
    });
  }

  async reserve(driverId: string, amountCents: bigint, rideId: string): Promise<LedgerEntry> {
    return this.withTransaction(async (client) => {
      const key = `reserve:ride:${rideId}`;
      const existing = await this.checkIdempotency(client, key);
      if (existing) return existing;

      const wallet = await this.lockWallet(client, driverId);
      const available = wallet.balance_cents - wallet.reserved_cents;
      if (available < amountCents) throw new Error('INSUFFICIENT_BALANCE');

      const newReserved = wallet.reserved_cents + amountCents;
      await client.query(
        'UPDATE driver_wallets SET reserved_cents = $2, updated_at = NOW() WHERE driver_id = $1',
        [driverId, newReserved.toString()]
      );

      return this.insertLedger(client, {
        driverId, entryType: 'reserve', balanceDelta: BigInt(0), reservedDelta: amountCents,
        balanceAfter: wallet.balance_cents, reservedAfter: newReserved,
        referenceType: 'ride', referenceId: rideId,
        actorType: 'system', actorId: 'dispatcher', reason: `reserve:ride:${rideId}`, key,
      });
    });
  }

  async releaseReserve(driverId: string, amountCents: bigint, rideId: string): Promise<LedgerEntry> {
    return this.withTransaction(async (client) => {
      const key = `cancel_release:ride:${rideId}`;
      const existing = await this.checkIdempotency(client, key);
      if (existing) return existing;

      const wallet = await this.lockWallet(client, driverId);
      const newReserved = wallet.reserved_cents - amountCents;

      await client.query(
        'UPDATE driver_wallets SET reserved_cents = $2, updated_at = NOW() WHERE driver_id = $1',
        [driverId, newReserved < BigInt(0) ? '0' : newReserved.toString()]
      );

      return this.insertLedger(client, {
        driverId, entryType: 'cancel_release', balanceDelta: BigInt(0), reservedDelta: -amountCents,
        balanceAfter: wallet.balance_cents, reservedAfter: newReserved < BigInt(0) ? BigInt(0) : newReserved,
        referenceType: 'ride', referenceId: rideId,
        actorType: 'system', actorId: 'ride_cancel', reason: `cancel_release:ride:${rideId}`, key,
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // debitFee — Public wrapper (manages own transaction)
  // ═══════════════════════════════════════════════════════════════════

  async debitFee(driverId: string, feeCents: bigint, reservedCents: bigint, rideId: string): Promise<LedgerEntry> {
    return this.withTransaction(async (client) => {
      return this.debitFeeInClient(client, driverId, feeCents, reservedCents, rideId);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // debitFeeInClient — Uses caller's transaction (no BEGIN/COMMIT/ROLLBACK/release)
  // ═══════════════════════════════════════════════════════════════════

  async debitFeeInClient(client: PoolClient, driverId: string, feeCents: bigint, reservedCents: bigint, rideId: string): Promise<DebitFeeResult> {
    const key = `fee:ride:${rideId}`;
    const existing = await this.checkIdempotencyFull(client, key);
    if (existing) {
      // Verify economic consistency — same key must have same financial data
      this.assertDebitFeeConsistency(existing, driverId, feeCents, reservedCents);
      return {
        id: existing.id,
        balance_after_cents: existing.balance_after_cents,
        reserved_after_cents: existing.reserved_after_cents,
        already_processed: true,
        createdAt: existing.createdAt,
        driverId,
        entryType: 'fee_debit',
        amountCents: feeCents,
        reservedDeltaCents: reservedCents,
        balanceBeforeCents: existing.balance_after_cents + feeCents,
        reservedBeforeCents: existing.reserved_after_cents + reservedCents,
        idempotencyKey: key,
        rideId,
      };
    }

    const wallet = await this.lockWallet(client, driverId);
    const newBalance = wallet.balance_cents - feeCents;
    const newReserved = wallet.reserved_cents - reservedCents;

    if (newBalance < BigInt(0)) throw new Error('INSUFFICIENT_BALANCE_FOR_FEE');

    const clampedReserved = newReserved < BigInt(0) ? BigInt(0) : newReserved;

    await client.query(
      'UPDATE driver_wallets SET balance_cents = $2, reserved_cents = $3, updated_at = NOW() WHERE driver_id = $1',
      [driverId, newBalance.toString(), clampedReserved.toString()]
    );

    const ledger = await this.insertLedger(client, {
      driverId, entryType: 'fee_debit', balanceDelta: -feeCents, reservedDelta: -reservedCents,
      balanceAfter: newBalance, reservedAfter: clampedReserved,
      referenceType: 'ride', referenceId: rideId,
      actorType: 'system', actorId: 'settle', reason: `fee:ride:${rideId}`, key,
    });

    return {
      ...ledger,
      driverId,
      entryType: 'fee_debit',
      amountCents: feeCents,
      reservedDeltaCents: reservedCents,
      balanceBeforeCents: wallet.balance_cents,
      reservedBeforeCents: wallet.reserved_cents,
      idempotencyKey: key,
      rideId,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // debitPending — Public wrapper (manages own transaction)
  // ═══════════════════════════════════════════════════════════════════

  async debitPending(driverId: string, feeCents: bigint, pendingDebitId: string): Promise<LedgerEntry> {
    return this.withTransaction(async (client) => {
      return this.debitPendingInClient(client, driverId, feeCents, pendingDebitId);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // debitPendingInClient — Uses caller's transaction
  // ═══════════════════════════════════════════════════════════════════

  async debitPendingInClient(client: PoolClient, driverId: string, feeCents: bigint, pendingDebitId: string): Promise<DebitPendingResult> {
    const key = `pending_resolve:${pendingDebitId}`;
    const existing = await this.checkIdempotencyFull(client, key);
    if (existing) {
      // Verify economic consistency
      this.assertDebitPendingConsistency(existing, driverId, feeCents);
      return {
        id: existing.id,
        balance_after_cents: existing.balance_after_cents,
        reserved_after_cents: existing.reserved_after_cents,
        already_processed: true,
        createdAt: existing.createdAt,
        driverId,
        entryType: 'pending_resolve',
        amountCents: feeCents,
        balanceBeforeCents: existing.balance_after_cents + feeCents,
        reservedBeforeCents: existing.reserved_after_cents,
        idempotencyKey: key,
        pendingDebitId,
      };
    }

    const wallet = await this.lockWallet(client, driverId);
    if (wallet.balance_cents - wallet.reserved_cents < feeCents) throw new Error('INSUFFICIENT_BALANCE_FOR_PENDING');

    const newBalance = wallet.balance_cents - feeCents;
    await client.query(
      'UPDATE driver_wallets SET balance_cents = $2, updated_at = NOW() WHERE driver_id = $1',
      [driverId, newBalance.toString()]
    );

    const ledger = await this.insertLedger(client, {
      driverId, entryType: 'pending_resolve', balanceDelta: -feeCents, reservedDelta: BigInt(0),
      balanceAfter: newBalance, reservedAfter: wallet.reserved_cents,
      referenceType: 'pending_debit', referenceId: pendingDebitId,
      actorType: 'system', actorId: 'pending_resolver', reason: `pending_resolve:${pendingDebitId}`, key,
    });

    return {
      ...ledger,
      driverId,
      entryType: 'pending_resolve',
      amountCents: feeCents,
      balanceBeforeCents: wallet.balance_cents,
      reservedBeforeCents: wallet.reserved_cents,
      idempotencyKey: key,
      pendingDebitId,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════════

  private async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private getDb(client?: PoolClient): Queryable {
    return client || this.pool;
  }

  private async creditRechargeInClient(client: PoolClient, driverId: string, amountCents: bigint, rechargeId: string): Promise<LedgerEntry> {
    const key = `recharge:${rechargeId}`;
    const existing = await this.checkIdempotency(client, key);
    if (existing) return existing;

    const wallet = await this.lockWallet(client, driverId);
    const newBalance = wallet.balance_cents + amountCents;

    await client.query(
      'UPDATE driver_wallets SET balance_cents = $2, updated_at = NOW() WHERE driver_id = $1',
      [driverId, newBalance.toString()]
    );

    return this.insertLedger(client, {
      driverId, entryType: 'recharge', balanceDelta: amountCents, reservedDelta: BigInt(0),
      balanceAfter: newBalance, reservedAfter: wallet.reserved_cents,
      referenceType: 'recharge', referenceId: rechargeId,
      actorType: 'webhook', actorId: 'legacy_payment', reason: `recharge:${rechargeId}`, key,
    });
  }

  private async lockWallet(client: PoolClient, driverId: string) {
    const r = await client.query(
      'SELECT balance_cents, reserved_cents FROM driver_wallets WHERE driver_id = $1 FOR UPDATE',
      [driverId]
    );
    if (!r.rows[0]) throw new Error('WALLET_NOT_FOUND');
    return { balance_cents: BigInt(r.rows[0].balance_cents), reserved_cents: BigInt(r.rows[0].reserved_cents) };
  }

  private async checkIdempotency(client: PoolClient, key: string): Promise<LedgerEntry | null> {
    const r = await client.query(
      'SELECT id, balance_after_cents, reserved_after_cents, created_at FROM wallet_ledger WHERE idempotency_key = $1',
      [key]
    );
    if (r.rows[0]) return { id: BigInt(r.rows[0].id), balance_after_cents: BigInt(r.rows[0].balance_after_cents), reserved_after_cents: BigInt(r.rows[0].reserved_after_cents), already_processed: true, createdAt: new Date(r.rows[0].created_at) };
    return null;
  }

  /** Full idempotency check returning driver_id and balance_delta for conflict detection */
  private async checkIdempotencyFull(client: PoolClient, key: string): Promise<{
    id: bigint;
    balance_after_cents: bigint;
    reserved_after_cents: bigint;
    driver_id: string;
    balance_delta_cents: bigint;
    reserved_delta_cents: bigint;
    createdAt: Date;
  } | null> {
    const r = await client.query(
      'SELECT id, driver_id, balance_delta_cents, reserved_delta_cents, balance_after_cents, reserved_after_cents, created_at FROM wallet_ledger WHERE idempotency_key = $1',
      [key]
    );
    if (r.rows[0]) {
      return {
        id: BigInt(r.rows[0].id),
        driver_id: r.rows[0].driver_id,
        balance_delta_cents: BigInt(r.rows[0].balance_delta_cents),
        reserved_delta_cents: BigInt(r.rows[0].reserved_delta_cents),
        balance_after_cents: BigInt(r.rows[0].balance_after_cents),
        reserved_after_cents: BigInt(r.rows[0].reserved_after_cents),
        createdAt: new Date(r.rows[0].created_at),
      };
    }
    return null;
  }

  private assertDebitFeeConsistency(
    existing: { driver_id: string; balance_delta_cents: bigint; reserved_delta_cents: bigint },
    driverId: string,
    feeCents: bigint,
    reservedCents: bigint,
  ): void {
    const mismatches: string[] = [];
    if (existing.driver_id !== driverId) mismatches.push('driver_id');
    if (existing.balance_delta_cents !== -feeCents) mismatches.push('amount_cents');
    if (existing.reserved_delta_cents !== -reservedCents) mismatches.push('reserved_cents');
    if (mismatches.length > 0) {
      throw new Error(`WALLET_LEDGER_IDEMPOTENCY_CONFLICT: fields differ: ${mismatches.join(', ')}`);
    }
  }

  private assertDebitPendingConsistency(
    existing: { driver_id: string; balance_delta_cents: bigint },
    driverId: string,
    feeCents: bigint,
  ): void {
    const mismatches: string[] = [];
    if (existing.driver_id !== driverId) mismatches.push('driver_id');
    if (existing.balance_delta_cents !== -feeCents) mismatches.push('amount_cents');
    if (mismatches.length > 0) {
      throw new Error(`WALLET_LEDGER_IDEMPOTENCY_CONFLICT: fields differ: ${mismatches.join(', ')}`);
    }
  }

  private async insertLedger(client: PoolClient, p: { driverId: string; entryType: string; balanceDelta: bigint; reservedDelta: bigint; balanceAfter: bigint; reservedAfter: bigint; referenceType: string; referenceId: string; actorType: string; actorId: string; reason: string; key: string }): Promise<LedgerEntry> {
    const r = await client.query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, balance_delta_cents, reserved_delta_cents, balance_after_cents, reserved_after_cents, reference_type, reference_id, actor_type, actor_id, reason, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, created_at`,
      [p.driverId, p.entryType, p.balanceDelta.toString(), p.reservedDelta.toString(), p.balanceAfter.toString(), p.reservedAfter.toString(), p.referenceType, p.referenceId, p.actorType, p.actorId, p.reason, p.key]
    );
    return { id: BigInt(r.rows[0].id), balance_after_cents: p.balanceAfter, reserved_after_cents: p.reservedAfter, already_processed: false, createdAt: new Date(r.rows[0].created_at) };
  }
}
