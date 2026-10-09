import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  qualify: vi.fn(),
}));

vi.mock('../../src/db', () => ({
  pool: {
    query: mocks.query,
    connect: mocks.connect,
  },
}));

vi.mock('../../src/services/wallet-v2/referral-qualification.service', () => ({
  qualifyReferralForRecharge: mocks.qualify,
}));

import {
  recoverReferralQualification,
  recoverDriverReferralQualifications,
} from '../../src/services/wallet-v2/referral-recovery.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.connect.mockResolvedValue({
    query: mocks.query,
    release: mocks.release,
  });
});

describe('KAVIAR — recuperação de indicações', () => {
  it('confirma transação quando qualifica', async () => {
    mocks.qualify.mockResolvedValueOnce(true);

    expect(await recoverReferralQualification('r1')).toBe(true);

    expect(mocks.query).toHaveBeenCalledWith('BEGIN');
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('confirma sem duplicar quando já foi processada', async () => {
    mocks.qualify.mockResolvedValueOnce(false);

    expect(await recoverReferralQualification('r1')).toBe(false);
    expect(mocks.query).toHaveBeenCalledWith('COMMIT');
  });

  it('executa rollback quando qualificação falha', async () => {
    mocks.qualify.mockRejectedValueOnce(new Error('DB_ERROR'));

    await expect(
      recoverReferralQualification('r1')
    ).rejects.toThrow('DB_ERROR');

    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('não processa recargas inexistentes', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    expect(await recoverDriverReferralQualifications('d1')).toBe(0);
    expect(mocks.qualify).not.toHaveBeenCalled();
  });

  it('para após primeira qualificação', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ id: 'r1' }, { id: 'r2' }],
    });
    mocks.qualify.mockResolvedValueOnce(true);

    expect(await recoverDriverReferralQualifications('d1')).toBe(1);
    expect(mocks.qualify).toHaveBeenCalledTimes(1);
  });
});
