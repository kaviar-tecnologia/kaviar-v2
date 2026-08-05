import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface HealthCheckResult {
  code: string;
  name: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'NOT_APPLICABLE';
  message: string;
  expires_at?: string | null;
  days_until_expiry?: number | null;
}

export interface FiscalHealthSummary {
  overall: 'HEALTHY' | 'ATTENTION' | 'CRITICAL';
  score: number; // 0-100
  checks: HealthCheckResult[];
  summary: { ok: number; warning: number; critical: number; total: number };
}

const ALERT_DAYS = 30; // days before expiry to trigger warning

/**
 * Compute fiscal health for a legal entity.
 * Answers: "Does the accountant have everything needed to legally represent this company?"
 *
 * NO TABLE — computed on the fly from:
 * - accounting_certificates
 * - accounting_powers_of_attorney
 * - accounting_company_documents
 * - accounting_fiscal_health_rules
 */
export async function computeFiscalHealth(legalEntityId: string): Promise<FiscalHealthSummary> {
  const now = new Date();

  // Load rules
  const rules = await prisma.accounting_fiscal_health_rules.findMany({
    where: { is_active: true },
    orderBy: { sort_order: 'asc' },
  });

  // Load entity data
  const [certificates, powersOfAttorney, documents] = await Promise.all([
    prisma.accounting_certificates.findMany({
      where: { legal_entity_id: legalEntityId, status: 'ACTIVE' },
    }),
    prisma.accounting_powers_of_attorney.findMany({
      where: { legal_entity_id: legalEntityId, status: 'ACTIVE' },
    }),
    prisma.accounting_company_documents.findMany({
      where: { legal_entity_id: legalEntityId, status: { in: ['ACTIVE', 'APPROVED'] } },
      include: { document_type: { select: { code: true } } },
    }),
  ]);

  const checks: HealthCheckResult[] = [];

  for (const rule of rules) {
    const check = evaluateRule(rule, certificates, powersOfAttorney, documents, now);
    checks.push(check);
  }

  const summary = {
    ok: checks.filter(c => c.status === 'OK').length,
    warning: checks.filter(c => c.status === 'WARNING').length,
    critical: checks.filter(c => c.status === 'CRITICAL').length,
    total: checks.length,
  };

  // Overall status
  let overall: 'HEALTHY' | 'ATTENTION' | 'CRITICAL' = 'HEALTHY';
  if (summary.critical > 0) overall = 'CRITICAL';
  else if (summary.warning > 0) overall = 'ATTENTION';

  // Score: 100 = all OK, penalty for warnings and critical
  const maxScore = summary.total * 100;
  const penaltyPerCritical = 100;
  const penaltyPerWarning = 30;
  const rawScore = maxScore - (summary.critical * penaltyPerCritical) - (summary.warning * penaltyPerWarning);
  const score = summary.total > 0 ? Math.max(0, Math.round((rawScore / maxScore) * 100)) : 100;

  return { overall, score, checks, summary };
}

function evaluateRule(
  rule: any,
  certificates: any[],
  powersOfAttorney: any[],
  documents: any[],
  now: Date
): HealthCheckResult {
  const base = { code: rule.code, name: rule.name, severity: rule.severity };

  switch (rule.rule_type) {
    case 'CERTIFICATE': return evaluateCertificateRule(rule, certificates, now, base);
    case 'POWER_OF_ATTORNEY': return evaluatePOARule(rule, powersOfAttorney, now, base);
    case 'DOCUMENT': return evaluateDocumentRule(rule, documents, base);
    default: return { ...base, status: 'NOT_APPLICABLE', message: 'Regra não aplicável' };
  }
}

