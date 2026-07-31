import { describe, it, expect, beforeEach, vi } from "vitest";
import { WalletService } from '../../src/services/wallet-v2/wallet.service';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn(() => ({ query: mockQuery, release: mockRelease }));
const mockPool = { query: mockQuery, connect: mockConnect } as any;

beforeEach(() => { mockQuery.mockReset(); mockRelease.mockReset(); });

describe('WalletService', () => {
  const svc = new WalletService(mockPool);

  it('ensureWallet inserts on conflict do nothing', async () => {
    mockQuery.mockResolvedValue({});
    await svc.ensureWallet('d1');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), ['d1']);
  });

  it('getBalance returns available', async () => {
    mockQuery.mockResolvedValue({ rows: [{ balance_cents: '5000', reserved_cents: '1000' }] });
    const b = await svc.getBalance('d1');
    expect(b.available_cents).toBe(BigInt(4000));
  });

  it('creditRecharge credits balance', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // idempotency check
      .mockResolvedValueOnce({ rows: [{ balance_cents: '5000', reserved_cents: '0' }] }) // lock
      .mockResolvedValueOnce({}) // update wallet
      .mockResolvedValueOnce({ rows: [{ id: '1', created_at: '2026-07-28T10:00:00.000Z' }] }) // insert ledger
      .mockResolvedValueOnce({}); // COMMIT
    const r = await svc.creditRecharge('d1', BigInt(2000), 'rch-1');
    expect(r.already_processed).toBe(false);
    expect(r.balance_after_cents).toBe(BigInt(7000));
  });

  it('creditRecharge idempotent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: '1', balance_after_cents: '7000', reserved_after_cents: '0', created_at: '2026-07-28T10:00:00.000Z' }] }) // found
      .mockResolvedValueOnce({}); // COMMIT
    const r = await svc.creditRecharge('d1', BigInt(2000), 'rch-1');
    expect(r.already_processed).toBe(true);
  });

  it('reserve succeeds when available >= amount', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // idempotency
      .mockResolvedValueOnce({ rows: [{ balance_cents: '5000', reserved_cents: '1000' }] }) // lock
      .mockResolvedValueOnce({}) // update
      .mockResolvedValueOnce({ rows: [{ id: '2', created_at: '2026-07-28T10:00:00.000Z' }] }) // ledger
      .mockResolvedValueOnce({}); // COMMIT
    const r = await svc.reserve('d1', BigInt(3000), 'ride-1');
    expect(r.reserved_after_cents).toBe(BigInt(4000));
  });

  it('reserve fails when insufficient', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // idempotency
      .mockResolvedValueOnce({ rows: [{ balance_cents: '1000', reserved_cents: '800' }] }) // lock
      .mockResolvedValueOnce({}); // ROLLBACK
    await expect(svc.reserve('d1', BigInt(500), 'ride-2')).rejects.toThrow('INSUFFICIENT_BALANCE');
  });

  it('releaseReserve decreases reserved', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ balance_cents: '5000', reserved_cents: '2000' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: '3', created_at: '2026-07-28T10:00:00.000Z' }] })
      .mockResolvedValueOnce({});
    const r = await svc.releaseReserve('d1', BigInt(2000), 'ride-1');
    expect(r.reserved_after_cents).toBe(BigInt(0));
  });

  it('debitFee debits and releases reserve', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ balance_cents: '5000', reserved_cents: '540' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: '4', created_at: '2026-07-28T10:00:00.000Z' }] })
      .mockResolvedValueOnce({});
    const r = await svc.debitFee('d1', BigInt(540), BigInt(540), 'ride-1');
    expect(r.balance_after_cents).toBe(BigInt(4460));
    expect(r.reserved_after_cents).toBe(BigInt(0));
  });

  it('debitFee idempotent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '4', driver_id: 'd1', balance_delta_cents: '-540', reserved_delta_cents: '-540', balance_after_cents: '4460', reserved_after_cents: '0', created_at: '2026-07-28T10:00:00.000Z' }] })
      .mockResolvedValueOnce({});
    const r = await svc.debitFee('d1', BigInt(540), BigInt(540), 'ride-1');
    expect(r.already_processed).toBe(true);
  });

  it('creditRechargeBonus credits bonus', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // idempotency check
      .mockResolvedValueOnce({ rows: [{ balance_cents: '7000', reserved_cents: '0' }] }) // lock
      .mockResolvedValueOnce({}) // update wallet
      .mockResolvedValueOnce({ rows: [{ id: '5', created_at: '2026-07-28T10:00:00.000Z' }] }) // insert ledger
      .mockResolvedValueOnce({}); // COMMIT
    const r = await svc.creditRechargeBonus('d1', BigInt(200), 'rch-1');
    expect(r.already_processed).toBe(false);
    expect(r.balance_after_cents).toBe(BigInt(7200));
  });

  it('creditRechargeBonus is idempotent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: '5', balance_after_cents: '7200', reserved_after_cents: '0', created_at: '2026-07-28T10:00:00.000Z' }] }) // found
      .mockResolvedValueOnce({}); // COMMIT
    const r = await svc.creditRechargeBonus('d1', BigInt(200), 'rch-1');
    expect(r.already_processed).toBe(true);
  });

  it('creditRechargeBonus uses correct entry_type and idempotency_key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // idempotency
      .mockResolvedValueOnce({ rows: [{ balance_cents: '5000', reserved_cents: '0' }] }) // lock
      .mockResolvedValueOnce({}) // update
      .mockResolvedValueOnce({ rows: [{ id: '6', created_at: '2026-07-28T10:00:00.000Z' }] }) // ledger
      .mockResolvedValueOnce({}); // COMMIT
    await svc.creditRechargeBonus('d1', BigInt(500), 'rch-2');
    // Verify ledger insert call has correct params
    const ledgerCall = mockQuery.mock.calls.find((c: any) => c[0]?.includes?.('INSERT INTO wallet_ledger'));
    expect(ledgerCall).toBeDefined();
    const params = ledgerCall![1];
    expect(params[1]).toBe('recharge_bonus'); // entry_type
    expect(params[6]).toBe('recharge'); // reference_type
    expect(params[7]).toBe('rch-2'); // reference_id
    expect(params[8]).toBe('system'); // actor_type
    expect(params[9]).toBe('bonus_engine'); // actor_id
    expect(params[11]).toBe('recharge_bonus:rch-2'); // idempotency_key
  });
});
