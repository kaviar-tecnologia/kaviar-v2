import { Router, Request, Response } from 'express';
import { authenticateDriver } from '../middlewares/auth';
import { pool } from '../db';
import { WalletService } from '../services/wallet-v2/wallet.service';
import crypto from 'crypto';
import {
  createSumUpCheckout,
  getSumUpCheckoutPaymentMethods,
  getSumUpMerchantPaymentMethods,
  hasSumUpPixPaymentMethod,
  isSumUpEnabled,
  processSumUpCheckout,
  resolveSumUpPixPaymentType,
  SumUpError,
} from '../services/sumup-service';
import { reconcileSumUpRechargeById } from '../services/wallet-v2/sumup-recharge.service';

const router = Router();
const walletService = new WalletService(pool);

let cachedWalletV2Flag: { value: boolean; at: number } | null = null;

function extractPixPayload(checkout: Record<string, any>, paymentType: 'qr_code_pix' | 'pix') {
  const rawPayload = checkout?.[paymentType] || checkout?.qr_code_pix || checkout?.pix;
  const artifacts = Array.isArray(rawPayload?.artefacts)
    ? rawPayload.artefacts
    : (Array.isArray(rawPayload?.artifacts) ? rawPayload.artifacts : []);

  const qrArtifact = artifacts.find((artifact: any) => {
    const name = String(artifact?.name || '').toLowerCase();
    return name === 'barcode' || name === 'qr_code' || name === 'qrcode';
  });
  const codeArtifact = artifacts.find((artifact: any) => String(artifact?.name || '').toLowerCase() === 'code');

  const qrImageUrl = rawPayload?.qr_image_url
    ? String(rawPayload.qr_image_url)
    : (rawPayload?.qrCode ? String(rawPayload.qrCode) : (qrArtifact?.location ? String(qrArtifact.location) : null));
  const copyPasteCode = rawPayload?.copy_paste
    ? String(rawPayload.copy_paste)
    : (rawPayload?.copyPaste ? String(rawPayload.copyPaste) : (codeArtifact?.content ? String(codeArtifact.content) : null));

  return {
    payment_type: checkout?.qr_code_pix ? 'qr_code_pix' : (checkout?.pix ? 'pix' : paymentType),
    qr_image_url: qrImageUrl,
    copy_paste: copyPasteCode,
  };
}

export async function isWalletV2Enabled(): Promise<boolean> {
  if (cachedWalletV2Flag && Date.now() - cachedWalletV2Flag.at < 60000) return cachedWalletV2Flag.value;
  let enabled = false;
  try {
    const r = await pool.query("SELECT enabled FROM feature_flags WHERE key = 'WALLET_V2_ENABLED' LIMIT 1");
    enabled = r.rows[0]?.enabled === true;
  } catch {
    enabled = process.env.WALLET_V2_ENABLED === 'true';
  }
  cachedWalletV2Flag = { value: enabled, at: Date.now() };
  return enabled;
}
export function _resetWalletV2Cache() { cachedWalletV2Flag = null; }

router.use(authenticateDriver);

// GET /api/v2/drivers/me/wallet
router.get('/', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    await walletService.ensureWallet(driverId);
    const balance = await walletService.getBalance(driverId);
    res.json({
      success: true,
      data: {
        balance_cents: Number(balance.balance_cents),
        reserved_cents: Number(balance.reserved_cents),
        available_cents: Number(balance.available_cents),
        balance_display: `R$ ${(Number(balance.balance_cents) / 100).toFixed(2).replace('.', ',')}`,
      },
    });
  } catch (err) {
    console.error('[wallet-v2] GET /wallet error:', (err as Error).message);
    res.status(500).json({ success: false, error: 'Erro ao consultar saldo' });
  }
});

// GET /api/v2/drivers/me/wallet/packages
router.get('/packages', async (_req: Request, res: Response) => {
  try {
    const r = await pool.query('SELECT id, label, amount_cents, sort_order FROM recharge_packages WHERE is_active = true ORDER BY sort_order');

    res.json({
      success: true,
      data: r.rows.map(p => ({
        id: p.id,
        label: p.label,
        amount_cents: Number(p.amount_cents),
        wallet_credit_cents: Number(p.amount_cents),
        charged_amount_cents: Number(p.amount_cents),
        provider_fee_estimated_cents: 0,
        fee_label: 'Pix sem taxa adicional',
        family_return_percent: 0,
        family_return_cents: 0,
      })),
      family_return: null,
    });
  } catch (err) {
    console.error('[wallet-v2] GET /packages error:', (err as Error).message);
    res.status(500).json({ success: false, error: 'Erro ao listar pacotes' });
  }
});

