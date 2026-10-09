import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
}));

vi.mock(
  '../../src/services/wallet-v2/ride-reservation-release.service',
  () => ({ releaseRideReservation: mocks.release })
);

import { recoverCanceledReservations } from
  '../../src/services/wallet-v2/canceled-reservation-recovery.service';

const originalFlag =
  process.env.DRIVER_CANCEL_RESERVATION_RECOVERY_ENABLED;

const candidate = {
  ride_id: 'ride-A',
  driver_id: 'driver-A',
  offer_id: 'offer-A',
};

function harness(
  ride = {
    id: 'ride-A',
    driver_id: 'driver-A' as string | null,
    status: 'canceled_by_passenger',
  },
  offer = {
    id: 'offer-A',
    ride_id: 'ride-A',
    driver_id: 'driver-A',
    status: 'accepted',
  }
) {
  const transactionQuery = vi.fn(async (sql: string) => {
    if (sql.includes('FROM rides_v2')) {
      return { rows: [ride] };
    }

    if (sql.includes('FROM ride_offers')) {
      return { rows: [offer] };
    }

    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
      return { rows: [] };
    }

    throw new Error('UNEXPECTED_TEST_SQL');
  });

  const client = {
    query: transactionQuery,
    release: vi.fn(),
  };

  const poolQuery = vi.fn().mockResolvedValue({
    rows: [candidate],
  });

  const pool = {
    options: { max: 3 },
    query: poolQuery,
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;

  return { pool, client, poolQuery, transactionQuery };
}

describe('Execução segura da recuperação de cancelamentos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DRIVER_CANCEL_RESERVATION_RECOVERY_ENABLED = 'true';
    mocks.release.mockResolvedValue('dual_released');
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.DRIVER_CANCEL_RESERVATION_RECOVERY_ENABLED;
    } else {
      process.env.DRIVER_CANCEL_RESERVATION_RECOVERY_ENABLED =
        originalFlag;
    }
  });

  it('não executa quando a recuperação está desligada', async () => {
    delete process.env.DRIVER_CANCEL_RESERVATION_RECOVERY_ENABLED;

    const { pool, poolQuery } = harness();

    const result = await recoverCanceledReservations(pool);

    expect(result.disabled).toBe(true);
    expect(result.scanned).toBe(0);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('recupera reserva de corrida cancelada', async () => {
    const { pool, transactionQuery } = harness();

    const result = await recoverCanceledReservations(pool);

    expect(result.released).toBe(1);
    expect(result.errors).toBe(0);

    expect(mocks.release).toHaveBeenCalledWith(
      pool, 'ride-A', 'driver-A'
    );

    expect(transactionQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('recupera oferta cancelada após redistribuição', async () => {
    const { pool } = harness(
      {
        id: 'ride-A',
        driver_id: 'driver-B',
        status: 'accepted',
      },
      {
        id: 'offer-A',
        ride_id: 'ride-A',
        driver_id: 'driver-A',
        status: 'canceled',
      }
    );

    const result = await recoverCanceledReservations(pool);

    expect(result.released).toBe(1);
    expect(mocks.release).toHaveBeenCalledWith(
      pool, 'ride-A', 'driver-A'
    );
  });

  it('não libera uma corrida que continua ativa', async () => {
    const { pool } = harness(
      {
        id: 'ride-A',
        driver_id: 'driver-A',
        status: 'accepted',
      },
      {
        id: 'offer-A',
        ride_id: 'ride-A',
        driver_id: 'driver-A',
        status: 'accepted',
      }
    );

    const result = await recoverCanceledReservations(pool);

    expect(result.skipped).toBe(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('rejeita oferta vinculada a outro motorista', async () => {
    const { pool } = harness(
      {
        id: 'ride-A',
        driver_id: 'driver-A',
        status: 'canceled_by_passenger',
      },
      {
        id: 'offer-A',
        ride_id: 'ride-A',
        driver_id: 'driver-B',
        status: 'canceled',
      }
    );

    const result = await recoverCanceledReservations(pool);

    expect(result.skipped).toBe(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('repete com segurança após uma falha financeira', async () => {
    const { pool, transactionQuery } = harness();

    mocks.release
      .mockRejectedValueOnce(new Error('TEMPORARY_FINANCIAL_FAILURE'))
      .mockResolvedValueOnce('dual_released');

    const first = await recoverCanceledReservations(pool);

    expect(first.errors).toBe(1);
    expect(first.released).toBe(0);
    expect(transactionQuery).toHaveBeenCalledWith('ROLLBACK');

    const second = await recoverCanceledReservations(pool);

    expect(second.errors).toBe(0);
    expect(second.released).toBe(1);
    expect(mocks.release).toHaveBeenCalledTimes(2);
  });

  it('reconhece uma reserva já finalizada', async () => {
    const { pool } = harness();

    mocks.release.mockResolvedValueOnce('already_finalized');

    const result = await recoverCanceledReservations(pool);

    expect(result.already_finalized).toBe(1);
    expect(result.released).toBe(0);
  });

  it('exige capacidade para duas conexões', async () => {
    const { pool } = harness();

    (pool as unknown as { options: { max: number } })
      .options.max = 1;

    await expect(
      recoverCanceledReservations(pool)
    ).rejects.toThrow('RECOVERY_REQUIRES_TWO_POOL_CONNECTIONS');

    expect(mocks.release).not.toHaveBeenCalled();
  });
});
