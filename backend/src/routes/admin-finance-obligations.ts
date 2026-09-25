/**
 * Admin Finance — Obrigações (Contas a Pagar) — READ-ONLY.
 *
 * Visão da matriz KAVIAR e de suas filiais diretas, com filtro opcional por CNPJ.
 * Reutiliza o MESMO modelo `accounting_payment_obligations`, o MESMO lifecycle e os
 * MESMOS mecanismos seguros de download (presigned URL) já usados pelo portal.
 *
 * Segurança:
 *   - authenticateAdmin + allowFinanceAccess (SUPER_ADMIN, EXECUTIVE_ADMIN, FINANCE)
 *   - Isolamento: apenas a matriz KAVIAR configurada e suas filiais diretas.
 *   - Não expõe DRAFT (visão da empresa começa em SENT_TO_COMPANY).
 *   - Não expõe tokens, hashes, storage keys ou dados bancários desnecessários.
 *
 * Reutiliza a máquina de estados existente para marcar pagamento e anexar comprovante.
 * Não inicia transferências bancárias nem libera pagamentos automáticos.
 *
 * Rotas (base /api/admin/finance/obligations):
 *   GET  /entities               — matriz e filiais no escopo autorizado
 *   GET  /                       — lista obrigações visíveis à empresa (>= SENT_TO_COMPANY)
 *   GET  /summary                — cards de resumo (pendentes, vencendo, vencidas, pagas, total)
 *   GET  /:id                    — detalhe de uma obrigação
 *   GET  /:id/download-boleto    — presigned URL do boleto/guia
 *   GET  /:id/download-invoice-pdf — presigned URL da NF (PDF)
 *   GET  /:id/download-invoice-xml — presigned URL da NF (XML)
 *   GET  /:id/download-proof     — presigned URL do comprovante
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { generatePresignedGetUrl, getFileExtension, MAX_FILE_SIZE } from '../services/accounting/accounting-document-storage.service';
import {
  markObligationPaid,
  recordProofUploaded,
  assertProofUploadAllowed,
  ObligationActionError,
  PROOF_ALLOWED_MIME,
} from '../services/accounting/accounting-obligation-actions.service';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

const BUCKET = process.env.S3_UPLOADS_BUCKET || process.env.AWS_S3_BUCKET || 'kaviar-uploads-847895361928';
const REGION = process.env.AWS_REGION || 'us-east-2';
const s3Client = new S3Client({ region: REGION });

// ID da matriz KAVIAR; filiais diretas são reconhecidas por parent_entity_id.
// Configurável por env para outros ambientes, com fallback para o valor de produção.
const KAVIAR_LEGAL_ENTITY_ID =
  process.env.KAVIAR_LEGAL_ENTITY_ID || '884907ff-5b04-4dfa-8613-a23216c5fa25';

// Status que a empresa (KAVIAR) pode ver. DRAFT fica oculto — a visão começa em SENT_TO_COMPANY.
export const COMPANY_VISIBLE_STATUSES = [
  'SENT_TO_COMPANY',
  'VIEWED',
  'SCHEDULED',
  'PAID',
  'PROOF_UPLOADED',
  'UNDER_VERIFICATION',
  'VERIFIED',
  'RECONCILED',
  'REJECTED',
] as const;

// Statuses que ainda aguardam pagamento (para métricas).
const AWAITING_PAYMENT_STATUSES = ['SENT_TO_COMPANY', 'VIEWED', 'SCHEDULED'];

// ── Helpers de serialização (alinhados ao serializer do portal) ─────────

function toIso(d: any): string | null {
  return d ? (d instanceof Date ? d.toISOString() : String(d)) : null;
}
function toDateStr(d: any): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// Tradução do status técnico para rótulo de UI (visão da empresa).
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    SENT_TO_COMPANY: 'Aguardando pagamento',
    VIEWED: 'Aguardando pagamento',
    SCHEDULED: 'Pagamento agendado',
    PAID: 'Pago',
    PROOF_UPLOADED: 'Comprovante enviado',
    UNDER_VERIFICATION: 'Em verificação',
    VERIFIED: 'Verificado',
    RECONCILED: 'Conciliado',
    REJECTED: 'Comprovante rejeitado',
  };
  return map[status] || status;
}

// Responsável pela próxima ação (rótulo de UI).
function actionOwnerLabel(owner: string): string {
  if (owner === 'COMPANY') return 'KAVIAR';
  if (owner === 'ACCOUNTANT') return 'Contador';
  return owner;
}

// Situação de vencimento (mesma lógica do portal).
export function computeDueStatus(dueDate: any, status: string): string {
  if (['RECONCILED', 'CANCELED', 'VERIFIED'].includes(status)) return 'CLOSED';
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'OVERDUE';
  if (diffDays === 0) return 'DUE_TODAY';
  if (diffDays <= 7) return 'DUE_SOON';
  return 'OK';
}

// Serializer para a visão admin — expõe apenas o necessário (nunca storage keys/tokens/hashes).
export function serializeForAdmin(o: any) {
  return {
    id: o.id,
    legal_entity_id: o.legal_entity_id,
    legal_entity: o.legal_entity ? {
      id: o.legal_entity.id,
      razao_social: o.legal_entity.razao_social,
      nome_fantasia: o.legal_entity.nome_fantasia ?? null,
      cnpj: o.legal_entity.cnpj,
      entity_type: o.legal_entity.entity_type,
    } : null,
    obligation_type: o.obligation_type,
    status: o.status,
    status_label: statusLabel(o.status),
    action_owner: o.action_owner,
    action_owner_label: actionOwnerLabel(o.action_owner),
    description: o.description,
    beneficiary: o.beneficiary,
    reference_number: o.reference_number,
    competence_month: o.competence_month,
    competence_year: o.competence_year,
    competence_display:
      o.competence_month && o.competence_year
        ? `${String(o.competence_month).padStart(2, '0')}/${o.competence_year}`
        : null,
    amount_cents: o.amount_cents,
    amount_display: `R$ ${(o.amount_cents / 100).toFixed(2).replace('.', ',')}`,
    issued_at: toDateStr(o.issued_at),
    due_date: toDateStr(o.due_date),
    due_status: computeDueStatus(o.due_date, o.status),
    // Origem: sempre Portal do Contador (obrigações vêm exclusivamente desse fluxo).
    origin: 'PORTAL_CONTADOR',
    origin_label: 'Portal do Contador',
    // Existência de documentos (booleanos apenas — sem storage keys).
    has_boleto: !!o.boleto_storage_key,
    boleto_filename: o.boleto_filename || null,
    has_invoice: !!(o.invoice_pdf_storage_key || o.invoice_xml_storage_key || o.invoice_number),
    has_invoice_pdf: !!o.invoice_pdf_storage_key,
    has_invoice_xml: !!o.invoice_xml_storage_key,
    invoice_number: o.invoice_number || null,
    invoice_series: o.invoice_series || null,
    has_proof: !!o.proof_storage_key,
    // Situação do pagamento (timestamps relevantes).
    sent_at: toIso(o.sent_at),
    viewed_at: toIso(o.viewed_at),
    scheduled_at: toIso(o.scheduled_at),
    paid_at: toIso(o.paid_at),
    proof_uploaded_at: toIso(o.proof_uploaded_at),
    verified_at: toIso(o.verified_at),
    reconciled_at: toIso(o.reconciled_at),
    rejection_reason: o.rejection_reason || null,
    created_at: toIso(o.created_at),
    updated_at: toIso(o.updated_at),
    created_by: o.created_by_accountant ? { nome_completo: o.created_by_accountant.nome_completo } : null,
  };
}

const INCLUDE = {
  created_by_accountant: { select: { nome_completo: true } },
  legal_entity: {
    select: {
      id: true,
      razao_social: true,
      nome_fantasia: true,
      cnpj: true,
      entity_type: true,
      parent_entity_id: true,
    },
  },
};

// Escopo independente do parâmetro enviado pelo cliente: nunca consulta CNPJ
// alheio à matriz KAVIAR, inclusive em detalhes, downloads e ações de pagamento.
const COMPANY_ENTITY_WHERE = {
  OR: [
    { id: KAVIAR_LEGAL_ENTITY_ID },
    { parent_entity_id: KAVIAR_LEGAL_ENTITY_ID, entity_type: 'FILIAL' as const },
  ],
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePageParameter(raw: unknown, fallback: number, max: number): number | null {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= max ? value : null;
}

function parseEntityFilter(raw: unknown): { legal_entity_id?: string } | null {
  if (raw === undefined) return {};
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw)) return null;
  return { legal_entity_id: raw };
}

function companyObligationsWhere(entityFilter: { legal_entity_id?: string }) {
  return {
    legal_entity: { is: COMPANY_ENTITY_WHERE },
    ...entityFilter,
  };
}

function isOwnedObligation(o: any): boolean {
  return o.legal_entity_id === KAVIAR_LEGAL_ENTITY_ID ||
    (o.legal_entity?.id === o.legal_entity_id &&
      o.legal_entity?.entity_type === 'FILIAL' &&
      o.legal_entity?.parent_entity_id === KAVIAR_LEGAL_ENTITY_ID);
}

router.get('/entities', async (_req: Request, res: Response) => {
  try {
    const entities = await prisma.legal_entities.findMany({
      where: COMPANY_ENTITY_WHERE,
      select: {
        id: true, razao_social: true, nome_fantasia: true, cnpj: true,
        entity_type: true, parent_entity_id: true, is_active: true,
      },
      orderBy: [{ entity_type: 'desc' }, { razao_social: 'asc' }],
    });
    return res.json({ success: true, data: entities });
  } catch (err: any) {
    console.error('[admin-obligations] entities error:', err?.message);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ── Endpoints ───────────────────────────────────────────────────────────

// GET / — lista obrigações visíveis à empresa KAVIAR
router.get('/', async (req: Request, res: Response) => {
  try {
    const entityFilter = parseEntityFilter(req.query.legal_entity_id);
    if (!entityFilter) return res.status(400).json({ success: false, error: 'legal_entity_id inválido' });
    const page = parsePageParameter(req.query.page, 1, 10000);
    const limit = parsePageParameter(req.query.limit, 50, 100);
    if (page === null || limit === null) {
      return res.status(400).json({ success: false, error: 'Paginação inválida' });
    }
    const statusFilter = req.query.status as string | undefined;

    // Nunca permitir consultar DRAFT (nem via filtro explícito).
    const statusIn =
      statusFilter && (COMPANY_VISIBLE_STATUSES as readonly string[]).includes(statusFilter)
        ? [statusFilter]
        : [...COMPANY_VISIBLE_STATUSES];

    const where = {
      ...companyObligationsWhere(entityFilter),
      status: { in: statusIn as any },
    };
    const [obligations, total] = await Promise.all([
      prisma.accounting_payment_obligations.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ due_date: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.accounting_payment_obligations.count({ where }),
    ]);

    res.json({
      success: true,
      data: obligations.map(serializeForAdmin),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[admin-obligations] list error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /summary — cards de resumo
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const entityFilter = parseEntityFilter(req.query.legal_entity_id);
    if (!entityFilter) return res.status(400).json({ success: false, error: 'legal_entity_id inválido' });
    const all = await prisma.accounting_payment_obligations.findMany({
      where: {
        ...companyObligationsWhere(entityFilter),
        status: { in: [...COMPANY_VISIBLE_STATUSES] as any },
      },
      select: { status: true, due_date: true, amount_cents: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isAwaiting = (s: string) => AWAITING_PAYMENT_STATUSES.includes(s);

    const pending = all.filter(o => isAwaiting(o.status));
    const overdue = pending.filter(o => new Date(o.due_date) < today);
    const dueSoon = pending.filter(o => {
      const diff = Math.floor((new Date(o.due_date).getTime() - today.getTime()) / 86400000);
      return diff >= 0 && diff <= 7;
    });
    const paid = all.filter(o => ['PAID', 'PROOF_UPLOADED', 'UNDER_VERIFICATION', 'VERIFIED', 'RECONCILED'].includes(o.status));

    const totalPendingCents = pending.reduce((acc, o) => acc + o.amount_cents, 0);

    res.json({
      success: true,
      data: {
        total: all.length,
        pending: pending.length,
        due_soon: dueSoon.length,
        overdue: overdue.length,
        paid: paid.length,
        total_pending_cents: totalPendingCents,
        total_pending_display: `R$ ${(totalPendingCents / 100).toFixed(2).replace('.', ',')}`,
      },
    });
  } catch (err: any) {
    console.error('[admin-obligations] summary error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Carrega uma obrigação garantindo isolamento por entidade + visibilidade (não-DRAFT).
async function loadVisibleObligation(id: string) {
  const ob = await prisma.accounting_payment_obligations.findUnique({
    where: { id },
    include: INCLUDE,
  });
  if (!ob) return { notFound: true as const };
  if (!isOwnedObligation(ob)) return { forbidden: true as const };
  if (!(COMPANY_VISIBLE_STATUSES as readonly string[]).includes(ob.status)) return { forbidden: true as const };
  return { ob };
}

// GET /:id — detalhe
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const r = await loadVisibleObligation(req.params.id);
    if ('notFound' in r) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });
    if ('forbidden' in r) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });
    res.json({ success: true, data: serializeForAdmin(r.ob) });
  } catch (err: any) {
    console.error('[admin-obligations] detail error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Gera resposta de download seguro (presigned URL) para uma chave/nome.
async function respondDownload(res: Response, storageKey: string | null, filename: string | null, fallback: string, notAvailableMsg: string) {
  if (!storageKey) return res.status(404).json({ success: false, error: notAvailableMsg });
  const { downloadUrl, expiresInSeconds } = await generatePresignedGetUrl({
    storageKey,
    originalFilename: filename || fallback,
  });
  return res.json({ success: true, data: { download_url: downloadUrl, filename, expires_in_seconds: expiresInSeconds } });
}

// GET /:id/download-boleto
router.get('/:id/download-boleto', async (req: Request, res: Response) => {
  try {
    const r = await loadVisibleObligation(req.params.id);
    if ('notFound' in r || 'forbidden' in r) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });
    return respondDownload(res, r.ob.boleto_storage_key, r.ob.boleto_filename, 'boleto.pdf', 'Boleto não disponível');
  } catch (err: any) {
    console.error('[admin-obligations] download-boleto error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /:id/download-invoice-pdf
router.get('/:id/download-invoice-pdf', async (req: Request, res: Response) => {
  try {
    const r = await loadVisibleObligation(req.params.id);
    if ('notFound' in r || 'forbidden' in r) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });
    return respondDownload(res, r.ob.invoice_pdf_storage_key, r.ob.invoice_pdf_filename, 'nota-fiscal.pdf', 'PDF da nota fiscal não disponível');
  } catch (err: any) {
    console.error('[admin-obligations] download-invoice-pdf error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /:id/download-invoice-xml
router.get('/:id/download-invoice-xml', async (req: Request, res: Response) => {
  try {
    const r = await loadVisibleObligation(req.params.id);
    if ('notFound' in r || 'forbidden' in r) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });
    return respondDownload(res, r.ob.invoice_xml_storage_key, r.ob.invoice_xml_filename, 'nota-fiscal.xml', 'XML da nota fiscal não disponível');
  } catch (err: any) {
    console.error('[admin-obligations] download-invoice-xml error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /:id/download-proof
router.get('/:id/download-proof', async (req: Request, res: Response) => {
  try {
    const r = await loadVisibleObligation(req.params.id);
    if ('notFound' in r || 'forbidden' in r) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });
    return respondDownload(res, r.ob.proof_storage_key, r.ob.proof_filename, 'comprovante.pdf', 'Comprovante não disponível');
  } catch (err: any) {
    console.error('[admin-obligations] download-proof error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// POST /:id/mark-paid — KAVIAR informa que o pagamento foi realizado
router.post('/:id/mark-paid', async (req: Request, res: Response) => {
  try {
    const r = await loadVisibleObligation(req.params.id);
    if ('notFound' in r || 'forbidden' in r) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const admin = (req as any).admin;
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    const updated = await markObligationPaid({
      obligation: { id: r.ob.id, status: r.ob.status },
      paidDate: req.body?.paid_date,
      // KAVIAR é a empresa: actorType COMPANY (padrão do schema), com atribuição do admin.
      actor: {
        type: 'COMPANY',
        ip,
        userAgent: req.headers['user-agent'],
        extraDetails: { channel: 'ADMIN', admin_id: admin?.id, admin_role: admin?.role },
      },
    });

    res.json({ success: true, data: serializeForAdmin({ ...r.ob, ...updated }) });
  } catch (err: any) {
    if (err instanceof ObligationActionError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    console.error('[admin-obligations] mark-paid error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// POST /:id/upload-proof — KAVIAR anexa comprovante (multipart). Só após PAID/REJECTED.
router.post('/:id/upload-proof', async (req: Request, res: Response) => {
  try {
    const r = await loadVisibleObligation(req.params.id);
    if ('notFound' in r || 'forbidden' in r) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const ob = r.ob;

    // Valida estado ANTES de aceitar o arquivo (mesma regra do fluxo público).
    try {
      assertProofUploadAllowed(ob.status);
    } catch (e: any) {
      if (e instanceof ObligationActionError) return res.status(e.status).json({ success: false, error: e.message });
      throw e;
    }

    // Upload seguro para S3 — mesmo bucket/prefixo, MIME e limite de tamanho do fluxo público.
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
        if (!PROOF_ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Tipo não permitido. Use PDF, JPEG ou PNG.'));
        cb(null, true);
      },
    }).single('file');

    await new Promise<void>((resolve, reject) => {
      upload(req, res, (err: any) => { if (err) reject(err); else resolve(); });
    });

    const uploadedFile = (req as any).file;
    if (!uploadedFile) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });

    const admin = (req as any).admin;
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    const updated = await recordProofUploaded({
      obligationId: ob.id,
      currentStatus: ob.status,
      file: {
        storageKey,
        filename: uploadedFile.originalname,
        mimeType: uploadedFile.mimetype,
        sizeBytes: uploadedFile.size,
      },
      actor: {
        type: 'COMPANY',
        ip,
        userAgent: req.headers['user-agent'],
        extraDetails: { channel: 'ADMIN', admin_id: admin?.id, admin_role: admin?.role },
      },
    });

    res.json({ success: true, data: serializeForAdmin({ ...ob, ...updated }) });
  } catch (err: any) {
    if (err instanceof ObligationActionError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    if (err.message?.includes('não permitid') || err.message?.includes('Tipo')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error('[admin-obligations] upload-proof error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno no upload' });
  }
});

export const adminFinanceObligationsRoutes = router;
export default router;