// GET /api/v2/drivers/me/wallet/ledger?limit=20&offset=0
router.get('/ledger', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const [entries, countResult] = await Promise.all([
      pool.query(
        'SELECT id, entry_type, balance_delta_cents, reserved_delta_cents, balance_after_cents, reason, reference_type, reference_id, created_at FROM wallet_ledger WHERE driver_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [driverId, limit, offset]
      ),
      pool.query('SELECT COUNT(*) as total FROM wallet_ledger WHERE driver_id = $1', [driverId]),
    ]);

    res.json({
      success: true,
      data: {
        entries: entries.rows.map(e => ({
          ...e,
          balance_delta_cents: Number(e.balance_delta_cents),
          reserved_delta_cents: Number(e.reserved_delta_cents),
          balance_after_cents: Number(e.balance_after_cents),
        })),
        total: Number(countResult.rows[0].total),
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error('[wallet-v2] GET /ledger error:', (err as Error).message);
    res.status(500).json({ success: false, error: 'Erro ao listar lançamentos' });
  }
});

// GET /api/v2/drivers/me/wallet/recharges/:id
router.get('/recharges/:id', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    const reconcileResult = await reconcileSumUpRechargeById(req.params.id, driverId);
    if (reconcileResult.final_status === 'not_found') {
      return res.status(404).json({ success: false, error: 'Recarga não encontrada' });
    }

    const refreshed = await pool.query(
      'SELECT id, amount_cents, status, payment_provider, created_at, confirmed_at FROM wallet_recharges WHERE id = $1 AND driver_id = $2',
      [req.params.id, driverId]
    );
    const row = refreshed.rows[0];
    if (!row) return res.status(404).json({ success: false, error: 'Recarga não encontrada' });

    res.json({
      success: true,
      data: {
        ...row,
        amount_cents: Number(row.amount_cents),
        payment_method: 'pix',
        charged_amount_cents: Number(row.amount_cents),
        wallet_credit_cents: Number(row.amount_cents),
        provider_fee_estimated_cents: 0,
      },
    });
  } catch (err) {
    console.error('[wallet-v2] GET /recharges/:id error:', (err as Error).message);
    res.status(500).json({ success: false, error: 'Erro ao consultar recarga' });
  }
});

