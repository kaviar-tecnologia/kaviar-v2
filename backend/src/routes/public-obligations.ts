/**
 * Public endpoints for company self-service payment flow.
 * No JWT auth required — access controlled by obligation token.
 *
 * Base: /api/public/obligations/:token
 */
import { Router, Request, Response } from 'express';
import { PrismaClient, accounting_obligation_status } from '@prisma/client';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { validateObligationToken, auditObligation } from '../services/accounting/accounting-obligation-tokens.service';
import { generatePresignedGetUrl, getFileExtension, MAX_FILE_SIZE, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS } from '../services/accounting/accounting-document-storage.service';
import rateLimit from 'express-rate-limit';

const prisma = new PrismaClient();
const router = Router();

const BUCKET = process.env.S3_UPLOADS_BUCKET || 'kaviar-uploads-847895361928';
const REGION = process.env.AWS_REGION || 'us-east-2';
const s3Client = new S3Client({ region: REGION });

// Rate limit: 30 requests per minute per IP
const tokenRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, error: 'Muitas requisições. Tente novamente em breve.' },
  skip: () => process.env.NODE_ENV === 'test',
});
router.use(tokenRateLimit);

// Helper
function toDateStr(d: any): string | null { if (!d) return null; const dt = new Date(d); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`; }
function toIso(d: any): string | null { return d ? (d instanceof Date ? d.toISOString() : String(d)) : null; }

function serializeForCompany(ob: any) {
  return {
    id: ob.id,
    description: ob.description,
    beneficiary: ob.beneficiary,
    obligation_type: ob.obligation_type,
    status: ob.status,
    amount_cents: ob.amount_cents,
    amount_display: `R$ ${(ob.amount_cents / 100).toFixed(2).replace('.', ',')}`,
    due_date: toDateStr(ob.due_date),
    issued_at: toDateStr(ob.issued_at),
    barcode: ob.barcode,
    pix_key: ob.pix_key,
    notes: ob.notes,
    reference_number: ob.reference_number,
    has_boleto: !!ob.boleto_file_id,
    has_proof: !!ob.proof_file_id,
    rejection_reason: ob.rejection_reason,
    paid_at: toIso(ob.paid_at),
    legal_entity: ob.legal_entity ? { razao_social: ob.legal_entity.razao_social } : undefined,
    // Never expose: file IDs, internal IDs, accountant data
  };
}

/**
 * GET /api/public/obligations/:token
 * View obligation details (company self-service).
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    const result = await validateObligationToken(token);
    if (!result.valid) {
      return res.status(403).json({ success: false, error: result.error });
    }

    await auditObligation({
      obligationId: result.obligation.id,
      action: 'VIEWED_BY_COMPANY',
      actorType: 'COMPANY',
      ip: clientIp,
      userAgent: req.headers['user-agent'],
    });

    // Auto-transition: SENT_TO_COMPANY → VIEWED
    if (result.obligation.status === 'SENT_TO_COMPANY') {
      await prisma.accounting_payment_obligations.update({
        where: { id: result.obligation.id },
        data: { status: 'VIEWED', viewed_at: new Date(), action_owner: 'COMPANY' },
      });
      result.obligation.status = 'VIEWED';
    }

    res.json({ success: true, data: serializeForCompany(result.obligation) });
  } catch (err: any) {
    console.error('[public-obligations] view error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * GET /api/public/obligations/:token/boleto
 * Download boleto (presigned URL).
 */
router.get('/:token/boleto', async (req: Request, res: Response) => {
  try {
    const result = await validateObligationToken(req.params.token);
    if (!result.valid) return res.status(403).json({ success: false, error: result.error });

    const ob = result.obligation;
    if (!ob.boleto_file_id) return res.status(404).json({ success: false, error: 'Boleto não disponível' });

    const file = await prisma.accounting_company_document_files.findUnique({
      where: { id: ob.boleto_file_id },
    });
    if (!file) return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });

    const { downloadUrl, expiresInSeconds } = await generatePresignedGetUrl({
      storageKey: file.storage_key,
      originalFilename: file.original_filename,
    });

    await auditObligation({
      obligationId: ob.id,
      action: 'BOLETO_DOWNLOADED',
      actorType: 'COMPANY',
      ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: { download_url: downloadUrl, filename: file.original_filename, expires_in_seconds: expiresInSeconds } });
  } catch (err: any) {
    console.error('[public-obligations] boleto download error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /api/public/obligations/:token/mark-paid
 * Company marks obligation as paid.
 */
router.post('/:token/mark-paid', async (req: Request, res: Response) => {
  try {
    const result = await validateObligationToken(req.params.token);
    if (!result.valid) return res.status(403).json({ success: false, error: result.error });

    const ob = result.obligation;
    const allowedStatuses = ['VIEWED', 'SCHEDULED'];
    if (!allowedStatuses.includes(ob.status)) {
      return res.status(400).json({ success: false, error: `Não é possível marcar como pago no status atual: ${ob.status}` });
    }

    const paidDate = req.body.paid_date;
    const paidAt = paidDate ? new Date(paidDate + 'T12:00:00Z') : new Date();

    await prisma.accounting_payment_obligations.update({
      where: { id: ob.id },
      data: { status: 'PAID', paid_at: paidAt, action_owner: 'COMPANY' },
    });

    await auditObligation({
      obligationId: ob.id,
      action: 'PAYMENT_INFORMED',
      actorType: 'COMPANY',
      details: { paid_date: paidDate || new Date().toISOString().slice(0, 10) },
      ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: { message: 'Pagamento registrado com sucesso.' } });
  } catch (err: any) {
    console.error('[public-obligations] mark-paid error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /api/public/obligations/:token/mark-scheduled
 * Company marks payment as scheduled.
 */
router.post('/:token/mark-scheduled', async (req: Request, res: Response) => {
  try {
    const result = await validateObligationToken(req.params.token);
    if (!result.valid) return res.status(403).json({ success: false, error: result.error });

    const ob = result.obligation;
    if (ob.status !== 'VIEWED') {
      return res.status(400).json({ success: false, error: 'Só é possível programar quando a obrigação foi visualizada' });
    }

    await prisma.accounting_payment_obligations.update({
      where: { id: ob.id },
      data: { status: 'SCHEDULED', scheduled_at: new Date(), action_owner: 'COMPANY' },
    });

    await auditObligation({ obligationId: ob.id, action: 'PAYMENT_SCHEDULED', actorType: 'COMPANY', ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown' });

    res.json({ success: true, data: { message: 'Pagamento programado.' } });
  } catch (err: any) {
    console.error('[public-obligations] mark-scheduled error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * POST /api/public/obligations/:token/upload-proof
 * Company uploads payment proof (multipart).
 */
router.post('/:token/upload-proof', async (req: Request, res: Response) => {
  try {
    const result = await validateObligationToken(req.params.token);
    if (!result.valid) return res.status(403).json({ success: false, error: result.error });

    const ob = result.obligation;
    const allowedStatuses = ['PAID', 'REJECTED'];
    if (!allowedStatuses.includes(ob.status)) {
      return res.status(400).json({ success: false, error: 'Envio de comprovante só é permitido após informar o pagamento' });
    }

    // Set up multer for proof upload
    let storageKey = '';
    const upload = multer({
      storage: multerS3({
        s3: s3Client,
        bucket: BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (_r: any, file: Express.Multer.File, cb: any) => {
          const ext = getFileExtension(file.originalname);
          const nonce = crypto.randomBytes(8).toString('hex');
          storageKey = `accounting-proofs/${ob.id}/${nonce}${ext}`;
          cb(null, storageKey);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_r: any, file: Express.Multer.File, cb: any) => {
        const allowedProofTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
        if (!allowedProofTypes.has(file.mimetype)) return cb(new Error('Tipo não permitido. Use PDF, JPEG ou PNG.'));
        cb(null, true);
      },
    }).single('file');

    await new Promise<void>((resolve, reject) => {
      upload(req, res, (err: any) => { if (err) reject(err); else resolve(); });
    });

    const uploadedFile = (req as any).file;
    if (!uploadedFile) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });

    // Create file record
    const sha256 = crypto.createHash('sha256').update(`${storageKey}:${uploadedFile.size}:${Date.now()}`).digest('hex');
    const fileRecord = await prisma.accounting_company_document_files.create({
      data: {
        document_id: (await prisma.accounting_company_documents.findFirst({ where: { legal_entity_id: ob.legal_entity_id }, select: { id: true } }))?.id || ob.id,
        version_number: 1,
        original_filename: uploadedFile.originalname,
        storage_key: storageKey,
        mime_type: uploadedFile.mimetype,
        size_bytes: uploadedFile.size,
        sha256,
        uploaded_by_accountant_id: null,
        uploaded_by_admin_id: null,
        scan_status: 'NOT_SCANNED',
        replacement_reason: 'Comprovante de pagamento enviado pela empresa',
      },
    });

    // Update obligation
    await prisma.accounting_payment_obligations.update({
      where: { id: ob.id },
      data: {
        proof_file_id: fileRecord.id,
        proof_uploaded_at: new Date(),
        status: 'PROOF_UPLOADED',
        action_owner: 'ACCOUNTANT',
      },
    });

    await auditObligation({
      obligationId: ob.id,
      action: 'PROOF_UPLOADED',
      actorType: 'COMPANY',
      details: { filename: uploadedFile.originalname, size: uploadedFile.size },
      ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: { message: 'Comprovante enviado com sucesso. O contador será notificado.' } });
  } catch (err: any) {
    if (err.message?.includes('não permitid') || err.message?.includes('Tipo')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error('[public-obligations] upload-proof error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

/**
 * GET /api/public/obligations/:token/audit
 * Company can see the timeline of their obligation.
 */
router.get('/:token/audit', async (req: Request, res: Response) => {
  try {
    const result = await validateObligationToken(req.params.token);
    if (!result.valid) return res.status(403).json({ success: false, error: result.error });

    const audit = await prisma.accounting_obligation_audit.findMany({
      where: { obligation_id: result.obligation.id },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: audit.map(a => ({ action: a.action, actor_type: a.actor_type, created_at: a.created_at })) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const publicObligationsRoutes = router;
export default router;
