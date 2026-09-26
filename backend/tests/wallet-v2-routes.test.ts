import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockQuery = vi.fn();

vi.mock('../src/db', () => ({
  pool: {
    query: mockQuery,
    connect: vi.fn(() => ({ query: mockQuery, release: vi.fn() })),
  },
}));

vi.mock('../src/middlewares/auth', () => ({
  authenticateDriver: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Token ausente' });
    }
    req.driverId = 'test-driver-1';
    next();
  },
}));

const mockCreateSumUpCheckout = vi.fn();
const mockProcessSumUpCheckout = vi.fn();
const mockGetSumUpCheckoutPaymentMethods = vi.fn();
const mockGetSumUpCheckout = vi.fn();
const mockIsSumUpEnabled = vi.fn();
const mockGetSumUpMerchantPaymentMethods = vi.fn();
const mockHasSumUpPixPaymentMethod = vi.fn();
const mockResolveSumUpPixPaymentType = vi.fn();
const mockResolveOnRecharge = vi.fn().mockResolvedValue(0);

class TestSumUpError extends Error {
  statusCode: number;
  safeMessage: string;

  constructor(statusCode: number, safeMessage: string) {
    super(safeMessage);
    this.statusCode = statusCode;
    this.safeMessage = safeMessage;
  }
}

vi.mock('../src/services/sumup-service', () => ({
  createSumUpCheckout: (...args: any[]) => mockCreateSumUpCheckout(...args),
  getSumUpCheckoutCallbackUrl: () => process.env.SUMUP_CHECKOUT_CALLBACK_URL || undefined,
  processSumUpCheckout: (...args: any[]) => mockProcessSumUpCheckout(...args),
  getSumUpCheckoutPaymentMethods: (...args: any[]) => mockGetSumUpCheckoutPaymentMethods(...args),
  getSumUpCheckout: (...args: any[]) => mockGetSumUpCheckout(...args),
  getSumUpMerchantPaymentMethods: (...args: any[]) => mockGetSumUpMerchantPaymentMethods(...args),
  hasSumUpPixPaymentMethod: (...args: any[]) => mockHasSumUpPixPaymentMethod(...args),
  resolveSumUpPixPaymentType: (...args: any[]) => mockResolveSumUpPixPaymentType(...args),
  isSumUpEnabled: () => mockIsSumUpEnabled(),
  SumUpError: TestSumUpError,
}));

vi.mock('../src/services/wallet-v2/pending-debit.service', () => ({
  PendingDebitService: class {
    resolveOnRecharge(...args: any[]) {
      return mockResolveOnRecharge(...args);
    }
  },
}));

vi.mock('../src/services/wallet-v2/fee-split.service', () => ({
  FeeSplitService: class {},
}));

vi.mock('../src/services/wallet-v2/territory-ledger.service', () => ({
  TerritoryLedgerService: class {},
}));

const { default: driverWalletV2Routes, _resetWalletV2Cache } = await import('../src/routes/driver-wallet-v2');

const app = express();
app.use(express.json());
app.use('/api/v2/drivers/me/wallet', driverWalletV2Routes);