function evaluateCertificateRule(rule: any, certificates: any[], now: Date, base: any): HealthCheckResult {
  const activeCerts = certificates.filter(c => c.status === 'ACTIVE');

  if (activeCerts.length === 0) {
    return { ...base, status: 'CRITICAL', message: 'Nenhum certificado digital cadastrado' };
  }

  // Check if any is expired or expiring soon
  const validCerts = activeCerts.filter(c => new Date(c.expires_at) > now);
  if (validCerts.length === 0) {
    const latest = activeCerts.sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0];
    return {
      ...base,
      status: 'CRITICAL',
      message: 'Certificado digital vencido',
      expires_at: latest.expires_at?.toISOString(),
      days_until_expiry: Math.floor((new Date(latest.expires_at).getTime() - now.getTime()) / 86400000),
    };
  }

  // Check expiring soon
  const soonestExpiry = validCerts.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())[0];
  const daysUntil = Math.floor((new Date(soonestExpiry.expires_at).getTime() - now.getTime()) / 86400000);

  if (daysUntil <= ALERT_DAYS) {
    return {
      ...base,
      status: 'WARNING',
      message: `Certificado digital vence em ${daysUntil} dia${daysUntil !== 1 ? 's' : ''}`,
      expires_at: soonestExpiry.expires_at?.toISOString(),
      days_until_expiry: daysUntil,
    };
  }

  return { ...base, status: 'OK', message: 'Certificado digital válido', expires_at: soonestExpiry.expires_at?.toISOString(), days_until_expiry: daysUntil };
}

function evaluatePOARule(rule: any, powersOfAttorney: any[], now: Date, base: any): HealthCheckResult {
  // Map rule code to scope
  const scopeMap: Record<string, string> = {
    PROC_ECAC_VALID: 'ECAC',
    PROC_PREFEITURA_VALID: 'PREFEITURA',
    PROC_SEFAZ_VALID: 'SEFAZ',
  };
  const targetScope = scopeMap[rule.code];
  if (!targetScope) return { ...base, status: 'NOT_APPLICABLE', message: 'Regra não aplicável' };

  const activePOAs = powersOfAttorney.filter(p => p.scope === targetScope && p.status === 'ACTIVE');

  if (activePOAs.length === 0) {
    if (!rule.is_required) {
      return { ...base, status: 'WARNING', message: `Procuração ${targetScope} não cadastrada` };
    }
    return { ...base, status: 'CRITICAL', message: `Procuração ${targetScope} não cadastrada (obrigatória)` };
  }

  // Check expiry
  const withExpiry = activePOAs.filter(p => p.expires_at);
  if (withExpiry.length > 0) {
    const valid = withExpiry.filter(p => new Date(p.expires_at) > now);
    if (valid.length === 0) {
      return { ...base, status: 'CRITICAL', message: `Procuração ${targetScope} vencida` };
    }

    const soonest = valid.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())[0];
    const daysUntil = Math.floor((new Date(soonest.expires_at).getTime() - now.getTime()) / 86400000);

    if (daysUntil <= ALERT_DAYS) {
      return { ...base, status: 'WARNING', message: `Procuração ${targetScope} vence em ${daysUntil} dias`, expires_at: soonest.expires_at?.toISOString(), days_until_expiry: daysUntil };
    }

    return { ...base, status: 'OK', message: `Procuração ${targetScope} válida`, expires_at: soonest.expires_at?.toISOString(), days_until_expiry: daysUntil };
  }

  // No expiry = perpetual = OK
  return { ...base, status: 'OK', message: `Procuração ${targetScope} ativa (sem validade definida)` };
}

function evaluateDocumentRule(rule: any, documents: any[], base: any): HealthCheckResult {
  const docCodeMap: Record<string, string> = {
    DOC_CONTRATO_SOCIAL: 'CONTRATO_SOCIAL',
    DOC_CARTAO_CNPJ: 'CARTAO_CNPJ',
  };
  const targetCode = docCodeMap[rule.code];
  if (!targetCode) return { ...base, status: 'NOT_APPLICABLE', message: 'Regra não aplicável' };

  const hasDoc = documents.some(d => d.document_type?.code === targetCode);
  if (!hasDoc) {
    return { ...base, status: rule.is_required ? 'CRITICAL' : 'WARNING', message: `${rule.name} — não encontrado` };
  }

  return { ...base, status: 'OK', message: `${rule.name} — presente` };
}

export { prisma };
