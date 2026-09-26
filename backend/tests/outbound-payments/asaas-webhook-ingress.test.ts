import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../src/db', () => ({
  pool: { query: (...args: any[]) => queryMock(...args) },
}));
const { default: router } = await import('../../src/routes/webhooks-asaas');
const app = express();
app.use(express.json());
app.use('/webhooks/asaas', router);

describe('Asaas secure webhook ingress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASAAS_WEBHOOK_TOKEN = 'test-webhook-token';
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
  });

  const payload = {
    id: 'evt-123', event: 'TRANSFER_DONE',
    transfer: {
      id: 'transfer-123', status: 'DONE', value: 20,
      externalReference: 'kaviar-payment:test:obl-1',
      bankAccount: { cpfCnpj: 'sensitive-cpf' }, pixAddressKey: 'sensitive-pix',
    },
  };

  it('persists notification as PENDING without financial actions or sensitive payload', async () => {
    const res = await request(app).post('/webhooks/asaas/transfers')
      .set('asaas-access-token', 'test-webhook-token').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.persisted).toBe(true);
    const [sql, args] = queryMock.mock.calls[0];
    expect(sql).toContain('processing_status');
    expect(args.slice(0, 4)).toEqual(['asaas', 'evt-123', 'TRANSFER', 'DONE']);
    expect(args[4]).not.toContain('sensitive-cpf');
    expect(args[4]).not.toContain('sensitive-pix');
    expect(JSON.parse(args[4]).transfer.id).toBe('transfer-123');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('rejects spoofed token before persisting', async () => {
    const res = await request(app).post('/webhooks/asaas/transfers')
      .set('asaas-access-token', 'wrong').send(payload);
    expect(res.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects absent event id rather than inventing time-based id', async () => {
    const res = await request(app).post('/webhooks/asaas/transfers')
      .set('asaas-access-token', 'test-webhook-token')
      .send({ event: payload.event, transfer: payload.transfer });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('deduplicates by Asaas event id', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app).post('/webhooks/asaas/transfers')
      .set('asaas-access-token', 'test-webhook-token').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });

  it('persists BILL_PAID to the bill queue', async () => {
    const res = await request(app).post('/webhooks/asaas/bills')
      .set('asaas-access-token', 'test-webhook-token')
      .send({ id: 'evt-bill', event: 'BILL_PAID', bill: { id: 'bill-1', status: 'PAID', value: 12 } });
    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][1].slice(0, 4)).toEqual(['asaas', 'evt-bill', 'BILL_PAYMENT', 'DONE']);
  });

  it('returns 503 when event cannot be durably persisted', async () => {
    queryMock.mockRejectedValueOnce(new Error('database unavailable'));
    const res = await request(app).post('/webhooks/asaas/transfers')
      .set('asaas-access-token', 'test-webhook-token').send(payload);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PERSISTENCE_FAILURE');
  });
});
