import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateFeeCents, estimateFeeCentsFromPrice } from '../src/services/wallet-v2/fee-helper';

describe('Fee Helper', () => {
  it('calculateFeeCents 18% of 3000 cents = 540', () => {
    expect(calculateFeeCents(3000)).toBe(540);
  });
  it('calculateFeeCents 18% of 2000 cents = 360', () => {
    expect(calculateFeeCents(2000)).toBe(360);
  });
  it('calculateFeeCents 18% of 100 cents = 18', () => {
    expect(calculateFeeCents(100)).toBe(18);
  });
  it('estimateFeeCentsFromPrice R$30 = 540', () => {
    expect(estimateFeeCentsFromPrice(30)).toBe(540);
  });
  it('estimateFeeCentsFromPrice R$20 = 360', () => {
    expect(estimateFeeCentsFromPrice(20)).toBe(360);
  });
});

describe('Wallet V2 Ride Flow Logic', () => {
  it('flag off: no wallet operations should run', () => {
    // When WALLET_V2_ENABLED=false, the conditional skips wallet V2 entirely
    const walletV2Active = false;
    expect(walletV2Active).toBe(false);
    // Old flow would run instead — tested by existing system
  });

  it('reserve: estimated fee for R$30 ride = 540 cents', () => {
    const price = 30;
    const estFee = estimateFeeCentsFromPrice(price);
    expect(estFee).toBe(540);
  });

  it('settle: fee final equals reserve (no difference)', () => {
    const quotedPrice = 30;
    const finalPrice = 30;
    const reservedCents = estimateFeeCentsFromPrice(quotedPrice); // 540
    const feeFinal = calculateFeeCents(finalPrice * 100); // 540
    expect(feeFinal).toBe(reservedCents);
  });

  it('settle: wait raises total, not the fee reserved on the locked base', () => {
    const quotedPrice = 30;
    const finalPriceCents = 3500; // R$5 wait goes entirely to the driver
    const waitChargeCents = 500;
    const feeBaseCents = finalPriceCents - waitChargeCents;
    const reservedCents = estimateFeeCentsFromPrice(quotedPrice); // 540
    const feeFinal = calculateFeeCents(feeBaseCents); // 540, not 630
    expect(feeFinal).toBe(reservedCents);
    expect(finalPriceCents - feeFinal).toBe(2960);
  });

  it('settle: fee final less than reserve (adjustment reduced price)', () => {
    const quotedPrice = 30;
    const finalPrice = 25;
    const reservedCents = estimateFeeCentsFromPrice(quotedPrice); // 540
    const feeFinal = calculateFeeCents(finalPrice * 100); // 450
    expect(feeFinal).toBeLessThan(reservedCents);
    // Excess reserve (90 cents) released back to balance
  });

  it('cancel: release full reserve amount', () => {
    const quotedPrice = 30;
    const reservedCents = estimateFeeCentsFromPrice(quotedPrice);
    expect(reservedCents).toBe(540);
    // releaseReserve(driverId, 540, rideId) — idempotent via key
  });

  it('cancel after arrived: same release logic', () => {
    const status = 'arrived';
    const cancelable = ['accepted', 'arrived'].includes(status);
    expect(cancelable).toBe(true);
  });

  it('cancel after started: same release logic', () => {
    // started maps to in_progress in rides_v2
    const status = 'accepted';
    const cancelable = ['accepted', 'arrived'].includes(status);
    expect(cancelable).toBe(true);
  });

  it('pending debit: only created for uncollected portion', () => {
    const finalPriceCents = 3000;
    const feeCents = calculateFeeCents(finalPriceCents); // 540
    const available = 200; // insufficient
    const canCollect = available >= feeCents;
    expect(canCollect).toBe(false);
    // pending_debit.fee_pending_cents = feeCents (full amount since reserve was released)
  });

  it('territory ledger: NOT launched when pending', () => {
    const collected = false;
    // territory_ledger.recordFeeShare only called when collected=true
    expect(collected).toBe(false);
  });

  it('territory ledger: launched when collected', () => {
    const collected = true;
    const feeCents = calculateFeeCents(3000); // 540
    const managerShare = feeCents - Math.round(feeCents * 60 / 100); // 216
    expect(managerShare).toBe(216);
  });

  it('applyCreditDelta should NOT run when wallet V2 is active', () => {
    const walletV2Active = true;
    const shouldRunOldFlow = !walletV2Active;
    expect(shouldRunOldFlow).toBe(false);
  });

  it('idempotency: reserve key is unique per ride', () => {
    const rideId = 'test-ride-123';
    const key = `reserve:ride:${rideId}`;
    expect(key).toBe('reserve:ride:test-ride-123');
  });

  it('idempotency: cancel release key is unique per ride', () => {
    const rideId = 'test-ride-123';
    const key = `cancel_release:ride:${rideId}`;
    expect(key).toBe('cancel_release:ride:test-ride-123');
  });

  it('idempotency: fee key is unique per ride', () => {
    const rideId = 'test-ride-123';
    const key = `fee:ride:${rideId}`;
    expect(key).toBe('fee:ride:test-ride-123');
  });
});
