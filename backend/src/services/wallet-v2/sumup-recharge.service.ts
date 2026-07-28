import { pool } from '../../db';
import { PoolClient } from 'pg';
import { getSumUpCheckout } from '../sumup-service';
import { WalletService } from './wallet.service';
import { FeeSplitService } from './fee-split.service';
import { TerritoryLedgerService } from './territory-ledger.service';
import { PendingDebitService } from './pending-debit.service';
import { AnnualIncentiveLedgerService } from '../finance/annual-incentive-ledger.service';
import { AnnualIncentiveShadowService } from '../finance/annual-incentive-shadow.service';

const walletService = new WalletService(pool);
const feeSplitService = new FeeSplitService(pool);
const territoryLedgerService = new TerritoryLedgerService(pool);
const pendingDebitService = new PendingDebitService(pool);
const incentiveLedgerService = new AnnualIncentiveLedgerService(pool);
const shadowService = new AnnualIncentiveShadowService(pool, walletService, incentiveLedgerService);

export type SumUpRechargeReconcileResult = {
  recharge_id: string;
  previous_status: string;
  checkout_status: string | null;
  final_status: 'confirmed' | 'expired' | 'pending' | 'not_found' | 'ignored';
  credited: boolean;
};

async function applyRechargeCreditAtomic(
  recharge: { id: string; driver_id: string; amount_cents: number | string },
  client?: PoolClient
): Promise<void> {
  const amountCents = Number(recharge.amount_cents);
  await walletService.ensureWallet(recharge.driver_id, client);
  await walletService.creditRecharge(recharge.driver_id, BigInt(amountCents), recharge.id, client);
}

async function applyRechargePostConfirmation(recharge: { id: string; driver_id: string; amount_cents: number | string }): Promise<void> {
  const amountCents = Number(recharge.amount_cents);
  try {
    const frPercent = parseInt(process.env.FAMILY_RETURN_PERCENT || '0', 10);
    const frFlag = await pool.query("SELECT enabled FROM feature_flags WHERE key = 'FAMILY_RETURN_ENABLED' LIMIT 1");
    if (frFlag.rows[0]?.enabled === true && frPercent > 0) {
      const idemKey = `family_return_accrual:${recharge.id}`;
      const exists = await pool.query('SELECT id FROM family_return_accruals WHERE idempotency_key = $1', [idemKey]);
      if (!exists.rows[0]) {
        const accrued = Math.floor(amountCents * frPercent / 100);
        await pool.query(
          `INSERT INTO family_return_accruals (driver_id, recharge_id, source_amount_cents, accrued_amount_cents, percent, status, idempotency_key) VALUES ($1, $2::uuid, $3, $4, $5, 'accrued', $6)`,
          [recharge.driver_id, recharge.id, amountCents, accrued, frPercent, idemKey]
        );
      }
    }
  } catch (frErr: any) {
    console.error('[SUMUP_RECONCILE] Family return error:', frErr.message);
  }

  try {
    // Shadow service handles flag evaluation internally:
    // - flags off → debit only, no accrual
    // - flags on → debit + accrual atomically
    // - SHADOW=true WRITE=false → throws before any mutation
    await pendingDebitService.resolveOnRecharge(recharge.driver_id, shadowService, feeSplitService, territoryLedgerService);
  } catch (pendErr: any) {
    console.error('[SUMUP_RECONCILE] resolveOnRecharge error:', pendErr.message);
  }
}

