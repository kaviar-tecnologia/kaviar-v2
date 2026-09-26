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
const mockIsSumUpEnabled = vi.fn();
const mockGetSumUpMerchantPaymentMethods = vi.fn();
const mockHasSumUpPixPaymentMethod = vi.fn();
const mockResolveSumUpPixPaymentType = vi.fn();

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
  getSumUpCheckoutCallbackUrl: () => undefined,
  processSumUpCheckout: (...args: any[]) => mockProcessSumUpCheckout(...args),
  getSumUpCheckoutPaymentMethods: (...args: any[]) => mockGetSumUpCheckoutPaymentMethods(...args),
  getSumUpMerchantPaymentMethods: (...args: any[]) => mockGetSumUpMerchantPaymentMethods(...args),
  hasSumUpPixPaymentMethod: (...args: any[]) => mockHasSumUpPixPaymentMethod(...args),
  resolveSumUpPixPaymentType: (...args: any[]) => mockResolveSumUpPixPaymentType(...args),
  isSumUpEnabled: () => mockIsSumUpEnabled(),
  SumUpError: TestSumUpError,
}));

const { default: driverWalletV2Routes, _resetWalletV2Cache } = await import('../src/routes/driver-wallet-v2');

const app = express();
app.use(express.json());
app.use('/api/v2/drivers/me/wallet', driverWalletV2Routes);

describe('Wallet V2 SumUp payment method flow', () => {
  const auth = { Authorization: 'Bearer test-token' };

  beforeEach(() => {
    mockQuery.mockReset();
    mockCreateSumUpCheckout.mockReset();
    mockProcessSumUpCheckout.mockReset();
    mockGetSumUpCheckoutPaymentMethods.mockReset();
    mockIsSumUpEnabled.mockReset();
    mockGetSumUpMerchantPaymentMethods.mockReset();
    mockHasSumUpPixPaymentMethod.mockReset();
    mockResolveSumUpPixPaymentType.mockReset();
    _resetWalletV2Cache();

    mockIsSumUpEnabled.mockReturnValue(true);
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

  it('H) bloqueia provider legado com 410 e não chama SumUp', async () => {
    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'asaas' });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('PROVIDER_UNAVAILABLE');
    expect(res.body.message).toBe('Use a recarga de saldo KAVIAR.');
    expect(mockCreateSumUpCheckout).not.toHaveBeenCalled();
    expect(mockGetSumUpMerchantPaymentMethods).not.toHaveBeenCalled();
  });

  it('A) permite recarga quando merchant retorna qr_code_pix', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'qr_code_pix' }]);
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'qr_code_pix' }]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({})
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
    expect(res.body.data.pix.payment_type).toBe('qr_code_pix');
    expect(mockProcessSumUpCheckout).toHaveBeenCalledWith('sumup_checkout_1', { payment_type: 'qr_code_pix' });
  });

  it('B) permite recarga quando merchant retorna pix', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'pix' }]);
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'card' }]);
    mockProcessSumUpCheckout.mockResolvedValue({
      id: 'sumup_checkout_1',
      status: 'PENDING',
      pix: {
        qr_image_url: 'https://api.sumup.com/v0.1/artefacts/qr/pix',
        copy_paste: '000201PIXPIX',
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ c: '0' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(200);
    expect(res.body.data.pix.payment_type).toBe('pix');
    expect(mockProcessSumUpCheckout).toHaveBeenCalledWith('sumup_checkout_1', { payment_type: 'pix' });
  });

  it('C) retorna 503 quando merchant tem apenas card e não cria checkout', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'card' }]);

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Pix pela SumUp indisponível no momento. Tente novamente em instantes.');
    expect(mockCreateSumUpCheckout).not.toHaveBeenCalled();

    const insertSql = mockQuery.mock.calls.find((call: any[]) =>
      typeof call[0] === 'string' && call[0].includes('INSERT INTO wallet_recharges')
    );
    expect(insertSql).toBeFalsy();
  });

  it('D) retorna 503 quando SumUp está desabilitada', async () => {
    mockIsSumUpEnabled.mockReturnValue(false);

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Pix pela SumUp indisponível no momento. Tente novamente em instantes.');
    expect(mockCreateSumUpCheckout).not.toHaveBeenCalled();
  });

  it('E) retorna QR e copia e cola quando processamento qr_code_pix é válido', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'qr_code_pix' }]);
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'qr_code_pix' }]);
    mockProcessSumUpCheckout.mockResolvedValue({
      id: 'sumup_checkout_1',
      status: 'PENDING',
      qr_code_pix: {
        artefacts: [
          { name: 'barcode', location: 'https://api.sumup.com/v0.1/artefacts/qr/content-ok' },
          { name: 'code', content: '000201PIX-QR-OK' },
        ],
      },
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ c: '0' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(200);
    expect(res.body.data.pix.qr_image_url).toContain('artefacts/qr/content-ok');
    expect(res.body.data.pix.copy_paste).toBe('000201PIX-QR-OK');
    expect(res.body.data.pix.payment_type).toBe('qr_code_pix');
  });

  it('F) processa corretamente quando forma Pix resolvida é pix', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'pix' }]);
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'pix' }]);
    mockProcessSumUpCheckout.mockResolvedValue({
      id: 'sumup_checkout_1',
      status: 'PENDING',
      pix: {
        qrCode: 'https://api.sumup.com/v0.1/artefacts/qr/pix-form',
        copyPaste: '000201PIXCAMEL',
      },
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ c: '0' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(200);
    expect(res.body.data.pix.payment_type).toBe('pix');
    expect(res.body.data.pix.qr_image_url).toContain('artefacts/qr/pix-form');
    expect(res.body.data.pix.copy_paste).toBe('000201PIXCAMEL');
    expect(mockProcessSumUpCheckout).toHaveBeenCalledWith('sumup_checkout_1', { payment_type: 'pix' });
  });

  it('G) em erro SumUp no processamento expira recarga e retorna resposta segura', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'qr_code_pix' }]);
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'qr_code_pix' }]);
    mockProcessSumUpCheckout.mockRejectedValue(new TestSumUpError(422, 'Checkout não pôde ser processado pelo provedor.'));
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ c: '0' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/v2/drivers/me/wallet/recharge')
      .set(auth)
      .send({ package_id: 'saldo-20', payment_provider: 'sumup', payment_method: 'pix' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Pix pela SumUp indisponível no momento. Tente novamente em instantes.');
    const expireCall = mockQuery.mock.calls.find((call: any[]) =>
      typeof call[0] === 'string' &&
      call[0].includes("UPDATE wallet_recharges SET status='expired'")
    );
    expect(expireCall).toBeTruthy();
  });

  it('G2) merchant pix + checkout card + falha no process pix expira recarga e retorna erro seguro', async () => {
    mockGetSumUpMerchantPaymentMethods.mockResolvedValue([{ id: 'pix' }]);
    mockGetSumUpCheckoutPaymentMethods.mockResolvedValue([{ id: 'card' }]);
    mockProcessSumUpCheckout.mockRejectedValue(new TestSumUpError(422, 'Checkout não pôde ser processado pelo provedor.'));
    mockQuery
      .mockResolvedValueOnce({ rows: [{ enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ id: 'saldo-20', amount_cents: '2000', label: 'R$ 20' }] })
      .mockResolvedValueOnce({})
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

    const expireCall = mockQuery.mock.calls.find((call: any[]) =>
      typeof call[0] === 'string' &&
      call[0].includes("UPDATE wallet_recharges SET status='expired'")
    );
    expect(expireCall).toBeTruthy();
  });
});