// POST /api/v2/drivers/me/wallet/recharge
router.post('/recharge', async (req: Request, res: Response) => {
  try {
    const driverId = (req as any).driverId;
    let sumupStage = 'init';
    let resolvedPixPaymentType: 'qr_code_pix' | 'pix' = 'qr_code_pix';
    const requestedProvider = String(req.body?.payment_provider || 'sumup').toLowerCase();
    const rawPaymentMethod = String(req.body?.payment_method || '').toLowerCase();

    const requestedPaymentMethod = rawPaymentMethod === '' || rawPaymentMethod === 'pix' || rawPaymentMethod === 'sumup_pix'
      ? 'pix'
      : rawPaymentMethod;

    if (requestedProvider !== 'sumup') {
      return res.status(410).json({
        success: false,
        error: 'PROVIDER_UNAVAILABLE',
        message: 'Use a recarga de saldo KAVIAR.',
      });
    }

    if (requestedPaymentMethod !== 'pix') {
      return res.status(503).json({
        success: false,
        error: 'Recarga por cartão está temporariamente indisponível. Use Pix.',
      });
    }

    if (!isSumUpEnabled()) {
      return res.status(503).json({
        success: false,
        error: 'Pix pela SumUp indisponível no momento. Tente novamente em instantes.',
      });
    }

    try {
      sumupStage = 'merchant_payment_methods';
      const methods = await getSumUpMerchantPaymentMethods();
      const methodTags = methods
        .flatMap((method) => [method.id, method.type, method.code, method.method])
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      const merchantHasPix = hasSumUpPixPaymentMethod(methods);
      const merchantPixPaymentType = resolveSumUpPixPaymentType(methods);
      console.info(
        `[WALLET_PIX_SUMUP_STAGE] stage=merchant_payment_methods driver=${driverId} tags=${methodTags.join(',') || 'none'}`
      );
      if (!merchantHasPix || !merchantPixPaymentType) {
        console.warn(
          `[WALLET_PIX_SUMUP_STAGE] stage=merchant_payment_methods_no_pix driver=${driverId} tags=${methodTags.join(',') || 'none'}`
        );
        return res.status(503).json({
          success: false,
          error: 'Pix pela SumUp indisponível no momento. Tente novamente em instantes.',
        });
      }
      resolvedPixPaymentType = merchantPixPaymentType;
    } catch (methodErr) {
      if (methodErr instanceof SumUpError) {
        console.error(
          `[WALLET_PIX_SUMUP_STAGE] stage=${sumupStage} driver=${driverId} sumup_status=${methodErr.statusCode} method=${methodErr.method || 'unknown'} endpoint=${methodErr.endpoint || 'unknown'}`
        );
        return res.status(503).json({
          success: false,
          error: 'Pix pela SumUp indisponível no momento. Tente novamente em instantes.',
        });
      }
      console.error(`[WALLET_RECHARGE_SUMUP_METHODS_FAIL] stage=${sumupStage} driver=${driverId}`);
      return res.status(503).json({
        success: false,
        error: 'Pix pela SumUp indisponível no momento. Tente novamente em instantes.',
      });
    }

    const provider = 'sumup';

    if (!(await isWalletV2Enabled())) {
      return res.status(403).json({ success: false, error: 'Recarga V2 não disponível' });
    }

    const { package_id } = req.body;
    if (!package_id) return res.status(400).json({ success: false, error: 'package_id obrigatório' });

    const pkg = await pool.query('SELECT id, amount_cents, label FROM recharge_packages WHERE id = $1 AND is_active = true', [package_id]);
    if (!pkg.rows[0]) return res.status(400).json({ success: false, error: 'Pacote inválido ou inativo' });

    await pool.query(
      "UPDATE wallet_recharges SET status='expired', updated_at=NOW() WHERE driver_id=$1 AND payment_provider='sumup' AND status='pending' AND created_at < NOW() - INTERVAL '20 minutes'",
      [driverId]
    );

    // Anti-spam: max 3 pending válidas do provedor ativo (SumUp)
    const countRes = await pool.query(
      "SELECT COUNT(*) as c FROM wallet_recharges WHERE driver_id=$1 AND status='pending' AND payment_provider='sumup' AND external_id IS NOT NULL AND created_at > NOW() - INTERVAL '20 minutes'",
      [driverId]
    );
    if (Number(countRes.rows[0].c) >= 3) {
      return res.status(429).json({ success: false, error: 'Aguarde recargas pendentes expirarem' });
    }

    const rechargeId = crypto.randomUUID();
    const amountCents = Number(pkg.rows[0].amount_cents);

    // Insert pending (antes de chamar provider)
    await pool.query(
      "INSERT INTO wallet_recharges (id, driver_id, package_id, amount_cents, status, payment_provider, external_id, created_at, updated_at) VALUES ($1,$2,$3,$4,'pending',$5,NULL,NOW(),NOW())",
      [
        rechargeId,
        driverId,
        package_id,
        amountCents,
        provider,
      ]
    );

    try {
      sumupStage = 'create_checkout';
      const checkout = await createSumUpCheckout({
        checkout_reference: `wallet_v2:${rechargeId}`,
        amount: amountCents / 100,
        currency: 'BRL',
        description: `KAVIAR: Recarga saldo ${pkg.rows[0].label}`,
        hosted_checkout: { enabled: true },
      });

      await pool.query(
        "UPDATE wallet_recharges SET external_id=$2, updated_at=NOW() WHERE id=$1",
        [rechargeId, checkout.id]
      );

      sumupStage = 'checkout_payment_methods_telemetry';
      try {
        const checkoutMethods = await getSumUpCheckoutPaymentMethods(checkout.id);
        const checkoutMethodsLower = checkoutMethods
          .flatMap((method) => [method.id, method.type, method.code, method.method])
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        const checkoutPixPaymentType = resolveSumUpPixPaymentType(checkoutMethods);
        console.info(
          `[WALLET_PIX_SUMUP_STAGE] stage=checkout_payment_methods driver=${driverId} recharge=${rechargeId} checkout=${checkout.id} tags=${checkoutMethodsLower.join(',') || 'none'}`
        );
        if (!checkoutPixPaymentType) {
          console.warn(
            `[WALLET_PIX_SUMUP_STAGE] stage=checkout_payment_methods_no_pix driver=${driverId} recharge=${rechargeId} checkout=${checkout.id} tags=${checkoutMethodsLower.join(',') || 'none'}`
          );
        } else {
          resolvedPixPaymentType = checkoutPixPaymentType;
        }
      } catch (checkoutMethodsErr) {
        if (checkoutMethodsErr instanceof SumUpError) {
          console.warn(
            `[WALLET_PIX_SUMUP_STAGE] stage=checkout_payment_methods_error driver=${driverId} recharge=${rechargeId} checkout=${checkout.id} sumup_status=${checkoutMethodsErr.statusCode} method=${checkoutMethodsErr.method || 'unknown'} endpoint=${checkoutMethodsErr.endpoint || 'unknown'}`
          );
        } else {
          console.warn(
            `[WALLET_PIX_SUMUP_STAGE] stage=checkout_payment_methods_error driver=${driverId} recharge=${rechargeId} checkout=${checkout.id}`
          );
        }
      }

      const pixPaymentType = resolvedPixPaymentType;
      sumupStage = `process_checkout_${pixPaymentType}`;
      const processedCheckout = await processSumUpCheckout(checkout.id, { payment_type: pixPaymentType });
      sumupStage = 'extract_pix_payload';
      const pixPayload = extractPixPayload(processedCheckout as Record<string, any>, pixPaymentType);
      console.info(
        `[WALLET_PIX_SUMUP_STAGE] stage=extract_pix_payload driver=${driverId} recharge=${rechargeId} checkout=${checkout.id} payment_type=${pixPaymentType} has_qr_image=${Boolean(pixPayload.qr_image_url)} has_copy_paste=${Boolean(pixPayload.copy_paste)}`
      );
      if (!pixPayload.qr_image_url && !pixPayload.copy_paste) {
        await pool.query("UPDATE wallet_recharges SET status='expired', updated_at=NOW() WHERE id=$1", [rechargeId]);
        return res.status(502).json({
          success: false,
          error: 'QR Code Pix indisponível no momento. Tente novamente.',
        });
      }

      return res.json({
        success: true,
        data: {
          rechargeId,
          amount_cents: amountCents,
          wallet_credit_cents: amountCents,
          charged_amount_cents: amountCents,
          provider_fee_estimated_cents: 0,
          fee_label: 'Pix sem taxa adicional',
          payment_provider: 'sumup',
          payment_method: 'pix',
          checkout: {
            id: checkout.id,
            checkout_reference: checkout.checkout_reference || null,
            url: null,
            status: processedCheckout.status || checkout.status || null,
          },
          pix: pixPayload,
        },
      });
    } catch (sumupErr) {
      await pool.query("UPDATE wallet_recharges SET status='expired', updated_at=NOW() WHERE id=$1", [rechargeId]);
      if (sumupErr instanceof SumUpError) {
        console.error(
          `[WALLET_RECHARGE_SUMUP_FAIL] stage=${sumupStage} driver=${driverId} recharge=${rechargeId} sumup_status=${sumupErr.statusCode} method=${sumupErr.method || 'unknown'} endpoint=${sumupErr.endpoint || 'unknown'}`
        );
        if (sumupStage.startsWith('process_checkout_')) {
          return res.status(503).json({
            success: false,
            error: 'Pix pela SumUp indisponível no momento. Tente novamente em instantes.',
          });
        }
        const status = sumupErr.statusCode === 429 ? 429 : (sumupErr.statusCode >= 500 ? 502 : 400);
        return res.status(status).json({ success: false, error: sumupErr.safeMessage });
      }
      console.error(`[WALLET_RECHARGE_SUMUP_FAIL] stage=${sumupStage} driver=${driverId} recharge=${rechargeId}`);
      return res.status(502).json({ success: false, error: 'Erro ao criar checkout de pagamento. Tente novamente.' });
    }

  } catch (err) {
    console.error('[wallet-v2] POST /recharge error:', (err as Error).message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export default router;
