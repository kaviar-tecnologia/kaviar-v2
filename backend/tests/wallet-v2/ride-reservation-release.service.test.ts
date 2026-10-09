import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const mocks = vi.hoisted(() => ({
  findOffer: vi.fn(),
  dualRelease: vi.fn(),
  legacyRelease: vi.fn(),
}));

vi.mock(
  '../../src/services/wallet-v2/active-dual-wallet-offer.service',
  () => ({ findActiveDualWalletOffer: mocks.findOffer })
);

vi.mock(
  '../../src/services/wallet-v2/dual-wallet-reservation.service',
  () => ({
    DualWalletReservationService: class {
      release(...args: unknown[]) {
        return mocks.dualRelease(...args);
      }
    },
  })
);

vi.mock(
  '../../src/services/wallet-v2/wallet.service',
  () => ({
    WalletService: class {
      releaseReserve(...args: unknown[]) {
        return mocks.legacyRelease(...args);
      }
    },
  })
);

vi.mock(
  '../../src/services/wallet-v2/promo-wallet.service',
  () => ({ PromoWalletService: class {} })
);

import { releaseRideReservation } from
  '../../src/services/wallet-v2/ride-reservation-release.service';

describe('Liberação financeira segura da corrida', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOffer.mockResolvedValue(null);
    mocks.dualRelease.mockResolvedValue({
      promoReservedCents: 300n,
      cashReservedCents: 150n,
    });
    mocks.legacyRelease.mockResolvedValue(undefined);
  });

  it('libera a oferta dupla pelo identificador correto', async () => {
    mocks.findOffer.mockResolvedValue('offer-A');

    const pool = { query: vi.fn() } as unknown as Pool;

    expect(
      await releaseRideReservation(pool, 'ride-A', 'driver-A')
    ).toBe('dual_released');

    expect(mocks.dualRelease).toHaveBeenCalledWith(
      'driver-A', 'ride-A', 'offer-A'
    );

    expect(mocks.legacyRelease).not.toHaveBeenCalled();
  });

  it('propaga falha na liberação dupla', async () => {
    mocks.findOffer.mockResolvedValue('offer-A');
    mocks.dualRelease.mockRejectedValue(
      new Error('RELEASE_FAILED')
    );

    const pool = { query: vi.fn() } as unknown as Pool;

    await expect(
      releaseRideReservation(pool, 'ride-A', 'driver-A')
    ).rejects.toThrow('RELEASE_FAILED');

    expect(mocks.legacyRelease).not.toHaveBeenCalled();
  });

  it('libera a reserva tradicional pelo valor registrado', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          driver_id: 'driver-A',
          reference_id: 'ride-A',
          reserved_delta_cents: '450',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const pool = { query } as unknown as Pool;

    expect(
      await releaseRideReservation(pool, 'ride-A', 'driver-A')
    ).toBe('legacy_released');

    expect(mocks.legacyRelease).toHaveBeenCalledWith(
      'driver-A', 450n, 'ride-A'
    );
  });

  it('não libera novamente reserva tradicional finalizada', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          driver_id: 'driver-A',
          reference_id: 'ride-A',
          reserved_delta_cents: '450',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });

    const pool = { query } as unknown as Pool;

    expect(
      await releaseRideReservation(pool, 'ride-A', 'driver-A')
    ).toBe('already_finalized');

    expect(mocks.legacyRelease).not.toHaveBeenCalled();
  });

  it('não libera reserva de outro motorista', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{
        driver_id: 'driver-B',
        reference_id: 'ride-A',
        reserved_delta_cents: '450',
      }],
    });

    await expect(
      releaseRideReservation(
        { query } as unknown as Pool,
        'ride-A',
        'driver-A'
      )
    ).rejects.toThrow(
      'RIDE_LEGACY_RESERVATION_IDENTITY_MISMATCH'
    );

    expect(mocks.legacyRelease).not.toHaveBeenCalled();
  });

  it('reconhece histórico de oferta já finalizada', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ existed: true }] });

    expect(
      await releaseRideReservation(
        { query } as unknown as Pool,
        'ride-A',
        'driver-A'
      )
    ).toBe('already_finalized');

    expect(mocks.dualRelease).not.toHaveBeenCalled();
    expect(mocks.legacyRelease).not.toHaveBeenCalled();
  });

  it('bloqueia liberação sem reserva comprovada', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ existed: false }] });

    await expect(
      releaseRideReservation(
        { query } as unknown as Pool,
        'ride-A',
        'driver-A'
      )
    ).rejects.toThrow(
      'RIDE_WALLET_RESERVATION_NOT_FOUND'
    );
  });
});
