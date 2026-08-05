import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyEntityAccess, getAccessibleEntityIds } from '../services/accounting/accounting-documents.service';
import { computeFiscalHealth } from '../services/accounting/accounting-fiscal-health.service';

const prisma = new PrismaClient();
const router = Router();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const createCertificateSchema = z.object({
  legal_entity_id: z.string().uuid(),
  certificate_type: z.enum(['E_CNPJ_A1', 'E_CNPJ_A3', 'E_CPF_A1', 'E_CPF_A3', 'NF_E', 'OTHER']),
  mode: z.enum(['EXTERNAL', 'METADATA_ONLY', 'KAVIAR_MANAGED']).default('METADATA_ONLY'),
  holder_name: z.string().trim().min(2).max(200),
  holder_document: z.string().trim().max(20).nullish().transform(v => v || null),
  serial_number: z.string().trim().max(100).nullish().transform(v => v || null),
  issuer: z.string().trim().max(200).nullish().transform(v => v || null),
  issued_at: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  expires_at: z.string().datetime(),
  storage_location: z.string().trim().max(500).nullish().transform(v => v || null),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
}).strict();

const updateCertificateSchema = z.object({
  status: z.enum(['ACTIVE', 'REVOKED', 'REPLACED']).optional(),
  holder_name: z.string().trim().min(2).max(200).optional(),
  storage_location: z.string().trim().max(500).nullish().transform(v => v || null),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
  replaced_by_id: z.string().uuid().nullish().transform(v => v || null),
}).strict();

const createPOASchema = z.object({
  legal_entity_id: z.string().uuid(),
  scope: z.enum(['ECAC', 'PREFEITURA', 'SEFAZ', 'JUNTA_COMERCIAL', 'INSS', 'FGTS', 'OUTRO']),
  scope_detail: z.string().trim().max(200).nullish().transform(v => v || null),
  grantor_name: z.string().trim().min(2).max(200),
  grantor_document: z.string().trim().max(20).nullish().transform(v => v || null),
  grantee_name: z.string().trim().min(2).max(200),
  grantee_document: z.string().trim().max(20).nullish().transform(v => v || null),
  issued_at: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  expires_at: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  protocol_number: z.string().trim().max(100).nullish().transform(v => v || null),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
}).strict();

const updatePOASchema = z.object({
  status: z.enum(['ACTIVE', 'REVOKED', 'REPLACED', 'SUSPENDED']).optional(),
  scope_detail: z.string().trim().max(200).nullish().transform(v => v || null),
  expires_at: z.string().datetime().nullish().transform(v => v ? new Date(v) : null),
  protocol_number: z.string().trim().max(100).nullish().transform(v => v || null),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
  replaced_by_id: z.string().uuid().nullish().transform(v => v || null),
}).strict();

// ============================================================
// SERIALIZERS
// ============================================================

function toIso(d: any): string | null { return d ? (d instanceof Date ? d.toISOString() : String(d)) : null; }

function computeValidity(expiresAt: Date | null, alertDays = 30): { temporal_status: string; days_until_expiry: number | null } {
  if (!expiresAt) return { temporal_status: 'NO_EXPIRY', days_until_expiry: null };
  const now = new Date();
  const days = Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 86400000);
  if (days < 0) return { temporal_status: 'EXPIRED', days_until_expiry: days };
  if (days <= alertDays) return { temporal_status: 'EXPIRING_SOON', days_until_expiry: days };
  return { temporal_status: 'VALID', days_until_expiry: days };
}

function serializeCertificate(c: any) {
  const validity = computeValidity(c.expires_at);
  return {
    id: c.id, legal_entity_id: c.legal_entity_id,
    certificate_type: c.certificate_type, mode: c.mode, status: c.status,
    holder_name: c.holder_name, holder_document: c.holder_document,
    serial_number: c.serial_number, issuer: c.issuer,
    issued_at: toIso(c.issued_at), expires_at: toIso(c.expires_at),
    storage_location: c.storage_location, notes: c.notes,
    responsible_accountant_id: c.responsible_accountant_id,
    replaced_by_id: c.replaced_by_id,
    ...validity,
    created_at: toIso(c.created_at), updated_at: toIso(c.updated_at),
    legal_entity: c.legal_entity ? { id: c.legal_entity.id, razao_social: c.legal_entity.razao_social, cnpj: c.legal_entity.cnpj } : undefined,
    responsible: c.responsible_accountant ? { id: c.responsible_accountant.id, nome_completo: c.responsible_accountant.nome_completo } : undefined,
  };
}

