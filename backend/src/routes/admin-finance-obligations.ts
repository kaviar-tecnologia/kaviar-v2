/**
 * Admin Finance — Obrigações (Contas a Pagar) — READ-ONLY.
 *
 * Visão consolidada, para a KAVIAR, das obrigações enviadas pelo Portal do Contador.
 * Reutiliza o MESMO modelo `accounting_payment_obligations`, o MESMO lifecycle e os
 * MESMOS mecanismos seguros de download (presigned URL) já usados pelo portal.
 *
 * Segurança:
 *   - authenticateAdmin + allowFinanceAccess (SUPER_ADMIN, EXECUTIVE_ADMIN, FINANCE)
 *   - Isolamento por legal_entity: SEMPRE fixado na entidade KAVIAR.
 *   - Não expõe DRAFT (visão da empresa começa em SENT_TO_COMPANY).
 *   - Não expõe tokens, hashes, storage keys ou dados bancários desnecessários.
 *
 * NÃO há endpoint de transição de estado aqui: a máquina de estados existente é
 * operada pelo Portal do Contador e pelo fluxo público da empresa (via token).
 * Esta rota é estritamente de leitura + downloads seguros.
 *
 * Rotas (base /api/admin/finance/obligations):
 *   GET  /                       — lista obrigações visíveis à empresa (>= SENT_TO_COMPANY)
 *   GET  /summary                — cards de resumo (pendentes, vencendo, vencidas, pagas, total)
 *   GET  /:id                    — detalhe de uma obrigação
 *   GET  /:id/download-boleto    — presigned URL do boleto/guia
 *   GET  /:id/download-invoice-pdf — presigned URL da NF (PDF)
 *   GET  /:id/download-invoice-xml — presigned URL da NF (XML)
 *   GET  /:id/download-proof     — presigned URL do comprovante
 */

import { Router, Request, Response } from 'express';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { generatePresignedGetUrl } from '../services/accounting/accounting-document-storage.service';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

// UUID fixo da legal_entity KAVIAR (ver migration 20260805163000_fix_kaviar_entity_uuid).
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
};

// ── Endpoints ───────────────────────────────────────────────────────────

// GET / — lista obrigações visíveis à empresa KAVIAR
router.get('/', async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;

    // Nunca permitir consultar DRAFT (nem via filtro explícito).
    const statusIn =
      statusFilter && (COMPANY_VISIBLE_STATUSES as readonly string[]).includes(statusFilter)
        ? [statusFilter]
        : [...COMPANY_VISIBLE_STATUSES];

    const obligations = await prisma.accounting_payment_obligations.findMany({
      where: {
        legal_entity_id: KAVIAR_LEGAL_ENTITY_ID,
        status: { in: statusIn as any },
      },
      include: INCLUDE,
      orderBy: [{ due_date: 'asc' }],
      take: 200,
    });

    res.json({ success: true, data: obligations.map(serializeForAdmin) });
  } catch (err: any) {
    console.error('[admin-obligations] list error:', err?.message);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// GET /summary — cards de resumo
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const all = await prisma.accounting_payment_obligations.findMany({
      where: {
        legal_entity_id: KAVIAR_LEGAL_ENTITY_ID,
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
  if (ob.legal_entity_id !== KAVIAR_LEGAL_ENTITY_ID) return { forbidden: true as const };
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

export const adminFinanceObligationsRoutes = router;
export default router;
