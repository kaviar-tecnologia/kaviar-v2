import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReconcileByExternalId = vi.fn();
const mockReconcileById = vi.fn();
const mockReconcilePending = vi.fn();

class TestSumUpError extends Error {}

vi.mock('../src/services/sumup-service', () => ({
  SumUpError: TestSumUpError,
}));

vi.mock('../src/services/wallet-v2/sumup-recharge.service', () => ({
  reconcileSumUpRechargeByExternalId: (...args: any[]) => mockReconcileByExternalId(...args),
  reconcileSumUpRechargeById: (...args: any[]) => mockReconcileById(...args),
  reconcilePendingSumUpRecharges: (...args: any[]) => mockReconcilePending(...args),
}));

const { default: webhooksSumUpRoutes } = await import('../src/routes/webhooks-sumup');

const app = express();
app.use(express.json());
app.use('/api/webhooks', webhooksSumUpRoutes);

describe('webhooks-sumup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUMUP_WEBHOOK_TOKEN = 'webhook-secret';
    process.env.SUMUP_RECONCILE_TOKEN = 'reconcile-secret';
    process.env.SUMUP_CHECKOUT_CALLBACK_URL = 'https://api.kaviar.com.br/api/webhooks/sumup/callback';
  });

  it('6.1) webhook repassa checkout_id para reconciliação por external_id', async () => {
    mockReconcileByExternalId.mockResolvedValueOnce({
      recharge_id: 'rch-1',
      previous_status: 'pending',
      checkout_status: 'PAID',
      final_status: 'confirmed',
      credited: true,
    });

    const res = await request(app)
      .post('/api/webhooks/sumup')
      .set('Authorization', 'Bearer webhook-secret')
      .send({ checkout_id: 'checkout-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.credited).toBe(true);
    expect(mockReconcileByExternalId).toHaveBeenCalledWith('checkout-1');
  });

  it('6.2) webhook repetido mantém contrato e aceita retorno idempotente (credited=false)', async () => {
    mockReconcileByExternalId
      .mockResolvedValueOnce({
        recharge_id: 'rch-dup-1',
        previous_status: 'pending',
        checkout_status: 'PAID',
        final_status: 'confirmed',
        credited: true,
      })
      .mockResolvedValueOnce({
        recharge_id: 'rch-dup-1',
        previous_status: 'pending',
        checkout_status: null,
        final_status: 'confirmed',
        credited: false,
      });

    const first = await request(app)
      .post('/api/webhooks/sumup')
      .set('x-sumup-token', 'webhook-secret')
      .send({ checkout: { id: 'checkout-dup-1' } });

    const second = await request(app)
      .post('/api/webhooks/sumup')
      .set('x-sumup-token', 'webhook-secret')
      .send({ data: { id: 'checkout-dup-1' } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.credited).toBe(true);
    expect(second.body.data.credited).toBe(false);
    expect(mockReconcileByExternalId).toHaveBeenNthCalledWith(1, 'checkout-dup-1');
    expect(mockReconcileByExternalId).toHaveBeenNthCalledWith(2, 'checkout-dup-1');
  });

  it('6.3) reconcile single chama serviço por recharge_id', async () => {
    mockReconcileById.mockResolvedValueOnce({
      recharge_id: 'rch-single-1',
      previous_status: 'pending',
      checkout_status: 'PAID',
      final_status: 'confirmed',
      credited: true,
    });

    const res = await request(app)
      .post('/api/webhooks/sumup/reconcile')
      .set('Authorization', 'Bearer reconcile-secret')
      .send({ recharge_id: 'rch-single-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('single');
    expect(res.body.data.result.credited).toBe(true);
    expect(mockReconcileById).toHaveBeenCalledWith('rch-single-1');
  });

  it('6.4) reconcile batch chama serviço com defaults', async () => {
    mockReconcilePending.mockResolvedValueOnce({
      scanned: 2,
      confirmed: 1,
      expired: 1,
      pending: 0,
      errors: 0,
      results: [],
    });

    const res = await request(app)
      .post('/api/webhooks/sumup/reconcile')
      .set('x-reconcile-token', 'reconcile-secret')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('batch');
    expect(mockReconcilePending).toHaveBeenCalledWith(50, 1);
  });

  it('retorna 502 quando serviço lança SumUpError', async () => {
    mockReconcileByExternalId.mockRejectedValueOnce(new TestSumUpError('sumup unavailable'));

    const res = await request(app)
      .post('/api/webhooks/sumup')
      .set('Authorization', 'Bearer webhook-secret')
      .send({ checkout_id: 'checkout-err-1' });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });
  it('native callback aceita evento oficial sem token, mas só passa id à verificação API', async () => {
    mockReconcileByExternalId.mockResolvedValueOnce({ final_status: 'confirmed', credited: true });
    const res = await request(app)
      .post('/api/webhooks/sumup/callback')
      .send({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'checkout-native-1', status: 'PAID' });
    expect(res.status).toBe(204);
    expect(mockReconcileByExternalId).toHaveBeenCalledWith('checkout-native-1');
  });

  it('native callback ignora eventos desconhecidos sem reconciliar', async () => {
    const res = await request(app)
      .post('/api/webhooks/sumup/callback')
      .send({ event_type: 'UNKNOWN_EVENT', id: 'checkout-x' });
    expect(res.status).toBe(204);
    expect(mockReconcileByExternalId).not.toHaveBeenCalled();
  });

  it('native callback rejeita id inválido', async () => {
    const res = await request(app)
      .post('/api/webhooks/sumup/callback')
      .send({ event_type: 'CHECKOUT_STATUS_CHANGED', id: '../../invalid' });
    expect(res.status).toBe(400);
    expect(mockReconcileByExternalId).not.toHaveBeenCalled();
  });

  it('native callback desabilitado sem configuração explícita', async () => {
    delete process.env.SUMUP_CHECKOUT_CALLBACK_URL;
    const res = await request(app)
      .post('/api/webhooks/sumup/callback')
      .send({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'checkout-native-1' });
    expect(res.status).toBe(503);
    expect(mockReconcileByExternalId).not.toHaveBeenCalled();
  });

  it('endpoint interno continua exigindo token, mesmo com payload nativo', async () => {
    const res = await request(app)
      .post('/api/webhooks/sumup')
      .send({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'checkout-native-1' });
    expect(res.status).toBe(401);
  });

});