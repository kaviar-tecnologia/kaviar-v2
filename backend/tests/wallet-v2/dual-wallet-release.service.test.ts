import { describe, expect, it, vi } from 'vitest';

import { DualWalletReservationService }
  from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('KAVIAR Incentivos — liberacao transacional', () => {
  function setup(options: {
    promoError?: boolean;
    cashError?: boolean;
    alreadyReleased?: boolean;
  } = {}) {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const releaseConnection = vi.fn();

    const client = {
      query,
      release: releaseConnection
    };

    const pool = {
      connect: vi.fn().mockResolvedValue(client)
    };

    const promoRelease = vi.fn();

    if (options.promoError) {
      promoRelease.mockRejectedValue(
        new Error('PROMO_RELEASE_FAILURE')
      );
    } else {
      promoRelease.mockResolvedValue(
        options.alreadyReleased ? 0n : 300n
      );
    }

    const cashRelease = vi.fn();

    if (options.cashError) {
      cashRelease.mockRejectedValue(
        new Error('CASH_RELEASE_FAILURE')
      );
    } else {
      cashRelease.mockResolvedValue(
        options.alreadyReleased ? 0n : 200n
      );
    }

    const service = new DualWalletReservationService(
      pool as any,
      { releaseOfferReserveInClient: cashRelease } as any,
      { releaseInClient: promoRelease } as any
    );

    return {
      service,
      pool,
      client,
      query,
      releaseConnection,
      promoRelease,
      cashRelease
    };
  }

  it('libera ambas as carteiras na mesma transacao', async () => {
    const ctx = setup();

    const result = await ctx.service.release(
      'driver-a', 'ride-100', 'offer-a'
    );

    expect(result).toEqual({
      promoReservedCents: 300n,
      cashReservedCents: 200n
    });

    expect(ctx.query).toHaveBeenCalledWith('BEGIN');

    expect(ctx.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      ['dual-wallet-reserve:ride-100']
    );

    expect(ctx.promoRelease).toHaveBeenCalledWith(
      ctx.client, 'driver-a', 'ride-100', 'offer-a'
    );

    expect(ctx.cashRelease).toHaveBeenCalledWith(
      ctx.client, 'driver-a', 'ride-100', 'offer-a'
    );

    expect(ctx.query).toHaveBeenCalledWith('COMMIT');
    expect(ctx.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(ctx.releaseConnection).toHaveBeenCalledOnce();
  });

  it('desfaz tudo quando a carteira financeira falha', async () => {
    const ctx = setup({ cashError: true });

    await expect(
      ctx.service.release('driver-a', 'ride-100', 'offer-a')
    ).rejects.toThrow('CASH_RELEASE_FAILURE');

    expect(ctx.promoRelease).toHaveBeenCalledOnce();
    expect(ctx.cashRelease).toHaveBeenCalledOnce();

    expect(ctx.query).toHaveBeenCalledWith('ROLLBACK');
    expect(ctx.query).not.toHaveBeenCalledWith('COMMIT');
    expect(ctx.releaseConnection).toHaveBeenCalledOnce();
  });

  it('nao acessa a carteira financeira se a promocional falhar', async () => {
    const ctx = setup({ promoError: true });

    await expect(
      ctx.service.release('driver-a', 'ride-100', 'offer-a')
    ).rejects.toThrow('PROMO_RELEASE_FAILURE');

    expect(ctx.cashRelease).not.toHaveBeenCalled();
    expect(ctx.query).toHaveBeenCalledWith('ROLLBACK');
    expect(ctx.query).not.toHaveBeenCalledWith('COMMIT');
    expect(ctx.releaseConnection).toHaveBeenCalledOnce();
  });

  it('mantem a idempotencia de liberacoes repetidas', async () => {
    const ctx = setup({ alreadyReleased: true });

    const result = await ctx.service.release(
      'driver-a', 'ride-100', 'offer-a'
    );

    expect(result).toEqual({
      promoReservedCents: 0n,
      cashReservedCents: 0n
    });

    expect(ctx.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejeita identidade financeira vazia antes de conectar', async () => {
    const ctx = setup();

    await expect(
      ctx.service.release('driver-a', 'ride-100', '')
    ).rejects.toThrow('INVALID_DUAL_WALLET_RELEASE_IDENTITY');

    expect(ctx.pool.connect).not.toHaveBeenCalled();
  });
});
