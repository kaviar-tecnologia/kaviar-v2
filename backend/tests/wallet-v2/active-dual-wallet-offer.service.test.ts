import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { findActiveDualWalletOffer } from
  '../../src/services/wallet-v2/active-dual-wallet-offer.service';

interface OfferRow {
  offer_id: string;
  promo_reserved: boolean;
  cash_reserved: boolean;
  promo_finalized: boolean;
  cash_finalized: boolean;
}

function row(overrides: Partial<OfferRow> = {}): OfferRow {
  return {
    offer_id: 'offer-A',
    promo_reserved: true,
    cash_reserved: true,
    promo_finalized: false,
    cash_finalized: false,
    ...overrides,
  };
}

function mockPool(rows: OfferRow[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe('Identificação segura da reserva dupla', () => {
  it('identifica reserva promocional e financeira ativas', async () => {
    const result = await findActiveDualWalletOffer(
      mockPool([row()]), 'ride-A', 'driver-A'
    );

    expect(result).toBe('offer-A');
  });

  it('identifica reserva somente promocional', async () => {
    const result = await findActiveDualWalletOffer(
      mockPool([row({ cash_reserved: false })]),
      'ride-A',
      'driver-A'
    );

    expect(result).toBe('offer-A');
  });

  it('identifica reserva somente financeira por oferta', async () => {
    const result = await findActiveDualWalletOffer(
      mockPool([row({ promo_reserved: false })]),
      'ride-A',
      'driver-A'
    );

    expect(result).toBe('offer-A');
  });

  it('ignora uma oferta integralmente finalizada', async () => {
    const result = await findActiveDualWalletOffer(
      mockPool([row({
        promo_finalized: true,
        cash_finalized: true,
      })]),
      'ride-A',
      'driver-A'
    );

    expect(result).toBeNull();
  });

  it('bloqueia finalização parcial entre carteiras', async () => {
    await expect(
      findActiveDualWalletOffer(
        mockPool([row({ promo_finalized: true })]),
        'ride-A',
        'driver-A'
      )
    ).rejects.toThrow('DUAL_WALLET_PARTIAL_FINALIZATION');
  });

  it('bloqueia duas ofertas simultaneamente ativas', async () => {
    await expect(
      findActiveDualWalletOffer(
        mockPool([
          row({ offer_id: 'offer-A' }),
          row({ offer_id: 'offer-B' }),
        ]),
        'ride-A',
        'driver-A'
      )
    ).rejects.toThrow('DUAL_WALLET_MULTIPLE_ACTIVE_OFFERS');
  });

  it('retorna null quando não há reserva dupla', async () => {
    const result = await findActiveDualWalletOffer(
      mockPool([]), 'ride-A', 'driver-A'
    );

    expect(result).toBeNull();
  });

  it('rejeita identificadores ausentes', async () => {
    await expect(
      findActiveDualWalletOffer(mockPool([]), '', 'driver-A')
    ).rejects.toThrow('DUAL_WALLET_LOOKUP_INVALID_IDENTITY');
  });

  it('executa a consulta SQL no PostgreSQL local', async () => {
    assertSafeFinanceDatabase();

    const url = new URL(process.env.DATABASE_URL ?? '');

    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/kaviar_incentivos_test' ||
      (url.port && url.port !== '5432')
    ) {
      throw new Error('TEST_DATABASE_NOT_ALLOWED');
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      const suffix = randomUUID();

      // Identificadores inexistentes.
      // Exercita a consulta SQL sem inserir ou alterar dados.
      const result = await findActiveDualWalletOffer(
        pool,
        `test-ride-${suffix}`,
        `test-driver-${suffix}`
      );

      expect(result).toBeNull();
    } finally {
      await pool.end();
    }
  });

  it('identifica uma reserva efetiva no PostgreSQL', async () => {
    assertSafeFinanceDatabase();

    const url = new URL(process.env.DATABASE_URL ?? '');

    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/kaviar_incentivos_test' ||
      (url.port && url.port !== '5432')
    ) {
      throw new Error('TEST_DATABASE_NOT_ALLOWED');
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Tabelas temporárias: não modificam os registros existentes.
      await client.query(`
        CREATE TEMP TABLE ride_offers (
          id text,
          ride_id text,
          driver_id text
        ) ON COMMIT DROP
      `);

      await client.query(`
        CREATE TEMP TABLE driver_promo_ledger (
          idempotency_key text,
          driver_id text,
          reference_id text,
          reference_type text,
          entry_type text
        ) ON COMMIT DROP
      `);

      await client.query(`
        CREATE TEMP TABLE wallet_ledger (
          idempotency_key text,
          driver_id text,
          reference_id text,
          reference_type text,
          entry_type text
        ) ON COMMIT DROP
      `);

      const rideId = `test-ride-${randomUUID()}`;
      const driverId = `test-driver-${randomUUID()}`;
      const offerId = `test-offer-${randomUUID()}`;

      await client.query(
        `INSERT INTO ride_offers VALUES ($1, $2, $3)`,
        [offerId, rideId, driverId]
      );

      await client.query(
        `INSERT INTO driver_promo_ledger
         VALUES ($1, $2, $3, 'ride', 'reserve')`,
        [`promo_reserve:${offerId}`, driverId, rideId]
      );

      await client.query(
        `INSERT INTO wallet_ledger
         VALUES ($1, $2, $3, 'ride', 'reserve')`,
        [`reserve:ride:${offerId}`, driverId, rideId]
      );

      // Utiliza a conexão da mesma transação,
      // que contém as tabelas temporárias.
      const found = await findActiveDualWalletOffer(
        client as unknown as Pool,
        rideId,
        driverId
      );

      expect(found).toBe(offerId);

      // Finalização somente promocional é inconsistente.
      await client.query(
        `INSERT INTO driver_promo_ledger
         VALUES ($1, $2, $3, 'ride', 'release')`,
        [`promo_release:${offerId}`, driverId, rideId]
      );

      await expect(
        findActiveDualWalletOffer(
          client as unknown as Pool,
          rideId,
          driverId
        )
      ).rejects.toThrow('DUAL_WALLET_PARTIAL_FINALIZATION');

      // Com ambas as reservas finalizadas,
      // a oferta deixa de estar ativa.
      await client.query(
        `INSERT INTO wallet_ledger
         VALUES ($1, $2, $3, 'ride', 'release')`,
        [`cancel_release:ride:${offerId}`, driverId, rideId]
      );

      const finalized = await findActiveDualWalletOffer(
        client as unknown as Pool,
        rideId,
        driverId
      );

      expect(finalized).toBeNull();

    } finally {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
        await pool.end();
      }
    }
  });


  it('não confunde a liquidação de outro motorista', async () => {
    assertSafeFinanceDatabase();

    const url = new URL(process.env.DATABASE_URL ?? '');

    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/kaviar_incentivos_test' ||
      (url.port && url.port !== '5432')
    ) {
      throw new Error('TEST_DATABASE_NOT_ALLOWED');
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TEMP TABLE ride_offers (
          id text,
          ride_id text,
          driver_id text
        ) ON COMMIT DROP
      `);

      await client.query(`
        CREATE TEMP TABLE driver_promo_ledger (
          idempotency_key text,
          driver_id text,
          reference_id text,
          reference_type text,
          entry_type text
        ) ON COMMIT DROP
      `);

      await client.query(`
        CREATE TEMP TABLE wallet_ledger (
          idempotency_key text,
          driver_id text,
          reference_id text,
          reference_type text,
          entry_type text
        ) ON COMMIT DROP
      `);

      const rideId = randomUUID();
      const driverA = randomUUID();
      const driverB = randomUUID();
      const offerA = randomUUID();
      const offerB = randomUUID();

      await client.query(
        `INSERT INTO ride_offers VALUES
         ($1, $3, $4),
         ($2, $3, $5)`,
        [offerA, offerB, rideId, driverA, driverB]
      );

      // Motorista A: reserva promocional e financeira pendentes.
      await client.query(
        `INSERT INTO driver_promo_ledger VALUES
         ($1, $2, $3, 'ride', 'reserve')`,
        [`promo_reserve:${offerA}`, driverA, rideId]
      );

      // Motorista B: concluiu a corrida e pagou sua taxa.
      await client.query(
        `INSERT INTO wallet_ledger VALUES
         ($1, $4, $6, 'ride', 'reserve'),
         ($2, $5, $6, 'ride', 'reserve'),
         ($3, $5, $6, 'ride', 'fee_debit')`,
        [
          `reserve:ride:${offerA}`,
          `reserve:ride:${offerB}`,
          `fee:ride:${rideId}`,
          driverA,
          driverB,
          rideId,
        ]
      );

      // A taxa de B não deve finalizar a reserva de A.
      const activeA = await findActiveDualWalletOffer(
        client as unknown as Pool,
        rideId,
        driverA
      );

      expect(activeA).toBe(offerA);

      // A reserva de B já está finalizada.
      const activeB = await findActiveDualWalletOffer(
        client as unknown as Pool,
        rideId,
        driverB
      );

      expect(activeB).toBeNull();

      // Agora A recebe a liberação das duas carteiras.
      await client.query(
        `INSERT INTO driver_promo_ledger VALUES
         ($1, $2, $3, 'ride', 'release')`,
        [`promo_release:${offerA}`, driverA, rideId]
      );

      await client.query(
        `INSERT INTO wallet_ledger VALUES
         ($1, $2, $3, 'ride', 'cancel_release')`,
        [`cancel_release:ride:${offerA}`, driverA, rideId]
      );

      const afterRelease = await findActiveDualWalletOffer(
        client as unknown as Pool,
        rideId,
        driverA
      );

      expect(afterRelease).toBeNull();

    } finally {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
        await pool.end();
      }
    }
  });

});
