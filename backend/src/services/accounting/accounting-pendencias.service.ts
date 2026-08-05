import { PrismaClient } from '@prisma/client';
import { computeFiscalHealth, HealthCheckResult } from './accounting-fiscal-health.service';

const prisma = new PrismaClient();

export interface Pendencia {
  id: string;
  type: 'CERTIFICATE' | 'POWER_OF_ATTORNEY' | 'DOCUMENT' | 'FISCAL_HEALTH';
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  entity_id: string;
  entity_name: string;
  entity_cnpj: string;
  action: string;
  action_path?: string;
  expires_at?: string | null;
  days_until_expiry?: number | null;
  created_source: string;
}

/**
 * Compute all pending actions for an accountant across all accessible companies.
 * NO TABLE — derived in real-time from:
 * - Certificates expiring/expired
 * - Powers of Attorney expiring/expired/missing
 * - Documents with actionable status (REJECTED, DRAFT with no file, etc.)
 * - Fiscal health check failures
 *
 * Single source of truth: same data feeds dashboard, pendências page, alerts, timeline.
 */
export async function computePendencias(accountantId: string): Promise<Pendencia[]> {
  const now = new Date();
  const pendencias: Pendencia[] = [];

  // Get all accessible entities
  const links = await prisma.accountant_entity_links.findMany({
    where: {
      accountant_id: accountantId,
      status: 'ACTIVE',
      starts_at: { lte: now },
      OR: [{ ends_at: null }, { ends_at: { gt: now } }],
    },
    select: { legal_entity_id: true, inherits_children: true },
  });

  const entityIds = new Set<string>();
  for (const link of links) {
    entityIds.add(link.legal_entity_id);
    if (link.inherits_children) {
      const children = await prisma.legal_entities.findMany({
        where: { parent_entity_id: link.legal_entity_id, is_active: true },
        select: { id: true },
      });
      children.forEach(c => entityIds.add(c.id));
    }
  }

  if (entityIds.size === 0) return [];

  // Load entities for display
  const entities = await prisma.legal_entities.findMany({
    where: { id: { in: [...entityIds] } },
    select: { id: true, razao_social: true, cnpj: true },
  });
  const entityMap = new Map(entities.map(e => [e.id, e]));

  // 1. CERTIFICATES — expiring or expired
  const certificates = await prisma.accounting_certificates.findMany({
    where: { legal_entity_id: { in: [...entityIds] }, status: 'ACTIVE' },
  });

  for (const cert of certificates) {
    const daysUntil = Math.floor((new Date(cert.expires_at).getTime() - now.getTime()) / 86400000);
    const entity = entityMap.get(cert.legal_entity_id);
    if (!entity) continue;

    if (daysUntil < 0) {
      pendencias.push({
        id: `cert-expired-${cert.id}`,
        type: 'CERTIFICATE',
        priority: 'URGENT',
        title: 'Certificado digital vencido',
        description: `${cert.holder_name} — venceu há ${Math.abs(daysUntil)} dia${Math.abs(daysUntil) !== 1 ? 's' : ''}`,
        entity_id: entity.id, entity_name: entity.razao_social, entity_cnpj: entity.cnpj,
        action: 'Renovar certificado',
        action_path: '/contador/certificados',
        expires_at: cert.expires_at.toISOString(),
        days_until_expiry: daysUntil,
        created_source: 'certificate_expiry',
      });
    } else if (daysUntil <= 30) {
      pendencias.push({
        id: `cert-expiring-${cert.id}`,
        type: 'CERTIFICATE',
        priority: daysUntil <= 7 ? 'HIGH' : 'MEDIUM',
        title: 'Certificado digital vencendo',
        description: `${cert.holder_name} — vence em ${daysUntil} dia${daysUntil !== 1 ? 's' : ''}`,
        entity_id: entity.id, entity_name: entity.razao_social, entity_cnpj: entity.cnpj,
        action: 'Providenciar renovação',
        action_path: '/contador/certificados',
        expires_at: cert.expires_at.toISOString(),
        days_until_expiry: daysUntil,
        created_source: 'certificate_expiry',
      });
    }
  }

  // 2. POWERS OF ATTORNEY — expiring, expired, or missing critical ones
  const poas = await prisma.accounting_powers_of_attorney.findMany({
    where: { legal_entity_id: { in: [...entityIds] }, status: 'ACTIVE' },
  });

  for (const poa of poas) {
    if (!poa.expires_at) continue;
    const daysUntil = Math.floor((new Date(poa.expires_at).getTime() - now.getTime()) / 86400000);
    const entity = entityMap.get(poa.legal_entity_id);
    if (!entity) continue;

    const scopeLabel = { ECAC: 'e-CAC', PREFEITURA: 'Prefeitura', SEFAZ: 'SEFAZ', JUNTA_COMERCIAL: 'Junta Comercial', INSS: 'INSS', FGTS: 'FGTS', OUTRO: 'Outro' }[poa.scope] || poa.scope;

    if (daysUntil < 0) {
      pendencias.push({
        id: `poa-expired-${poa.id}`,
        type: 'POWER_OF_ATTORNEY',
        priority: 'URGENT',
        title: `Procuração ${scopeLabel} vencida`,
        description: `Outorgado: ${poa.grantee_name} — venceu há ${Math.abs(daysUntil)} dias`,
        entity_id: entity.id, entity_name: entity.razao_social, entity_cnpj: entity.cnpj,
        action: 'Renovar procuração',
        action_path: '/contador/procuracoes',
        expires_at: poa.expires_at.toISOString(),
        days_until_expiry: daysUntil,
        created_source: 'poa_expiry',
      });
    } else if (daysUntil <= 30) {
      pendencias.push({
        id: `poa-expiring-${poa.id}`,
        type: 'POWER_OF_ATTORNEY',
        priority: daysUntil <= 7 ? 'HIGH' : 'MEDIUM',
        title: `Procuração ${scopeLabel} vencendo`,
        description: `Outorgado: ${poa.grantee_name} — vence em ${daysUntil} dias`,
        entity_id: entity.id, entity_name: entity.razao_social, entity_cnpj: entity.cnpj,
        action: 'Providenciar renovação',
        action_path: '/contador/procuracoes',
        expires_at: poa.expires_at.toISOString(),
        days_until_expiry: daysUntil,
        created_source: 'poa_expiry',
      });
    }
  }

  // 3. DOCUMENTS — actionable status
  const documents = await prisma.accounting_company_documents.findMany({
    where: {
      legal_entity_id: { in: [...entityIds] },
      status: { in: ['REJECTED', 'DRAFT'] },
    },
    include: {
      document_type: { select: { name: true } },
      _count: { select: { files: true } },
    },
  });

  for (const doc of documents) {
    const entity = entityMap.get(doc.legal_entity_id);
    if (!entity) continue;

    if (doc.status === 'REJECTED') {
      pendencias.push({
        id: `doc-rejected-${doc.id}`,
        type: 'DOCUMENT',
        priority: 'HIGH',
        title: 'Documento rejeitado — correção necessária',
        description: `${doc.document_type?.name || 'Documento'} precisa de correção`,
        entity_id: entity.id, entity_name: entity.razao_social, entity_cnpj: entity.cnpj,
        action: 'Corrigir e reenviar',
        action_path: `/contador/documentos/${doc.id}`,
        created_source: 'document_rejected',
      });
    } else if (doc.status === 'DRAFT' && doc._count.files === 0) {
      pendencias.push({
        id: `doc-nofile-${doc.id}`,
        type: 'DOCUMENT',
        priority: 'LOW',
        title: 'Documento sem arquivo',
        description: `${doc.document_type?.name || 'Documento'} — criado mas sem upload`,
        entity_id: entity.id, entity_name: entity.razao_social, entity_cnpj: entity.cnpj,
        action: 'Enviar arquivo',
        action_path: `/contador/documentos/${doc.id}`,
        created_source: 'document_no_file',
      });
    }
  }

  // 4. DOCUMENTS — expiring
  const expiringDocs = await prisma.accounting_company_documents.findMany({
    where: {
      legal_entity_id: { in: [...entityIds] },
      status: { in: ['ACTIVE', 'APPROVED'] },
      expires_at: { not: null, lte: new Date(now.getTime() + 30 * 86400000) },
    },
    include: { document_type: { select: { name: true } } },
  });

  for (const doc of expiringDocs) {
    if (!doc.expires_at) continue;
    const daysUntil = Math.floor((new Date(doc.expires_at).getTime() - now.getTime()) / 86400000);
    const entity = entityMap.get(doc.legal_entity_id);
    if (!entity) continue;

    pendencias.push({
      id: `doc-expiring-${doc.id}`,
      type: 'DOCUMENT',
      priority: daysUntil < 0 ? 'URGENT' : daysUntil <= 7 ? 'HIGH' : 'MEDIUM',
      title: daysUntil < 0 ? 'Documento vencido' : 'Documento vencendo',
      description: `${doc.document_type?.name || 'Documento'} — ${daysUntil < 0 ? `venceu há ${Math.abs(daysUntil)} dias` : `vence em ${daysUntil} dias`}`,
      entity_id: entity.id, entity_name: entity.razao_social, entity_cnpj: entity.cnpj,
      action: daysUntil < 0 ? 'Renovar documento' : 'Providenciar renovação',
      action_path: `/contador/documentos/${doc.id}`,
      expires_at: doc.expires_at.toISOString(),
      days_until_expiry: daysUntil,
      created_source: 'document_expiry',
    });
  }

  // Sort by priority: URGENT > HIGH > MEDIUM > LOW
  const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  pendencias.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return pendencias;
}

/**
 * Get pendências summary counts for the dashboard.
 */
export async function getPendenciasSummary(accountantId: string) {
  const pendencias = await computePendencias(accountantId);
  return {
    total: pendencias.length,
    urgent: pendencias.filter(p => p.priority === 'URGENT').length,
    high: pendencias.filter(p => p.priority === 'HIGH').length,
    medium: pendencias.filter(p => p.priority === 'MEDIUM').length,
    low: pendencias.filter(p => p.priority === 'LOW').length,
    top: pendencias.slice(0, 5),
  };
}