function serializePOA(p: any) {
  const validity = computeValidity(p.expires_at);
  return {
    id: p.id, legal_entity_id: p.legal_entity_id,
    scope: p.scope, scope_detail: p.scope_detail, status: p.status,
    grantor_name: p.grantor_name, grantor_document: p.grantor_document,
    grantee_name: p.grantee_name, grantee_document: p.grantee_document,
    issued_at: toIso(p.issued_at), expires_at: toIso(p.expires_at),
    protocol_number: p.protocol_number, notes: p.notes,
    responsible_accountant_id: p.responsible_accountant_id,
    replaced_by_id: p.replaced_by_id,
    ...validity,
    created_at: toIso(p.created_at), updated_at: toIso(p.updated_at),
    legal_entity: p.legal_entity ? { id: p.legal_entity.id, razao_social: p.legal_entity.razao_social, cnpj: p.legal_entity.cnpj } : undefined,
    responsible: p.responsible_accountant ? { id: p.responsible_accountant.id, nome_completo: p.responsible_accountant.nome_completo } : undefined,
  };
}

// ============================================================
// CERTIFICATES
// ============================================================

router.get('/certificates', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityIds = await getAccessibleEntityIds(accountant.id);
    if (entityIds.length === 0) return res.json({ success: true, data: [] });

    const entityId = req.query.legal_entity_id as string;
    const filter = entityId && entityIds.includes(entityId) ? [entityId] : entityIds;

    const certs = await prisma.accounting_certificates.findMany({
      where: { legal_entity_id: { in: filter } },
      include: {
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        responsible_accountant: { select: { id: true, nome_completo: true } },
      },
      orderBy: [{ expires_at: 'asc' }],
    });

    res.json({ success: true, data: certs.map(serializeCertificate) });
  } catch (err: any) {
    console.error('[certificates] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/certificates/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const cert = await prisma.accounting_certificates.findUnique({
      where: { id: req.params.id },
      include: {
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        responsible_accountant: { select: { id: true, nome_completo: true } },
      },
    });
    if (!cert) return res.status(404).json({ success: false, error: 'Certificado não encontrado' });

    const link = await verifyEntityAccess(accountant.id, cert.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Certificado não encontrado' });

    res.json({ success: true, data: serializeCertificate(cert) });
  } catch (err: any) {
    console.error('[certificates] detail error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/certificates', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = createCertificateSchema.parse(req.body);

    const link = await verifyEntityAccess(accountant.id, data.legal_entity_id);
    if (!link) return res.status(403).json({ success: false, error: 'Acesso negado à empresa' });

    const cert = await prisma.accounting_certificates.create({
      data: {
        ...data,
        expires_at: new Date(data.expires_at),
        responsible_accountant_id: accountant.id,
        created_by_id: accountant.id,
        created_by_type: 'ACCOUNTANT',
      },
      include: {
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        responsible_accountant: { select: { id: true, nome_completo: true } },
      },
    });

    res.status(201).json({ success: true, data: serializeCertificate(cert) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[certificates] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/certificates/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = updateCertificateSchema.parse(req.body);

    const cert = await prisma.accounting_certificates.findUnique({ where: { id: req.params.id } });
    if (!cert) return res.status(404).json({ success: false, error: 'Certificado não encontrado' });

    const link = await verifyEntityAccess(accountant.id, cert.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Certificado não encontrado' });

    const updated = await prisma.accounting_certificates.update({
      where: { id: req.params.id },
      data,
      include: {
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        responsible_accountant: { select: { id: true, nome_completo: true } },
      },
    });

    res.json({ success: true, data: serializeCertificate(updated) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[certificates] update error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ============================================================
// POWERS OF ATTORNEY (PROCURAÇÕES)
// ============================================================

router.get('/powers-of-attorney', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityIds = await getAccessibleEntityIds(accountant.id);
    if (entityIds.length === 0) return res.json({ success: true, data: [] });

    const entityId = req.query.legal_entity_id as string;
    const filter = entityId && entityIds.includes(entityId) ? [entityId] : entityIds;

    const poas = await prisma.accounting_powers_of_attorney.findMany({
      where: { legal_entity_id: { in: filter } },
      include: {
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        responsible_accountant: { select: { id: true, nome_completo: true } },
      },
      orderBy: [{ expires_at: 'asc' }],
    });

    res.json({ success: true, data: poas.map(serializePOA) });
  } catch (err: any) {
    console.error('[poa] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/powers-of-attorney/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const poa = await prisma.accounting_powers_of_attorney.findUnique({
      where: { id: req.params.id },
      include: {
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        responsible_accountant: { select: { id: true, nome_completo: true } },
      },
    });
    if (!poa) return res.status(404).json({ success: false, error: 'Procuração não encontrada' });

    const link = await verifyEntityAccess(accountant.id, poa.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Procuração não encontrada' });

    res.json({ success: true, data: serializePOA(poa) });
  } catch (err: any) {
    console.error('[poa] detail error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/powers-of-attorney', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = createPOASchema.parse(req.body);

    const link = await verifyEntityAccess(accountant.id, data.legal_entity_id);
    if (!link) return res.status(403).json({ success: false, error: 'Acesso negado à empresa' });

    const poa = await prisma.accounting_powers_of_attorney.create({
      data: {
        ...data,
        responsible_accountant_id: accountant.id,
        created_by_id: accountant.id,
        created_by_type: 'ACCOUNTANT',
      },
      include: {
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        responsible_accountant: { select: { id: true, nome_completo: true } },
      },
    });

    res.status(201).json({ success: true, data: serializePOA(poa) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[poa] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/powers-of-attorney/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = updatePOASchema.parse(req.body);

    const poa = await prisma.accounting_powers_of_attorney.findUnique({ where: { id: req.params.id } });
    if (!poa) return res.status(404).json({ success: false, error: 'Procuração não encontrada' });

    const link = await verifyEntityAccess(accountant.id, poa.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Procuração não encontrada' });

    const updated = await prisma.accounting_powers_of_attorney.update({
      where: { id: req.params.id },
      data,
      include: {
        legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        responsible_accountant: { select: { id: true, nome_completo: true } },
      },
    });

    res.json({ success: true, data: serializePOA(updated) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[poa] update error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ============================================================
// FISCAL HEALTH (computed, no table)
// ============================================================

router.get('/fiscal-health/:entityId', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { entityId } = req.params;

    const link = await verifyEntityAccess(accountant.id, entityId);
    if (!link) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });

    const health = await computeFiscalHealth(entityId);
    res.json({ success: true, data: health });
  } catch (err: any) {
    console.error('[fiscal-health] error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Summary across all accessible companies
router.get('/fiscal-health', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityIds = await getAccessibleEntityIds(accountant.id);
    if (entityIds.length === 0) return res.json({ success: true, data: { companies: [], overall: 'HEALTHY' } });

    const results = await Promise.all(
      entityIds.map(async (id) => {
        const health = await computeFiscalHealth(id);
        const entity = await prisma.legal_entities.findUnique({ where: { id }, select: { id: true, razao_social: true, cnpj: true } });
        return { entity, health: { overall: health.overall, score: health.score, summary: health.summary } };
      })
    );

    const overallStatus = results.some(r => r.health.overall === 'CRITICAL') ? 'CRITICAL'
      : results.some(r => r.health.overall === 'ATTENTION') ? 'ATTENTION' : 'HEALTHY';

    res.json({ success: true, data: { companies: results, overall: overallStatus } });
  } catch (err: any) {
    console.error('[fiscal-health] summary error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const accountantRepresentationRoutes = router;
export default router;
