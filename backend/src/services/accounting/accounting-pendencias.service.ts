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
 * 
 * SINGLE SOURCE OF TRUTH: derived from fiscal health checks.
 * Every check that is not OK generates a corresponding pendência.
 * This guarantees consistency: if health says CRITICAL, pendências shows it.
 *
 * Additional pendências from document workflow (rejected, draft without file).
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

  // 1. FISCAL HEALTH CHECKS → Pendências (single source of truth)
  for (const entityId of entityIds) {
    const entity = entityMap.get(entityId);
    if (!entity) continue;

    const health = await computeFiscalHealth(entityId);
    for (const check of health.checks) {
      if (check.status === 'OK' || check.status === 'NOT_APPLICABLE') continue;

      const priority = check.status === 'CRITICAL' ? 'URGENT' as const : 'MEDIUM' as const;
      const actionMap: Record<string, { action: string; path: string; type: Pendencia['type'] }> = {
        CERT_DIGITAL_VALID: { action: 'Cadastrar certificado', path: '/contador/certificados', type: 'CERTIFICATE' },
        PROC_ECAC_VALID: { action: 'Cadastrar procuração e-CAC', path: '/contador/procuracoes', type: 'POWER_OF_ATTORNEY' },
        PROC_PREFEITURA_VALID: { action: 'Cadastrar procuração Prefeitura', path: '/contador/procuracoes', type: 'POWER_OF_ATTORNEY' },
        PROC_SEFAZ_VALID: { action: 'Cadastrar procuração SEFAZ', path: '/contador/procuracoes', type: 'POWER_OF_ATTORNEY' },
        DOC_CONTRATO_SOCIAL: { action: 'Enviar Contrato Social', path: '/contador/documentos', type: 'DOCUMENT' },
        DOC_CARTAO_CNPJ: { action: 'Enviar Cartão CNPJ', path: '/contador/documentos', type: 'DOCUMENT' },
      };

      const mapping = actionMap[check.code] || { action: 'Resolver', path: '/contador/pendencias', type: 'FISCAL_HEALTH' as const };

      pendencias.push({
        id: `health-${entityId}-${check.code}`,
        type: mapping.type,
        priority: check.severity === 'CRITICAL' ? priority : 'MEDIUM',
        title: check.name,
        description: check.message,
        entity_id: entity.id,
        entity_name: entity.razao_social,
        entity_cnpj: entity.cnpj,
        action: mapping.action,
        action_path: mapping.path,
        expires_at: check.expires_at || null,
        days_until_expiry: check.days_until_expiry || null,
        created_source: `health_check_${check.code}`,
      });
    }
  }

  // 2. DOCUMENT WORKFLOW — rejected or draft without file
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
