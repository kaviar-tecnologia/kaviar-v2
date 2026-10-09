import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DriverWelcomePromoService } from
  '../../src/services/wallet-v2/driver-welcome-promo.service';

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn();

const pool = { connect: connectMock } as any;

describe('Bônus permanente de boas-vindas', () => {
  const oldEnabled = process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
  const oldFrom = process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'true';
    process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM =
      '2026-09-01T00:00:00.000Z';

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock,
    });
  });

  afterEach(() => {
    if (oldEnabled === undefined)
      delete process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
    else
      process.env.DRIVER_PERMANENT_WELCOME_ENABLED = oldEnabled;

    if (oldFrom === undefined)
      delete process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM;
    else
      process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM = oldFrom;
  });

  it('desligado não acessa banco', async () => {
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'false';

    const svc = new DriverWelcomePromoService(pool);
    const result = await svc.grantOnce('driver-1');

    expect(result.granted).toBe(false);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('data inválida não acessa banco', async () => {
    process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM = 'invalida';

    const svc = new DriverWelcomePromoService(pool);
    const result = await svc.grantOnce('driver-1');

    expect(result.granted).toBe(false);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('motorista antigo não recebe bônus', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'driver-1',
          status: 'approved',
          created_at: new Date('2026-08-01'),
          approved_at: new Date('2026-09-02'),
        }],
      })
      .mockResolvedValueOnce({});

    const svc = new DriverWelcomePromoService(pool);
    const result = await svc.grantOnce('driver-1');

    expect(result.granted).toBe(false);
    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
  });

  it('concede R$ 20 uma única vez', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'driver-1',
          status: 'approved',
          created_at: new Date('2026-09-02'),
          approved_at: new Date('2026-09-03'),
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ balance_cents: '2000' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const svc = new DriverWelcomePromoService(pool);
    const result = await svc.grantOnce('driver-1');

    expect(result).toEqual({
      granted: true,
      balanceCents: 2000n,
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO driver_promo_ledger'),
      expect.arrayContaining(['2000', 'welcome_permanent:driver-1'])
    );
  });

  it('falha no histórico provoca rollback e libera conexão', async () => {
    queryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 'driver-1',
          status: 'approved',
          created_at: new Date('2026-09-02'),
          approved_at: new Date('2026-09-03'),
        }],
      })
      .mockResolvedValueOnce({}) // cria carteira
      .mockResolvedValueOnce({ rows: [] }) // sem concessão anterior
      .mockResolvedValueOnce({
        rows: [{ balance_cents: '2000' }],
      }) // atualização ainda não confirmada
      .mockRejectedValueOnce(new Error('LEDGER_FAILURE_TEST'))
      .mockResolvedValueOnce({}); // ROLLBACK

    const svc = new DriverWelcomePromoService(pool);

    await expect(svc.grantOnce('driver-1'))
      .rejects.toThrow('LEDGER_FAILURE_TEST');

    expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    expect(queryMock).not.toHaveBeenCalledWith('COMMIT');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('não concede novamente após registro existente', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 'driver-1',
          status: 'active',
          created_at: new Date('2026-09-02'),
          approved_at: new Date('2026-09-03'),
        }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ balance_cents: '1100' }] })
      .mockResolvedValueOnce({});

    const svc = new DriverWelcomePromoService(pool);
    const result = await svc.grantOnce('driver-1');

    expect(result).toEqual({
      granted: false,
      balanceCents: 1100n,
    });
  });
});
