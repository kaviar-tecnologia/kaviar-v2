import { describe, it, expect, vi } from 'vitest';
import { DualWalletReservationService } from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('Carteira dupla — reservas finalizadas', () => {
  for (const terminalType of ['release', 'consume']) {
    it(`rejeita reserva promocional finalizada por ${terminalType}`, async () => {
      const rideId = 'ride-final';
      const driverId = 'driver-1';
      const terminalKey = `promo_${terminalType}:${rideId}`;

      const query = vi.fn(async (
        sql: string,
        params?: string[]
      ) => {
        if (sql.includes('FROM driver_promo_ledger')) {
          if (params?.includes(`promo_reserve:${rideId}`)) {
            return {
              rows: [{
                driver_id: driverId,
                amount_cents: '300'
              }]
            };
          }

          if (params?.includes(terminalKey)) {
            return {
              rows: [{
                id: '1',
                entry_type: terminalType
              }]
            };
          }
        }

        if (sql.includes('FROM wallet_ledger')) {
          if (sql.includes('WHERE idempotency_key IN')) {
            return { rows: [] };
          }

          return {
            rows: [{
              driver_id: driverId,
              reserved_delta_cents: '200'
            }]
          };
        }

        return { rows: [] };
      });

      const release = vi.fn();
      const connect = vi.fn(async () => ({
        query,
        release
      }));

      const service = new DualWalletReservationService(
        { connect } as any,
        { reserveInClient: vi.fn() } as any,
        { reserveInClient: vi.fn() } as any
      );

      await expect(
        service.reserve(driverId, rideId, 500n)
      ).rejects.toThrow(
        'DUAL_WALLET_RESERVATION_ALREADY_FINALIZED'
      );

      expect(query).toHaveBeenCalledWith('ROLLBACK');
      expect(query).not.toHaveBeenCalledWith('COMMIT');
      expect(release).toHaveBeenCalledTimes(1);
    });
  }
});


describe('Carteira dupla — finalizacao financeira', () => {
  for (const terminal of ['cancel_release', 'fee_debit']) {
    it(`rejeita reserva financeira finalizada por ${terminal}`, async () => {
      const rideId = 'ride-cash-final';
      const driverId = 'driver-1';

      const query = vi.fn(async (
        sql: string,
        params?: string[]
      ) => {
        if (sql.includes('FROM driver_promo_ledger')) {
          if (params?.includes(`promo_reserve:${rideId}`)) {
            return {
              rows: [{ driver_id: driverId, amount_cents: '300' }]
            };
          }
          return { rows: [] };
        }

        if (sql.includes('FROM wallet_ledger')) {
          if (sql.includes('idempotency_key IN')) {
            const expected = [
              `cancel_release:ride:${rideId}`,
              `fee:ride:${rideId}`
            ];

            if (
              expected.every(key => params?.includes(key))
            ) {
              return { rows: [{ entry_type: terminal }] };
            }

            return { rows: [] };
          }

          return {
            rows: [{
              driver_id: driverId,
              reserved_delta_cents: '200'
            }]
          };
        }

        return { rows: [] };
      });

      const release = vi.fn();
      const connect = vi.fn(async () => ({ query, release }));

      const cashReserve = vi.fn();
      const promoReserve = vi.fn();

      const service = new DualWalletReservationService(
        { connect } as any,
        { reserveInClient: cashReserve } as any,
        { reserveInClient: promoReserve } as any
      );

      await expect(
        service.reserve(driverId, rideId, 500n)
      ).rejects.toThrow(
        'DUAL_WALLET_RESERVATION_ALREADY_FINALIZED'
      );

      expect(query).toHaveBeenCalledWith('ROLLBACK');
      expect(query).not.toHaveBeenCalledWith('COMMIT');

      expect(cashReserve).not.toHaveBeenCalled();
      expect(promoReserve).not.toHaveBeenCalled();

      expect(release).toHaveBeenCalledTimes(1);
    });
  }
});