export async function reconcileSumUpRechargeById(rechargeId: string, expectedDriverId?: string): Promise<SumUpRechargeReconcileResult> {
  const params = expectedDriverId ? [rechargeId, expectedDriverId] : [rechargeId];
  const whereDriver = expectedDriverId ? ' AND driver_id = $2' : '';
  const existing = await pool.query(
    `SELECT id, driver_id, amount_cents, status, payment_provider, external_id FROM wallet_recharges WHERE id = $1${whereDriver} LIMIT 1`,
    params
  );

  const row = existing.rows[0];
  if (!row) {
    return {
      recharge_id: rechargeId,
      previous_status: 'not_found',
      checkout_status: null,
      final_status: 'not_found',
      credited: false,
    };
  }

  if (row.payment_provider !== 'sumup') {
    return {
      recharge_id: row.id,
      previous_status: String(row.status || ''),
      checkout_status: null,
      final_status: 'ignored',
      credited: false,
    };
  }

  if (row.status !== 'pending' || !row.external_id) {
    return {
      recharge_id: row.id,
      previous_status: String(row.status || ''),
      checkout_status: null,
      final_status: row.status === 'confirmed' ? 'confirmed' : row.status === 'expired' ? 'expired' : 'pending',
      credited: false,
    };
  }

  const checkout = await getSumUpCheckout(row.external_id);
  const checkoutStatus = String(checkout.status || '').toUpperCase();

  if (checkoutStatus === 'PAID') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query(
        'SELECT id, driver_id, amount_cents, status, payment_provider, external_id FROM wallet_recharges WHERE id = $1 FOR UPDATE',
        [row.id]
      );
      const lockedRow = locked.rows[0];

      if (!lockedRow) {
        await client.query('COMMIT');
      return {
          recharge_id: rechargeId,
          previous_status: 'not_found',
          checkout_status: null,
          final_status: 'not_found',
          credited: false,
        };
      }

      if (lockedRow.payment_provider !== 'sumup') {
        await client.query('COMMIT');
        return {
          recharge_id: lockedRow.id,
          previous_status: String(lockedRow.status || ''),
          checkout_status: null,
          final_status: 'ignored',
          credited: false,
        };
      }

      if (lockedRow.status !== 'pending' || !lockedRow.external_id) {
        await client.query('COMMIT');
        return {
          recharge_id: lockedRow.id,
          previous_status: String(lockedRow.status || ''),
          checkout_status: null,
          final_status: lockedRow.status === 'confirmed' ? 'confirmed' : lockedRow.status === 'expired' ? 'expired' : 'pending',
          credited: false,
        };
      }

      await applyRechargeCreditAtomic(lockedRow, client);

      await client.query(
        "UPDATE wallet_recharges SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending'",
        [lockedRow.id]
      );

      await client.query('COMMIT');
      await applyRechargePostConfirmation(lockedRow);

      return {
        recharge_id: lockedRow.id,
        previous_status: 'pending',
        checkout_status: checkoutStatus,
        final_status: 'confirmed',
        credited: true,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  if (checkoutStatus === 'FAILED' || checkoutStatus === 'EXPIRED' || checkoutStatus === 'CANCELLED') {
    await pool.query(
      "UPDATE wallet_recharges SET status = 'expired', updated_at = NOW() WHERE id = $1 AND status = 'pending'",
      [row.id]
    );

    return {
      recharge_id: row.id,
      previous_status: 'pending',
      checkout_status: checkoutStatus,
      final_status: 'expired',
      credited: false,
    };
  }

  return {
    recharge_id: row.id,
    previous_status: 'pending',
    checkout_status: checkoutStatus || null,
    final_status: 'pending',
    credited: false,
  };
}

export async function reconcileSumUpRechargeByExternalId(externalId: string): Promise<SumUpRechargeReconcileResult> {
  const found = await pool.query(
    "SELECT id FROM wallet_recharges WHERE external_id = $1 AND payment_provider = 'sumup' ORDER BY created_at DESC LIMIT 1",
    [externalId]
  );
  const rechargeId = found.rows[0]?.id;
  if (!rechargeId) {
    return {
      recharge_id: '',
      previous_status: 'not_found',
      checkout_status: null,
      final_status: 'not_found',
      credited: false,
    };
  }
  return reconcileSumUpRechargeById(rechargeId);
}

export async function reconcilePendingSumUpRecharges(limit = 50, minAgeMinutes = 1): Promise<{ scanned: number; confirmed: number; expired: number; pending: number; errors: number; results: SumUpRechargeReconcileResult[] }> {
  const cappedLimit = Math.max(1, Math.min(limit, 200));
  const minAge = Math.max(0, Math.min(minAgeMinutes, 1440));

  const pending = await pool.query(
    "SELECT id FROM wallet_recharges WHERE payment_provider='sumup' AND status='pending' AND external_id IS NOT NULL AND created_at <= NOW() - ($1 * INTERVAL '1 minute') ORDER BY created_at ASC LIMIT $2",
    [minAge, cappedLimit]
  );

  const results: SumUpRechargeReconcileResult[] = [];
  let confirmed = 0;
  let expired = 0;
  let pendingCount = 0;
  let errors = 0;

  for (const row of pending.rows) {
    try {
      const result = await reconcileSumUpRechargeById(row.id);
      results.push(result);
      if (result.final_status === 'confirmed') confirmed += 1;
      else if (result.final_status === 'expired') expired += 1;
      else if (result.final_status === 'pending') pendingCount += 1;
    } catch (err: any) {
      errors += 1;
      console.error(`[SUMUP_RECONCILE] Failed recharge=${row.id}:`, err.message);
    }
  }

  return {
    scanned: pending.rows.length,
    confirmed,
    expired,
    pending: pendingCount,
    errors,
    results,
  };
}