describe('Wallet V2 Routes (sumup-only)', () => {
  const auth = { Authorization: 'Bearer test-token' };

  beforeEach(() => {
    mockQuery.mockReset();
    mockCreateSumUpCheckout.mockReset();
    delete process.env.SUMUP_CHECKOUT_CALLBACK_URL;
    mockProcessSumUpCheckout.mockReset();
    mockGetSumUpCheckoutPaymentMethods.mockReset();
    mockGetSumUpCheckout.mockReset();
    mockIsSumUpEnabled.mockReset();
    mockGetSumUpMerchantPaymentMethods.mockReset();
    mockHasSumUpPixPaymentMethod.mockReset();
    mockResolveSumUpPixPaymentType.mockReset();
    mockResolveOnRecharge.mockClear();
    _resetWalletV2Cache();

    mockQuery.mockResolvedValue({ rows: [] });
    mockCreateSumUpCheckout.mockResolvedValue({
      id: 'sumup_checkout_1',
      checkout_reference: 'wallet_v2:test',
      hosted_checkout_url: 'https://checkout.sumup.com/hc/Q1',
      status: 'PENDING',
    });
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'qr_code_pix' }]);
    mockProcessSumUpCheckout.mockResolvedValue({
      id: 'sumup_checkout_1',
      status: 'PENDING',
      qr_code_pix: {
        artefacts: [
          { name: 'barcode', location: 'https://api.sumup.com/v0.1/artefacts/qr/content' },
          { name: 'code', content: '000201PIX' },
        ],
      },
    });
    mockGetSumUpCheckout.mockResolvedValue({ id: 'sumup_checkout_1', status: 'PENDING' });
    mockIsSumUpEnabled.mockReturnValue(true);
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'qr_code_pix' }]);
    mockHasSumUpPixPaymentMethod.mockImplementation((methods: any[]) =>
      methods.some((method) => {
        const tags = [method?.id, method?.type, method?.code, method?.method]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());
        return tags.some((tag) => tag.includes('qr_code_pix') || tag === 'pix');
      })
    );
    mockResolveSumUpPixPaymentType.mockImplementation((methods: any[]) => {
      const tags = methods
        .flatMap((method: any) => [method?.id, method?.type, method?.code, method?.method])
        .filter(Boolean)
        .map((v: any) => String(v).toLowerCase());
      if (tags.some((tag: string) => tag.includes('qr_code_pix'))) return 'qr_code_pix';
      if (tags.some((tag: string) => tag === 'pix')) return 'pix';
      return null;
    });
  });

  it('GET /wallet sem auth retorna 401', async () => {
    const res = await request(app).get('/api/v2/drivers/me/wallet');
    expect(res.status).toBe(401);
  });

  it('GET /wallet com auth retorna saldo', async () => {
    mockQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ balance_cents: '5000', reserved_cents: '1000' }] });

    const res = await request(app).get('/api/v2/drivers/me/wallet').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data.balance_cents).toBe(5000);
    expect(res.body.data.available_cents).toBe(4000);
  });

  it('POST /recharge sem auth retorna 401', async () => {
    const res = await request(app).post('/api/v2/drivers/me/wallet/recharge').send({ package_id: 'saldo-50' });
    expect(res.status).toBe(401);
  });

  it('POST /recharge bloqueia provider legado com 410', async () => {
    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-50', payment_provider: 'asaas' });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('PROVIDER_UNAVAILABLE');
    expect(res.body.message).toBe('Use a recarga de saldo KAVIAR.');
    expect(mockCreateSumUpCheckout).not.toHaveBeenCalled();
  });

  it('POST /recharge com wallet flag off retorna 403', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-50', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(403);
  });

  it('POST /recharge com package inválido retorna 400', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'invalido', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(400);
  });

  it('POST /recharge com payment_method=card retorna bloqueio explícito', async () => {
    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-50', payment_provider: 'sumup', payment_method: 'card' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Recarga por cartão está temporariamente indisponível. Use Pix.');
    expect(mockCreateSumUpCheckout).not.toHaveBeenCalled();
  });

  it('POST /recharge com payment_method=pix processa qr_code_pix e retorna artefatos', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({ rows: [{ c: '0' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(200);
    expect(res.body.data.payment_provider).toBe('sumup');
    expect(res.body.data.payment_method).toBe('pix');
    expect(res.body.data.wallet_credit_cents).toBe(2000);
    expect(res.body.data.charged_amount_cents).toBe(2000);
    expect(res.body.data.pix.payment_type).toBe('qr_code_pix');
    expect(res.body.data.pix.qr_image_url).toContain('/artefacts/qr/content');
    expect(res.body.data.pix.copy_paste).toBe('000201PIX');
    expect(mockGetSumUpMerchantPaymentMethods).toHaveBeenCalledTimes(1);
    expect(mockCreateSumUpCheckout).toHaveBeenCalledTimes(1);
    expect(mockGetSumUpCheckoutPaymentMethods).toHaveBeenCalledTimes(1);
    expect(mockProcessSumUpCheckout).toHaveBeenCalledWith('sumup_checkout_1', { payment_type: 'qr_code_pix' });
  });

  it('POST /recharge com payment_method=pix não bloqueia quando checkout methods retorna só card', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'pix' }]);
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'card' }]);
    mockProcessSumUpCheckout.mockResolvedValue({
      id: 'sumup_checkout_1',
      status: 'PENDING',
      pix: {
        qr_image_url: 'https://api.sumup.com/v0.1/artefacts/qr/content2',
        copy_paste: '000201PIXOK',
      },
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({ rows: [{ c: '0' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(200);
    expect(res.body.data.pix.payment_type).toBe('pix');
    expect(res.body.data.pix.qr_image_url).toContain('/artefacts/qr/content2');
    expect(res.body.data.pix.copy_paste).toBe('000201PIXOK');
    expect(mockProcessSumUpCheckout).toHaveBeenCalledWith('sumup_checkout_1', { payment_type: 'pix' });
  });

  it('POST /recharge com payment_method=pix sem qr_code_pix no merchant retorna 503 sem fallback Asaas', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'card' }]);

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Pix pela SumUp indisponível no momento. Tente novamente em instantes.');
    expect(mockCreateSumUpCheckout).not.toHaveBeenCalled();

    const insertCall = mockQuery.mock.calls.find((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes('INSERT INTO wallet_recharges')
    );
    expect(insertCall).toBeFalsy();
  });

  it('POST /recharge com payment_method=pix e falha no PUT expira recarga e retorna 503', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'pix' }]);
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'card' }]);
    mockProcessSumUpCheckout.mockRejectedValue(new TestSumUpError(422, 'Checkout não pôde ser processado pelo provedor.'));
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({ rows: [{ c: '0' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Pix pela SumUp indisponível no momento. Tente novamente em instantes.');
    expect(mockProcessSumUpCheckout).toHaveBeenCalledWith('sumup_checkout_1', { payment_type: 'pix' });

    const insertCall = mockQuery.mock.calls.find((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes('INSERT INTO wallet_recharges')
    );
    expect(insertCall).toBeTruthy();

    const expireCall = mockQuery.mock.calls.find((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes("UPDATE wallet_recharges SET status='expired'")
    );
    expect(expireCall).toBeTruthy();
  });

  it('POST /recharge com SumUp desabilitado retorna 503 sem fallback Asaas', async () => {
    mockIsSumUpEnabled.mockReturnValue(false);

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Pix pela SumUp indisponível no momento. Tente novamente em instantes.');
    expect(mockCreateSumUpCheckout).not.toHaveBeenCalled();
  });

  it('GET /wallet/recharges/:id inexistente retorna 404', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v2/drivers/me/wallet/recharges/inexistente')
      .set(auth);

    expect(res.status).toBe(404);
  });
});
