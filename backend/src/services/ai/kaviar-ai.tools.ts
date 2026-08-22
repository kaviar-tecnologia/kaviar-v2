import { pool } from '../../db';
import {
  getAnnualIncentiveSummary,
  getWhatsAppSummary,
  getEmergencyOperationsSummary,
  getDriverPipelineSummary,
  getTerritoryPortfolioSummary,
} from './kaviar-ai.command-center';

export type RidesSummaryTodayData = {
  rides: number;
  grossAmount: string;
  kaviarFee: string;
};

export type DriversDocumentsPendingData = {
  driversAffected: number;
  summary: Record<string, number>;
  compliancePending: number;
};

export type FinanceDueObligationsData = {
  totalPending: number;
  totalAmountCents: string;
  overdueCount: number;
  overdueAmountCents: string;
  dueSoonCount: number;
  dueSoonAmountCents: string;
};

export async function getRidesSummaryToday(): Promise<{
  tool: 'rides_summary_today';
  data: RidesSummaryTodayData;
}> {
  const result = await pool.query<{
    rides: number;
    gross_total: string;
    platform_fee_total: string;
  }>(`
    SELECT
      COUNT(DISTINCT r.id)::int AS rides,
      COALESCE(SUM(s.final_price), 0)::text AS gross_total,
      COALESCE(SUM(s.fee_amount), 0)::text AS platform_fee_total
    FROM rides_v2 r
    INNER JOIN ride_settlements s ON s.ride_id = r.id
    WHERE s.settled_at IS NOT NULL
      AND (
        s.settled_at
          AT TIME ZONE 'UTC'
          AT TIME ZONE 'America/Sao_Paulo'
      )::date =
      (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  `);

  const row = result.rows[0];

  if (!row) {
    throw new Error(
      'Não foi possível obter o resumo financeiro das corridas.'
    );
  }

  return {
    tool: 'rides_summary_today',
    data: {
      rides: row.rides,
      grossAmount: row.gross_total,
      kaviarFee: row.platform_fee_total,
    },
  };
}

export async function getDriversDocumentsPending(): Promise<{
  tool: 'drivers_documents_pending';
  data: DriversDocumentsPendingData;
}> {
  // Documentos obrigatórios com status que requer ação (SUBMITTED = aguardando revisão, MISSING/REJECTED = pendentes do motorista)
  const docResult = await pool.query<{
    status: string;
    driver_count: number;
  }>(`
    SELECT
      status,
      COUNT(DISTINCT driver_id)::int AS driver_count
    FROM driver_documents
    WHERE status IN ('SUBMITTED', 'MISSING', 'REJECTED')
    GROUP BY status
    ORDER BY status
  `);

  // Documentos de compliance pendentes de aprovação admin
  const complianceResult = await pool.query<{
    pending_count: number;
  }>(`
    SELECT COUNT(DISTINCT driver_id)::int AS pending_count
    FROM driver_compliance_documents
    WHERE status = 'pending'
  `);

  const summary: Record<string, number> = {};

  for (const row of docResult.rows) {
    summary[row.status] = row.driver_count;
  }

  // Total de motoristas distintos afetados (precisa de query separada para evitar dupla contagem)
  const totalResult = await pool.query<{
    total_drivers: number;
  }>(`
    SELECT COUNT(DISTINCT driver_id)::int AS total_drivers
    FROM driver_documents
    WHERE status IN ('SUBMITTED', 'MISSING', 'REJECTED')
  `);

  const driversAffected = totalResult.rows[0]?.total_drivers ?? 0;
  const compliancePending = complianceResult.rows[0]?.pending_count ?? 0;

  return {
    tool: 'drivers_documents_pending',
    data: {
      driversAffected,
      summary,
      compliancePending,
    },
  };
}

export async function getFinanceDueObligations(): Promise<{
  tool: 'finance_due_obligations';
  data: FinanceDueObligationsData;
}> {
  const todayExpr = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;

  const result = await pool.query<{
    total_pending: number;
    total_amount_cents: string;
    overdue_count: number;
    overdue_amount_cents: string;
    due_soon_count: number;
    due_soon_amount_cents: string;
  }>(`
    SELECT
      COUNT(*)::int AS total_pending,
      COALESCE(SUM(net_amount_cents), 0)::text AS total_amount_cents,
      COUNT(*) FILTER (
        WHERE due_date < ${todayExpr}
      )::int AS overdue_count,
      COALESCE(SUM(net_amount_cents) FILTER (
        WHERE due_date < ${todayExpr}
      ), 0)::text AS overdue_amount_cents,
      COUNT(*) FILTER (
        WHERE due_date >= ${todayExpr}
          AND due_date <= (${todayExpr} + INTERVAL '7 days')::date
      )::int AS due_soon_count,
      COALESCE(SUM(net_amount_cents) FILTER (
        WHERE due_date >= ${todayExpr}
          AND due_date <= (${todayExpr} + INTERVAL '7 days')::date
      ), 0)::text AS due_soon_amount_cents
    FROM financial_obligations
    WHERE status NOT IN ('PAID', 'FAILED', 'CANCELLED')
      AND due_date IS NOT NULL
  `);

  const row = result.rows[0];

  return {
    tool: 'finance_due_obligations',
    data: {
      totalPending: row?.total_pending ?? 0,
      totalAmountCents: row?.total_amount_cents ?? '0',
      overdueCount: row?.overdue_count ?? 0,
      overdueAmountCents: row?.overdue_amount_cents ?? '0',
      dueSoonCount: row?.due_soon_count ?? 0,
      dueSoonAmountCents: row?.due_soon_amount_cents ?? '0',
    },
  };
}

// ── Territorial Onboarding ─────────────────────────────────────────────────

export type TerritoryOnboardingStatusData = {
  found: boolean;
  territory: {
    id: string;
    name: string;
    level: string;
    status: string;
    uf: string | null;
    city_name: string | null;
    regulatory_status: string;
    regulatory_notes: string | null;
    moto_express_enabled: boolean;
    moto_passenger_enabled: boolean;
  } | null;
  manager: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    territory_id: string;
    territory_name: string;
    territory_level: string;
  } | null;
  pendencies: string[];
};

export type TerritoryActivationReadinessData = {
  ready: boolean;
  reasons: string[];
  territory: {
    id: string;
    name: string;
    status: string;
    regulatory_status: string;
  } | null;
};

/**
 * Consulta status de onboarding territorial por city+uf.
 * Read-only. Aceita parâmetros via toolArgs.
 */
export async function getTerritoryOnboardingStatus(
  city: string,
  uf: string
): Promise<{ tool: 'territory_onboarding_status'; data: TerritoryOnboardingStatusData }> {
  const normalizedCity = city.trim();
  const normalizedUf = uf.trim().toUpperCase();

  if (!normalizedCity || !normalizedUf || normalizedUf.length !== 2) {
    return {
      tool: 'territory_onboarding_status',
      data: { found: false, territory: null, manager: null, pendencies: ['Cidade ou UF inválida.'] },
    };
  }

  // Busca território por city_name + uf (case-insensitive)
  const territoryResult = await pool.query<{
    id: string;
    name: string;
    level: string;
    status: string;
    uf: string | null;
    city_name: string | null;
    regulatory_status: string;
    regulatory_notes: string | null;
    moto_express_enabled: boolean;
    moto_passenger_enabled: boolean;
  }>(`
    SELECT id, name, level, status, uf, city_name, regulatory_status,
           regulatory_notes, moto_express_enabled, moto_passenger_enabled
    FROM operational_territories
    WHERE LOWER(city_name) = LOWER($1)
      AND UPPER(uf) = $2
      AND level = 'city'
    ORDER BY is_active DESC, created_at DESC
    LIMIT 1
  `, [normalizedCity, normalizedUf]);

  const territory = territoryResult.rows[0] ?? null;

  if (!territory) {
    return {
      tool: 'territory_onboarding_status',
      data: {
        found: false,
        territory: null,
        manager: null,
        pendencies: [`Território ${normalizedCity}/${normalizedUf} não encontrado no sistema.`],
      },
    };
  }

  // Busca gestor ativo na cidade OU em uma região filha ativa.
  const managerResult = await pool.query<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    territory_id: string;
    territory_name: string;
    territory_level: string;
  }>(`
    SELECT
      a.id,
      a.name,
      a.email,
      a.role,
      tma.status,
      tma.territory_id,
      managed_t.name AS territory_name,
      managed_t.level AS territory_level
    FROM territory_manager_assignments tma
    INNER JOIN admins a
      ON a.id = tma.admin_id
     AND a.is_active = true
    INNER JOIN operational_territories managed_t
      ON managed_t.id = tma.territory_id
    WHERE tma.status = 'active'
      AND tma.ended_at IS NULL
      AND (
        tma.territory_id = $1
        OR (
          managed_t.parent_id = $1
          AND managed_t.level = 'region'
          AND managed_t.is_active = true
        )
      )
    ORDER BY
      CASE WHEN tma.territory_id = $1 THEN 0 ELSE 1 END,
      managed_t.name,
      a.name
    LIMIT 1
  `, [territory.id]);

  const manager = managerResult.rows[0] ?? null;

  // Calcular pendências
  const pendencies: string[] = [];
  if (territory.status === 'planning') pendencies.push('Território em planejamento — não preparado.');
  if (territory.regulatory_status === 'not_evaluated') pendencies.push('Regulatório não avaliado.');
  if (territory.regulatory_status === 'blocked') pendencies.push('Regulatório bloqueado.');
  if (territory.regulatory_status === 'suspended') pendencies.push('Regulatório suspenso.');
  if (!manager) {
    pendencies.push('Nenhum gestor territorial vinculado.');
  } else {
    // Verificar perfil do gestor
    const profileResult = await pool.query<{
      is_active: boolean;
      contract_status: string;
      document_status: string;
    }>(`
      SELECT is_active, contract_status, document_status
      FROM operator_profiles
      WHERE admin_id = $1 AND territory_id = $2
      LIMIT 1
    `, [manager.id, manager.territory_id]);
    const profile = profileResult.rows[0];
    if (profile) {
      if (!profile.is_active) pendencies.push('Perfil do gestor inativo.');
      if (profile.contract_status !== 'signed' && profile.contract_status !== 'not_required') {
        const contractLabels: Record<string, string> = {
          pending: 'pendente de envio',
          available: 'disponível para assinatura',
          delivered: 'entregue, aguardando assinatura',
          waived: 'dispensado',
          rejected: 'rejeitado',
        };
        const label = contractLabels[profile.contract_status] || profile.contract_status;
        pendencies.push(`Contrato do gestor: ${label}.`);
      }
      if (profile.document_status !== 'verified') pendencies.push(`Documentos do gestor: ${profile.document_status}.`);
    }
  }

  return {
    tool: 'territory_onboarding_status',
    data: { found: true, territory, manager, pendencies },
  };
}

/**
 * Verifica prontidão de ativação do território.
 * Read-only.
 */
export async function getTerritoryActivationReadiness(
  city: string,
  uf: string
): Promise<{ tool: 'territory_activation_readiness'; data: TerritoryActivationReadinessData }> {
  const normalizedCity = city.trim();
  const normalizedUf = uf.trim().toUpperCase();

  if (!normalizedCity || !normalizedUf || normalizedUf.length !== 2) {
    return {
      tool: 'territory_activation_readiness',
      data: { ready: false, reasons: ['Cidade ou UF inválida.'], territory: null },
    };
  }

  const territoryResult = await pool.query<{
    id: string;
    name: string;
    status: string;
    regulatory_status: string;
    moto_passenger_enabled: boolean;
  }>(`
    SELECT id, name, status, regulatory_status, moto_passenger_enabled
    FROM operational_territories
    WHERE LOWER(city_name) = LOWER($1)
      AND UPPER(uf) = $2
      AND level = 'city'
    ORDER BY is_active DESC, created_at DESC
    LIMIT 1
  `, [normalizedCity, normalizedUf]);

  const territory = territoryResult.rows[0] ?? null;

  if (!territory) {
    return {
      tool: 'territory_activation_readiness',
      data: { ready: false, reasons: ['Território não encontrado.'], territory: null },
    };
  }

  const reasons: string[] = [];

  // Status do território
  if (territory.status === 'active') {
    return { tool: 'territory_activation_readiness', data: { ready: true, reasons: ['Território já está ativo.'], territory } };
  }
  if (territory.status === 'inactive') reasons.push('Território está inativo.');
  if (territory.status === 'planning') reasons.push('Território ainda em planejamento.');

  // Regulatório
  const approvedStatuses = ['approved', 'controlled_operation'];
  if (!approvedStatuses.includes(territory.regulatory_status)) {
    reasons.push(`Regulatório: ${territory.regulatory_status}`);
  }

  // Gestor
  const managerResult = await pool.query<{ cnt: number }>(`
    SELECT COUNT(*)::int AS cnt
    FROM territory_manager_assignments tma
    INNER JOIN admins a
      ON a.id = tma.admin_id
     AND a.is_active = true
    INNER JOIN operational_territories managed_t
      ON managed_t.id = tma.territory_id
    WHERE tma.status = 'active'
      AND tma.ended_at IS NULL
      AND (
        tma.territory_id = $1
        OR (
          managed_t.parent_id = $1
          AND managed_t.level = 'region'
          AND managed_t.is_active = true
        )
      )
  `, [territory.id]);

  if ((managerResult.rows[0]?.cnt ?? 0) === 0) {
    reasons.push('Nenhum gestor territorial ativo.');
  } else {
    // Verificar perfil do gestor (operator_profile)
    const profileResult = await pool.query<{
      is_active: boolean;
      contract_status: string;
      document_status: string;
    }>(`
      SELECT op.is_active, op.contract_status, op.document_status
      FROM territory_manager_assignments tma
      INNER JOIN admins a
        ON a.id = tma.admin_id
       AND a.is_active = true
      INNER JOIN operational_territories managed_t
        ON managed_t.id = tma.territory_id
      INNER JOIN operator_profiles op
        ON op.admin_id = tma.admin_id
       AND op.territory_id = tma.territory_id
      WHERE tma.status = 'active'
        AND tma.ended_at IS NULL
        AND (
          tma.territory_id = $1
          OR (
            managed_t.parent_id = $1
            AND managed_t.level = 'region'
            AND managed_t.is_active = true
          )
        )
      ORDER BY CASE WHEN tma.territory_id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `, [territory.id]);

    const profile = profileResult.rows[0];
    if (!profile) {
      reasons.push('Gestor sem perfil operacional.');
    } else {
      if (!profile.is_active) reasons.push('Perfil do gestor inativo.');
      if (profile.contract_status !== 'signed' && profile.contract_status !== 'not_required') {
        const contractLabels: Record<string, string> = {
          pending: 'pendente de envio',
          available: 'disponível para assinatura',
          delivered: 'entregue, aguardando assinatura',
          waived: 'dispensado',
          rejected: 'rejeitado',
        };
        const label = contractLabels[profile.contract_status] || profile.contract_status;
        reasons.push(`Contrato do gestor: ${label}.`);
      }
      if (profile.document_status !== 'verified') {
        reasons.push(`Documentos do gestor: ${profile.document_status}.`);
      }
    }
  }

  // Moto passageiro: se habilitado, verificar compliance
  if (territory.moto_passenger_enabled) {
    const motoResult = await pool.query<{ status: string }>(`
      SELECT status FROM moto_passenger_compliance WHERE territory_id = $1 LIMIT 1
    `, [territory.id]);
    const motoStatus = motoResult.rows[0]?.status;
    if (motoStatus !== 'APPROVED') {
      reasons.push(`Moto passageiro habilitado mas compliance: ${motoStatus || 'ausente'}.`);
    }
  }

  const ready = reasons.length === 0;

  return {
    tool: 'territory_activation_readiness',
    data: { ready, reasons: ready ? ['Território pronto para ativação, aguardando confirmação administrativa.'] : reasons, territory },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Pacote Administrativo Inteligente v1 — Tools adicionais (read-only)
// ══════════════════════════════════════════════════════════════════════════════

import { evaluateInboundEmailSecurityRisk } from '../email/inbound-email-security-risk';

// ── Types ──────────────────────────────────────────────────────────────────

export type DailyBriefingPriority = 'ALTA' | 'ATENÇÃO' | 'NORMAL' | 'INDISPONÍVEL';

export type DailyBriefingData = {
  referenceTime: string;
  priority: DailyBriefingPriority;
  rides: {
    available: boolean;
    completed: number;
    grossAmount: string;
    kaviarFee: string;
    canceled: number;
    noDriver: number;
    pendingAdjustment: number;
  };
  drivers: {
    available: boolean;
    docsPending: number;
    pendingApproval: number;
    compliancePending: number;
  };
  finance: {
    available: boolean;
    overdueCount: number;
    overdueAmountCents: string;
    due7dCount: number;
    due7dAmountCents: string;
    due15dCount: number;
    due15dAmountCents: string;
    due30dCount: number;
    due30dAmountCents: string;
    uncategorizedAvailable: boolean;
    uncategorizedTransactions: number;
  };
  leads: {
    available: boolean;
    newToday: number;
    noContact: number;
    stale3d: number;
  };
  inbox: {
    available: boolean;
    newCount: number;
    highRiskRecentCount: number;
    riskAssessedLimit: number;
    latestSubjects: string[];
  };
  territories: {
    available: boolean;
    preparationCount: number;
    withoutManagerCount: number;
  };
  highItems: string[];
  attentionItems: string[];
  normalItems: string[];
  unavailableItems: string[];
};

export type RidesOperationsData = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  completed: number;
  canceled: number;
  noDriver: number;
  pendingAdjustment: number;
  grossAmountCents: string;
  kaviarFeeCents: string;
  driverEarningsCents: string;
  previous: {
    total: number;
    completed: number;
    grossAmountCents: string;
  };
};

export type FinanceAccountingBriefData = {
  periodLabel: string;
  realizedRevenueCents: string;
  realizedExpenseCents: string;
  realizedResultCents: string;
  overdueCount: number;
  overdueAmountCents: string;
  due7dCount: number;
  due15dCount: number;
  due30dCount: number;
  uncategorizedCount: number;
  accountingPendencias: { available: boolean; total: number; urgent: number; high: number };
};

export type CrmLeadsSummaryData = {
  periodLabel: string;
  newCount: number;
  byStatus: Record<string, number>;
  noContactCount: number;
  stale3dCount: number;
  bySource: Record<string, number>;
  topTerritories: { name: string; count: number }[];
};

export type InboxSummaryData = {
  totalNew: number;
  recent: {
    subject: string;
    fromName: string;
    receivedAt: string;
    hasAttachments: boolean;
    riskLevel: string;
  }[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

const TODAY_SP = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;

function formatBriefingCents(cents: string): string {
  const value = BigInt(cents);
  const isNeg = value < 0n;
  const abs = isNeg ? -value : value;
  const integer = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, '0');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNeg ? '-' : ''}${grouped},${fraction}`;
}

function getPeriodBounds(period: 'today' | 'week' | 'month'): { start: string; end: string; label: string; prevStart: string; prevEnd: string } {
  // Returns SQL expressions for period boundaries
  switch (period) {
    case 'today':
      return {
        start: `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
        end: `((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + INTERVAL '1 day')`,
        label: 'Hoje',
        prevStart: `((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '1 day')`,
        prevEnd: `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
      };
    case 'week':
      return {
        start: `date_trunc('week', NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
        end: `(date_trunc('week', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '7 days')::date`,
        label: 'Esta semana',
        prevStart: `(date_trunc('week', NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '7 days')::date`,
        prevEnd: `date_trunc('week', NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
      };
    case 'month':
      return {
        start: `date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
        end: `(date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 month')::date`,
        label: 'Este mês',
        prevStart: `(date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '1 month')::date`,
        prevEnd: `date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
      };
  }
}

// ── Tool 1: daily_briefing ─────────────────────────────────────────────────

export async function getDailyBriefing(): Promise<{
  tool: 'daily_briefing';
  data: DailyBriefingData;
}> {
  const highItems: string[] = [];
  const attentionItems: string[] = [];
  const normalItems: string[] = [];
  const unavailableItems: string[] = [];

  // Reference time
  const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);
  const referenceTime = refResult.rows[0]?.ref ?? new Date().toISOString();

  // ── Rides ──
  let rides: DailyBriefingData['rides'] = { available: false, completed: 0, grossAmount: '0', kaviarFee: '0', canceled: 0, noDriver: 0, pendingAdjustment: 0 };
  try {
    const ridesResult = await pool.query<{
      completed: number; gross: string; fee: string; canceled: number; no_driver: number; pending_adj: number;
    }>(`
      SELECT
        (SELECT COUNT(DISTINCT r.id)::int FROM rides_v2 r INNER JOIN ride_settlements s ON s.ride_id = r.id WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ${TODAY_SP}) AS completed,
        (SELECT COALESCE(SUM(s.final_price), 0)::text FROM ride_settlements s WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ${TODAY_SP}) AS gross,
        (SELECT COALESCE(SUM(s.fee_amount), 0)::text FROM ride_settlements s WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ${TODAY_SP}) AS fee,
        (SELECT COUNT(*)::int FROM rides_v2 WHERE status IN ('canceled_by_passenger','canceled_by_driver') AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ${TODAY_SP}) AS canceled,
        (SELECT COUNT(*)::int FROM rides_v2 WHERE status = 'no_driver' AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ${TODAY_SP}) AS no_driver,
        (SELECT COUNT(*)::int FROM rides_v2 WHERE status = 'pending_adjustment' AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ${TODAY_SP}) AS pending_adj
    `);
    const rr = ridesResult.rows[0];
    if (rr) {
      rides = { available: true, completed: rr.completed, grossAmount: rr.gross, kaviarFee: rr.fee, canceled: rr.canceled, noDriver: rr.no_driver, pendingAdjustment: rr.pending_adj };
    }
  } catch { unavailableItems.push('Corridas: fonte indisponível.'); }

  // ── Drivers ──
  let drivers: DailyBriefingData['drivers'] = { available: false, docsPending: 0, pendingApproval: 0, compliancePending: 0 };
  try {
    const driversResult = await pool.query<{ docs_pending: number; pending_approval: number; compliance_pending: number }>(`
      SELECT
        (SELECT COUNT(DISTINCT driver_id)::int FROM driver_documents WHERE status IN ('SUBMITTED','MISSING','REJECTED')) AS docs_pending,
        (SELECT COUNT(*)::int FROM drivers WHERE status = 'pending') AS pending_approval,
        (SELECT COUNT(DISTINCT driver_id)::int FROM driver_compliance_documents WHERE status = 'pending') AS compliance_pending
    `);
    const dr = driversResult.rows[0];
    if (dr) drivers = { available: true, docsPending: dr.docs_pending, pendingApproval: dr.pending_approval, compliancePending: dr.compliance_pending };
  } catch { unavailableItems.push('Motoristas: fonte indisponível.'); }

  // ── Finance ──
  let finance: DailyBriefingData['finance'] = { available: false, overdueCount: 0, overdueAmountCents: '0', due7dCount: 0, due7dAmountCents: '0', due15dCount: 0, due15dAmountCents: '0', due30dCount: 0, due30dAmountCents: '0', uncategorizedAvailable: false, uncategorizedTransactions: 0 };
  try {
    const finResult = await pool.query<{
      overdue_count: number; overdue_cents: string;
      due7d_count: number; due7d_cents: string;
      due15d_count: number; due15d_cents: string;
      due30d_count: number; due30d_cents: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE due_date < ${TODAY_SP})::int AS overdue_count,
        COALESCE(SUM(net_amount_cents) FILTER (WHERE due_date < ${TODAY_SP}), 0)::text AS overdue_cents,
        COUNT(*) FILTER (WHERE due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 7)::int AS due7d_count,
        COALESCE(SUM(net_amount_cents) FILTER (WHERE due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 7), 0)::text AS due7d_cents,
        COUNT(*) FILTER (WHERE due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 15)::int AS due15d_count,
        COALESCE(SUM(net_amount_cents) FILTER (WHERE due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 15), 0)::text AS due15d_cents,
        COUNT(*) FILTER (WHERE due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 30)::int AS due30d_count,
        COALESCE(SUM(net_amount_cents) FILTER (WHERE due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 30), 0)::text AS due30d_cents
      FROM financial_obligations
      WHERE status NOT IN ('PAID','FAILED','CANCELLED') AND due_date IS NOT NULL
    `);
    const fr = finResult.rows[0];
    if (fr) {
      finance = { ...finance, available: true, overdueCount: fr.overdue_count, overdueAmountCents: fr.overdue_cents, due7dCount: fr.due7d_count, due7dAmountCents: fr.due7d_cents, due15dCount: fr.due15d_count, due15dAmountCents: fr.due15d_cents, due30dCount: fr.due30d_count, due30dAmountCents: fr.due30d_cents };
    }
  } catch { unavailableItems.push('Financeiro: fonte indisponível.'); }

  // Uncategorized transactions (independent query)
  if (finance.available) {
    try {
      const uncatResult = await pool.query<{ cnt: number }>(`
        SELECT COUNT(*)::int AS cnt FROM financial_transactions WHERE category_id IS NULL AND status NOT IN ('CANCELED','REVERSED')
      `);
      finance.uncategorizedAvailable = true;
      finance.uncategorizedTransactions = uncatResult.rows[0]?.cnt ?? 0;
    } catch {
      finance.uncategorizedAvailable = false;
      unavailableItems.push('Lançamentos sem categoria: fonte indisponível.');
    }
  }

  // ── Leads ──
  let leads: DailyBriefingData['leads'] = { available: false, newToday: 0, noContact: 0, stale3d: 0 };
  try {
    const leadsResult = await pool.query<{ new_today: number; no_contact: number; stale_3d: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ${TODAY_SP})::int AS new_today,
        COUNT(*) FILTER (WHERE last_contact_at IS NULL AND status = 'NEW')::int AS no_contact,
        COUNT(*) FILTER (WHERE updated_at < (NOW() - INTERVAL '3 days') AND status NOT IN ('ACTIVE','LOST','REJECTED'))::int AS stale_3d
      FROM crm_leads
      WHERE deleted_at IS NULL
    `);
    const lr = leadsResult.rows[0];
    if (lr) leads = { available: true, newToday: lr.new_today, noContact: lr.no_contact, stale3d: lr.stale_3d };
  } catch { unavailableItems.push('Leads: fonte indisponível.'); }

  // ── Inbox ──
  const RISK_ASSESSED_LIMIT = 20;
  let inbox: DailyBriefingData['inbox'] = { available: false, newCount: 0, highRiskRecentCount: 0, riskAssessedLimit: RISK_ASSESSED_LIMIT, latestSubjects: [] };
  try {
    const inboxResult = await pool.query<{
      id: string; subject: string | null; from_name: string | null;
      from_email: string; text_body: string | null; html_body: string | null;
      normalized_body: string | null; raw_headers: unknown; attachment_count: number;
    }>(`
      SELECT id, subject, from_name, from_email, text_body, html_body, normalized_body, raw_headers, attachment_count
      FROM inbound_email_messages
      WHERE status = 'NEW'
      ORDER BY received_at DESC
      LIMIT $1
    `, [RISK_ASSESSED_LIMIT]);

    let highRisk = 0;
    const subjects: string[] = [];
    for (const row of inboxResult.rows) {
      if (subjects.length < 5 && row.subject) {
        subjects.push(row.subject.length > 100 ? row.subject.slice(0, 100) + '…' : row.subject);
      }
      const risk = evaluateInboundEmailSecurityRisk(row);
      if (risk.level === 'HIGH') highRisk++;
    }

    // Get exact total count
    const countResult = await pool.query<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM inbound_email_messages WHERE status = 'NEW'`);
    const totalNew = countResult.rows[0]?.cnt ?? inboxResult.rows.length;

    inbox = { available: true, newCount: totalNew, highRiskRecentCount: highRisk, riskAssessedLimit: RISK_ASSESSED_LIMIT, latestSubjects: subjects };
  } catch { unavailableItems.push('Inbox: fonte indisponível.'); }

  // ── Territories ──
  let territories: DailyBriefingData['territories'] = { available: false, preparationCount: 0, withoutManagerCount: 0 };
  try {
    const terResult = await pool.query<{ preparation: number; without_manager: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'preparation')::int AS preparation,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM territory_manager_assignments tma
          WHERE tma.territory_id = operational_territories.id AND tma.status = 'active' AND tma.ended_at IS NULL
        ))::int AS without_manager
      FROM operational_territories
      WHERE level = 'city' AND is_active = true
    `);
    const tr = terResult.rows[0];
    if (tr) territories = { available: true, preparationCount: tr.preparation, withoutManagerCount: tr.without_manager };
  } catch { unavailableItems.push('Territórios: fonte indisponível.'); }

  // ── Command Center amplification (each source independent) ──

  // Emergencies and rides
  let emergencyActive = 0;
  let emergencyAvailable = false;
  let ridesNoDriver = 0;
  let ridesPendingAdj = 0;
  let ridesOpsAvailable = false;
  try {
    const emergencyResult = await getEmergencyOperationsSummary();
    if (emergencyResult.data.emergencies.available) {
      emergencyAvailable = true;
      emergencyActive = emergencyResult.data.emergencies.active;
    } else {
      unavailableItems.push('Emergências: fonte indisponível.');
    }
    if (emergencyResult.data.rides.available) {
      ridesOpsAvailable = true;
      ridesNoDriver = emergencyResult.data.rides.noDriver;
      ridesPendingAdj = emergencyResult.data.rides.pendingAdjustment;
    }
  } catch { unavailableItems.push('Emergências/corridas operacionais: fonte indisponível.'); }

  // Annual incentive deadline breaches and outstanding
  let incentiveDeadlineBreaches = 0;
  let incentiveOutstandingCents = '0';
  let incentiveAvailable = false;
  try {
    const incentiveResult = await getAnnualIncentiveSummary();
    if (incentiveResult.data.available) {
      incentiveAvailable = true;
      incentiveDeadlineBreaches = incentiveResult.data.deadlineBreaches;
      incentiveOutstandingCents = incentiveResult.data.totalOutstandingCents;
    } else {
      unavailableItems.push('Gratificação Anual: fonte indisponível.');
    }
  } catch { unavailableItems.push('Gratificação Anual: fonte indisponível.'); }

  // WhatsApp
  let whatsappUnread = 0;
  let whatsappUrgent = 0;
  let whatsappAvailable = false;
  try {
    const waResult = await getWhatsAppSummary();
    if (waResult.data.available) {
      whatsappAvailable = true;
      whatsappUnread = waResult.data.unreadMessages;
      whatsappUrgent = waResult.data.highPriorityConversations;
    } else {
      unavailableItems.push('WhatsApp: fonte indisponível.');
    }
  } catch { unavailableItems.push('WhatsApp: fonte indisponível.'); }

  // Driver pipeline — modalities
  let modalitiesPending = 0;
  let modalitiesAvailable = false;
  try {
    const pipelineResult = await getDriverPipelineSummary();
    if (pipelineResult.data.available && pipelineResult.data.modalities.available) {
      modalitiesAvailable = true;
      modalitiesPending = pipelineResult.data.modalities.pending;
    } else if (pipelineResult.data.available && !pipelineResult.data.modalities.available) {
      unavailableItems.push('Modalidades de motoristas: fonte indisponível.');
    } else {
      unavailableItems.push('Pipeline de motoristas (detalhado): fonte indisponível.');
    }
  } catch { unavailableItems.push('Pipeline de motoristas (detalhado): fonte indisponível.'); }

  // Territory portfolio — checklists, protocols, insurance, blocked
  let territoryBlocked = 0;
  let checklistPending = 0;
  let protocolsPending = 0;
  let insurancePending = 0;
  let portfolioAvailable = false;
  try {
    const portfolioResult = await getTerritoryPortfolioSummary();
    if (portfolioResult.data.available) {
      portfolioAvailable = true;
      territoryBlocked = portfolioResult.data.byRegulatoryStatus['blocked'] ?? 0;
    }
    if (portfolioResult.data.regulatoryChecklist.available) checklistPending = portfolioResult.data.regulatoryChecklist.pending;
    if (portfolioResult.data.regulatoryProtocols.available) protocolsPending = portfolioResult.data.regulatoryProtocols.pending;
    if (portfolioResult.data.insuranceCoverages.available) insurancePending = portfolioResult.data.insuranceCoverages.pending;
  } catch { unavailableItems.push('Portfólio territorial (detalhado): fonte indisponível.'); }

  // ── Deterministic priority classification (only from available sections) ──
  if (emergencyAvailable && emergencyActive > 0) highItems.push(`🚨 ${emergencyActive} emergência(s) ativa(s).`);
  if (ridesOpsAvailable && ridesPendingAdj > 0) highItems.push(`${ridesPendingAdj} corrida(s) com ajuste pendente.`);
  else if (rides.available && rides.pendingAdjustment > 0) highItems.push(`${rides.pendingAdjustment} corrida(s) com ajuste pendente.`);
  if (incentiveAvailable && incentiveDeadlineBreaches > 0) highItems.push(`${incentiveDeadlineBreaches} solicitação(ões) de bônus com prazo violado.`);
  if (finance.available && finance.overdueCount > 0) highItems.push(`${finance.overdueCount} obrigação(ões) financeira(s) vencida(s).`);
  if (inbox.available && inbox.highRiskRecentCount > 0) highItems.push(`${inbox.highRiskRecentCount} e-mail(s) com risco elevado (entre os ${inbox.riskAssessedLimit} mais recentes analisados).`);

  if (ridesOpsAvailable && ridesNoDriver > 0) attentionItems.push(`${ridesNoDriver} corrida(s) sem motorista hoje.`);
  if (whatsappAvailable && whatsappUnread > 0) attentionItems.push(`${whatsappUnread} mensagem(ns) não lida(s) no WhatsApp${whatsappUrgent > 0 ? ` (${whatsappUrgent} urgente(s))` : ''}.`);
  if (incentiveAvailable && BigInt(incentiveOutstandingCents) > 0n) attentionItems.push(`Gratificação Anual a pagar: R$ ${formatBriefingCents(incentiveOutstandingCents)}.`);
  if (modalitiesAvailable && modalitiesPending > 0) attentionItems.push(`${modalitiesPending} modalidade(s) de motorista aguardando aprovação.`);
  if (finance.available && finance.due7dCount > 0) attentionItems.push(`${finance.due7dCount} obrigação(ões) vence(m) em 7 dias.`);
  if (drivers.available && drivers.docsPending > 0) attentionItems.push(`${drivers.docsPending} motorista(s) com documentos pendentes.`);
  if (drivers.available && drivers.pendingApproval > 0) attentionItems.push(`${drivers.pendingApproval} motorista(s) aguardando aprovação.`);
  if (drivers.available && drivers.compliancePending > 0) attentionItems.push(`${drivers.compliancePending} compliance pendente(s).`);
  if (leads.available && leads.noContact > 0) attentionItems.push(`${leads.noContact} lead(s) sem primeiro contato.`);
  if (leads.available && leads.stale3d > 0) attentionItems.push(`${leads.stale3d} lead(s) parado(s) há mais de 3 dias.`);
  if (inbox.available && inbox.newCount > 0) attentionItems.push(`${inbox.newCount} e-mail(s) novo(s) na inbox.`);
  if (territories.available && territories.withoutManagerCount > 0) attentionItems.push(`${territories.withoutManagerCount} território(s) sem gestor.`);
  if (portfolioAvailable && territoryBlocked > 0) attentionItems.push(`${territoryBlocked} território(s) com regulatório bloqueado.`);
  if (checklistPending > 0) attentionItems.push(`${checklistPending} item(ns) de checklist regulatório pendente(s).`);
  if (protocolsPending > 0) attentionItems.push(`${protocolsPending} protocolo(s) regulatório(s) pendente(s).`);
  if (insurancePending > 0) attentionItems.push(`${insurancePending} cobertura(s) de seguro pendente(s)/expirada(s).`);
  if (finance.uncategorizedAvailable && finance.uncategorizedTransactions > 0) attentionItems.push(`${finance.uncategorizedTransactions} lançamento(s) sem categoria.`);

  if (highItems.length === 0 && attentionItems.length === 0 && unavailableItems.length === 0) {
    normalItems.push('Nenhuma pendência prioritária identificada.');
  }

  let priority: DailyBriefingPriority = 'NORMAL';
  if (unavailableItems.length > 0 && highItems.length === 0 && attentionItems.length === 0) priority = 'INDISPONÍVEL';
  else if (highItems.length > 0) priority = 'ALTA';
  else if (attentionItems.length > 0) priority = 'ATENÇÃO';

  return {
    tool: 'daily_briefing',
    data: {
      referenceTime, priority, rides, drivers, finance, leads, inbox, territories,
      highItems, attentionItems, normalItems, unavailableItems,
    },
  };
}

// ── Tool 2: rides_operations ───────────────────────────────────────────────

const VALID_RIDE_PERIODS = ['today', 'week', 'month'] as const;

export async function getRidesOperations(args?: Record<string, string>): Promise<{
  tool: 'rides_operations';
  data: RidesOperationsData;
}> {
  const period = (args?.period ?? 'today') as 'today' | 'week' | 'month';
  if (!VALID_RIDE_PERIODS.includes(period)) {
    throw new Error('[rides_operations] Período inválido. Use today, week ou month.');
  }

  const bounds = getPeriodBounds(period);

  const result = await pool.query<{
    total: number; completed: number; canceled: number; no_driver: number; pending_adj: number;
    gross_cents: string; fee_cents: string; driver_cents: string;
    prev_total: number; prev_completed: number; prev_gross_cents: string;
    period_start: string; period_end: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM rides_v2 WHERE (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end}) AS total,
      (SELECT COUNT(*)::int FROM rides_v2 r INNER JOIN ride_settlements s ON s.ride_id = r.id WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end}) AS completed,
      (SELECT COUNT(*)::int FROM rides_v2 WHERE status IN ('canceled_by_passenger','canceled_by_driver') AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end}) AS canceled,
      (SELECT COUNT(*)::int FROM rides_v2 WHERE status = 'no_driver' AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end}) AS no_driver,
      (SELECT COUNT(*)::int FROM rides_v2 WHERE status = 'pending_adjustment' AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end}) AS pending_adj,
      (SELECT ROUND(COALESCE(SUM(s.final_price), 0) * 100)::bigint::text FROM rides_v2 r INNER JOIN ride_settlements s ON s.ride_id = r.id WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end}) AS gross_cents,
      (SELECT ROUND(COALESCE(SUM(s.fee_amount), 0) * 100)::bigint::text FROM rides_v2 r INNER JOIN ride_settlements s ON s.ride_id = r.id WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end}) AS fee_cents,
      (SELECT ROUND(COALESCE(SUM(s.driver_earnings), 0) * 100)::bigint::text FROM rides_v2 r INNER JOIN ride_settlements s ON s.ride_id = r.id WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end}) AS driver_cents,
      -- Previous period
      (SELECT COUNT(*)::int FROM rides_v2 WHERE (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.prevStart} AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.prevEnd}) AS prev_total,
      (SELECT COUNT(*)::int FROM rides_v2 r INNER JOIN ride_settlements s ON s.ride_id = r.id WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.prevStart} AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.prevEnd}) AS prev_completed,
      (SELECT ROUND(COALESCE(SUM(s.final_price), 0) * 100)::bigint::text FROM rides_v2 r INNER JOIN ride_settlements s ON s.ride_id = r.id WHERE s.settled_at IS NOT NULL AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.prevStart} AND (s.settled_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.prevEnd}) AS prev_gross_cents,
      ${bounds.start}::text AS period_start,
      ${bounds.end}::text AS period_end
  `);

  const row = result.rows[0]!;

  return {
    tool: 'rides_operations',
    data: {
      periodLabel: bounds.label,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      total: row.total,
      completed: row.completed,
      canceled: row.canceled,
      noDriver: row.no_driver,
      pendingAdjustment: row.pending_adj,
      grossAmountCents: row.gross_cents,
      kaviarFeeCents: row.fee_cents,
      driverEarningsCents: row.driver_cents,
      previous: {
        total: row.prev_total,
        completed: row.prev_completed,
        grossAmountCents: row.prev_gross_cents,
      },
    },
  };
}

// ── Tool 3: finance_accounting_brief ───────────────────────────────────────

const VALID_FINANCE_PERIODS = ['month', 'quarter'] as const;

export async function getFinanceAccountingBrief(args?: Record<string, string>): Promise<{
  tool: 'finance_accounting_brief';
  data: FinanceAccountingBriefData;
}> {
  const period = (args?.period ?? 'month') as 'month' | 'quarter';
  if (!VALID_FINANCE_PERIODS.includes(period)) {
    throw new Error('[finance_accounting_brief] Período inválido. Use month ou quarter.');
  }

  const periodStart = period === 'month'
    ? `date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')::date`
    : `date_trunc('quarter', NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;
  const periodEnd = period === 'month'
    ? `(date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 month')::date`
    : `(date_trunc('quarter', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '3 months')::date`;
  const periodLabel = period === 'month' ? 'Este mês' : 'Este trimestre';

  const result = await pool.query<{
    revenue_cents: string; expense_cents: string; result_cents: string;
    overdue_count: number; overdue_cents: string;
    due7d: number; due15d: number; due30d: number;
    uncat: number;
  }>(`
    SELECT
      COALESCE((SELECT SUM(net_amount_cents) FROM financial_transactions WHERE direction = 'IN' AND status = 'POSTED' AND transaction_date >= ${periodStart} AND transaction_date < ${periodEnd}), 0)::text AS revenue_cents,
      COALESCE((SELECT SUM(net_amount_cents) FROM financial_transactions WHERE direction = 'OUT' AND status = 'POSTED' AND transaction_date >= ${periodStart} AND transaction_date < ${periodEnd}), 0)::text AS expense_cents,
      COALESCE((SELECT SUM(CASE WHEN direction = 'IN' THEN net_amount_cents ELSE -net_amount_cents END) FROM financial_transactions WHERE status = 'POSTED' AND transaction_date >= ${periodStart} AND transaction_date < ${periodEnd}), 0)::text AS result_cents,
      (SELECT COUNT(*)::int FROM financial_obligations WHERE status NOT IN ('PAID','FAILED','CANCELLED') AND due_date IS NOT NULL AND due_date < ${TODAY_SP}) AS overdue_count,
      COALESCE((SELECT SUM(net_amount_cents) FROM financial_obligations WHERE status NOT IN ('PAID','FAILED','CANCELLED') AND due_date IS NOT NULL AND due_date < ${TODAY_SP}), 0)::text AS overdue_cents,
      (SELECT COUNT(*)::int FROM financial_obligations WHERE status NOT IN ('PAID','FAILED','CANCELLED') AND due_date IS NOT NULL AND due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 7) AS due7d,
      (SELECT COUNT(*)::int FROM financial_obligations WHERE status NOT IN ('PAID','FAILED','CANCELLED') AND due_date IS NOT NULL AND due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 15) AS due15d,
      (SELECT COUNT(*)::int FROM financial_obligations WHERE status NOT IN ('PAID','FAILED','CANCELLED') AND due_date IS NOT NULL AND due_date >= ${TODAY_SP} AND due_date <= ${TODAY_SP} + 30) AS due30d,
      (SELECT COUNT(*)::int FROM financial_transactions WHERE category_id IS NULL AND status NOT IN ('CANCELED','REVERSED')) AS uncat
  `);

  const row = result.rows[0]!;

  // Accounting pendencias — computePendencias() requires accountantId (accountant context).
  // Not usable from admin context without creating an artificial scope.
  // Marked as unavailable in this version.
  const accountingPendencias: FinanceAccountingBriefData['accountingPendencias'] = { available: false, total: 0, urgent: 0, high: 0 };

  return {
    tool: 'finance_accounting_brief',
    data: {
      periodLabel,
      realizedRevenueCents: row.revenue_cents,
      realizedExpenseCents: row.expense_cents,
      realizedResultCents: row.result_cents,
      overdueCount: row.overdue_count,
      overdueAmountCents: row.overdue_cents,
      due7dCount: row.due7d,
      due15dCount: row.due15d,
      due30dCount: row.due30d,
      uncategorizedCount: row.uncat,
      accountingPendencias,
    },
  };
}

// ── Tool 4: crm_leads_summary ──────────────────────────────────────────────

const VALID_CRM_PERIODS = ['today', 'week', 'month'] as const;

export async function getCrmLeadsSummary(args?: Record<string, string>): Promise<{
  tool: 'crm_leads_summary';
  data: CrmLeadsSummaryData;
}> {
  const period = (args?.period ?? 'week') as 'today' | 'week' | 'month';
  if (!VALID_CRM_PERIODS.includes(period)) {
    throw new Error('[crm_leads_summary] Período inválido. Use today, week ou month.');
  }

  const bounds = getPeriodBounds(period);

  const result = await pool.query<{
    new_count: number; no_contact: number; stale_3d: number;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start} AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${bounds.end})::int AS new_count,
      COUNT(*) FILTER (WHERE last_contact_at IS NULL AND status = 'NEW')::int AS no_contact,
      COUNT(*) FILTER (WHERE updated_at < (NOW() - INTERVAL '3 days') AND status NOT IN ('ACTIVE','LOST','REJECTED'))::int AS stale_3d
    FROM crm_leads
    WHERE deleted_at IS NULL
  `);

  const row = result.rows[0]!;

  // By status
  const statusResult = await pool.query<{ status: string; cnt: number }>(`
    SELECT status, COUNT(*)::int AS cnt FROM crm_leads WHERE deleted_at IS NULL GROUP BY status ORDER BY cnt DESC
  `);
  const byStatus: Record<string, number> = {};
  for (const r of statusResult.rows) byStatus[r.status] = r.cnt;

  // By source
  const sourceResult = await pool.query<{ source: string; cnt: number }>(`
    SELECT source, COUNT(*)::int AS cnt FROM crm_leads
    WHERE deleted_at IS NULL AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start}
    GROUP BY source ORDER BY cnt DESC LIMIT 10
  `);
  const bySource: Record<string, number> = {};
  for (const r of sourceResult.rows) bySource[r.source] = r.cnt;

  // Top territories
  const terResult = await pool.query<{ name: string; cnt: number }>(`
    SELECT COALESCE(t.name, 'Sem território') AS name, COUNT(*)::int AS cnt
    FROM crm_leads l
    LEFT JOIN operational_territories t ON t.id = l.territory_id::text
    WHERE l.deleted_at IS NULL AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${bounds.start}
    GROUP BY t.name ORDER BY cnt DESC LIMIT 5
  `);
  const topTerritories = terResult.rows.map(r => ({ name: r.name, count: r.cnt }));

  return {
    tool: 'crm_leads_summary',
    data: {
      periodLabel: bounds.label,
      newCount: row.new_count,
      byStatus,
      noContactCount: row.no_contact,
      stale3dCount: row.stale_3d,
      bySource,
      topTerritories,
    },
  };
}

// ── Tool 5: inbox_summary ──────────────────────────────────────────────────

export async function getInboxSummary(args?: Record<string, string>): Promise<{
  tool: 'inbox_summary';
  data: InboxSummaryData;
}> {
  const limitRaw = parseInt(args?.limit ?? '5', 10);
  const limit = Math.max(1, Math.min(10, isNaN(limitRaw) ? 5 : limitRaw));

  const countResult = await pool.query<{ cnt: number }>(`
    SELECT COUNT(*)::int AS cnt FROM inbound_email_messages WHERE status = 'NEW'
  `);
  const totalNew = countResult.rows[0]?.cnt ?? 0;

  const result = await pool.query<{
    subject: string | null;
    from_name: string | null;
    from_email: string;
    received_at: string;
    has_attachments: boolean;
    attachment_count: number;
    text_body: string | null;
    html_body: string | null;
    normalized_body: string | null;
    raw_headers: unknown;
  }>(`
    SELECT subject, from_name, from_email, received_at::text, has_attachments, attachment_count,
           text_body, html_body, normalized_body, raw_headers
    FROM inbound_email_messages
    WHERE status = 'NEW'
    ORDER BY received_at DESC
    LIMIT $1
  `, [limit]);

  const recent = result.rows.map(row => {
    const risk = evaluateInboundEmailSecurityRisk(row);
    const subject = row.subject
      ? (row.subject.length > 100 ? row.subject.slice(0, 100) + '…' : row.subject)
      : '(sem assunto)';
    return {
      subject,
      fromName: row.from_name || row.from_email.split('@')[0],
      receivedAt: row.received_at,
      hasAttachments: row.has_attachments,
      riskLevel: risk.level,
    };
  });

  return {
    tool: 'inbox_summary',
    data: { totalNew, recent },
  };
}

// ── Tool: company_profile ──────────────────────────────────────────────────

export type CompanyProfileSection = 'identity' | 'contacts' | 'governance' | 'structure' | 'activities' | 'about' | 'full';

export type CompanyProfileData = {
  available: boolean;
  section: CompanyProfileSection;
  identity?: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    dataAbertura: string | null;
    situacaoCadastral: string | null;
    dataSituacaoCadastral: string | null;
    porte: string | null;
    naturezaJuridica: string | null;
    capitalSocialCents: string | null;
  };
  contacts?: {
    email: string | null;
    telefone: string | null;
    whatsapp: string | null;
    site: string | null;
    endereco: {
      logradouro: string | null;
      numero: string | null;
      complemento: string | null;
      bairro: string | null;
      municipio: string | null;
      uf: string | null;
      cep: string | null;
    };
  };
  governance?: {
    persons: { nome: string; funcao: string; funcaoOrigem: string }[];
  };
  structure?: {
    available: boolean;
    entities: { cnpj: string; nomeFantasia: string | null; tipo: string; uf: string | null; municipio: string | null; isActive: boolean }[];
  };
  activities?: {
    cnaePrincipal: string | null;
    cnaesSecundarios: string[];
  };
  about?: {
    description: string;
    concepts: string[];
  };
};

const KAVIAR_CNPJ = '67783601000199';

const VALID_SECTIONS: CompanyProfileSection[] = ['identity', 'contacts', 'governance', 'structure', 'activities', 'about', 'full'];

export async function getCompanyProfile(args?: Record<string, string>): Promise<{
  tool: 'company_profile';
  data: CompanyProfileData;
}> {
  const section = (args?.section ?? 'full') as CompanyProfileSection;
  if (!VALID_SECTIONS.includes(section)) {
    throw new Error('[company_profile] Seção inválida. Use identity, contacts, governance, structure, activities ou full.');
  }

  const needsEntity = section !== 'structure' && section !== 'about';
  const needsGovernance = section === 'governance' || section === 'full';
  const needsStructure = section === 'structure' || section === 'full';

  let entity: any = null;
  let persons: any[] = [];
  let entities: any[] = [];

  // Fetch main entity
  if (needsEntity) {
    try {
      const entityResult = await pool.query(`
        SELECT id, cnpj, razao_social, nome_fantasia, entity_type, uf, municipio,
               data_abertura, situacao_cadastral, data_situacao_cadastral,
               porte, natureza_juridica,
               capital_social_cents, email_institucional, telefone_institucional,
               whatsapp_institucional, site, logradouro, numero, complemento,
               bairro, cep, cnae_principal, cnaes_secundarios
        FROM legal_entities
        WHERE cnpj = $1
        LIMIT 1
      `, [KAVIAR_CNPJ]);
      entity = entityResult.rows[0] ?? null;
    } catch {
      return { tool: 'company_profile', data: { available: false, section } };
    }
    if (!entity) {
      return { tool: 'company_profile', data: { available: false, section } };
    }
  }

  // Fetch governance
  if (needsGovernance && entity) {
    try {
      const personsResult = await pool.query(`
        SELECT nome, funcao, funcao_origem
        FROM legal_entity_persons
        WHERE entity_id = $1 AND is_active = true
        ORDER BY funcao_origem, nome
      `, [entity.id]);
      persons = personsResult.rows;
    } catch {
      // Governance unavailable but entity is available
    }
  }

  // Fetch structure
  if (needsStructure) {
    try {
      const structResult = await pool.query(`
        SELECT cnpj, nome_fantasia, entity_type AS tipo, uf, municipio, is_active
        FROM legal_entities
        WHERE is_active = true
        ORDER BY entity_type, nome_fantasia
      `);
      entities = structResult.rows;
    } catch {
      entities = [];
    }
  }

  const data: CompanyProfileData = { available: true, section };

  if (section === 'identity' || section === 'full') {
    data.identity = {
      cnpj: formatCnpj(entity.cnpj),
      razaoSocial: entity.razao_social,
      nomeFantasia: entity.nome_fantasia,
      dataAbertura: entity.data_abertura ? new Date(entity.data_abertura).toISOString().slice(0, 10) : null,
      situacaoCadastral: entity.situacao_cadastral,
      dataSituacaoCadastral: entity.data_situacao_cadastral ? new Date(entity.data_situacao_cadastral).toISOString().slice(0, 10) : null,
      porte: entity.porte,
      naturezaJuridica: entity.natureza_juridica,
      capitalSocialCents: entity.capital_social_cents?.toString() ?? null,
    };
  }

  if (section === 'contacts' || section === 'full') {
    data.contacts = {
      email: entity.email_institucional,
      telefone: entity.telefone_institucional,
      whatsapp: entity.whatsapp_institucional,
      site: entity.site,
      endereco: {
        logradouro: entity.logradouro,
        numero: entity.numero,
        complemento: entity.complemento,
        bairro: entity.bairro,
        municipio: entity.municipio,
        uf: entity.uf,
        cep: entity.cep,
      },
    };
  }

  if (section === 'governance' || section === 'full') {
    data.governance = {
      persons: persons.map((p: any) => ({
        nome: p.nome,
        funcao: p.funcao,
        funcaoOrigem: p.funcao_origem,
      })),
    };
  }

  if (section === 'structure' || section === 'full') {
    data.structure = {
      available: entities.length > 0 || needsStructure,
      entities: entities.map((e: any) => ({
        cnpj: formatCnpj(e.cnpj),
        nomeFantasia: e.nome_fantasia,
        tipo: e.tipo,
        uf: e.uf,
        municipio: e.municipio,
        isActive: e.is_active,
      })),
    };
  }

  if (section === 'activities' || section === 'full') {
    data.activities = {
      cnaePrincipal: entity.cnae_principal,
      cnaesSecundarios: entity.cnaes_secundarios ?? [],
    };
  }

  if (section === 'about' || section === 'full') {
    data.about = {
      description: 'A KAVIAR é uma plataforma brasileira de mobilidade urbana comunitária. Ela conecta passageiros, motoristas e parceiros locais, organizando a operação por cidades, territórios e comunidades. A plataforma reúne recursos de corridas, segurança, gestão de motoristas, CRM, financeiro, comunicação e expansão territorial. Novos territórios são preparados e verificados antes da operação; cadastrar um território não significa ativá-lo automaticamente.',
      concepts: [
        'Empresa: KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA — pessoa jurídica responsável pela plataforma.',
        'Plataforma: sistema tecnológico e operacional desenvolvido pela empresa.',
        'Matriz e filiais: estabelecimentos jurídicos da empresa, identificados por CNPJ.',
        'Território: área municipal ou operacional cadastrada na plataforma. Cadastrar não significa ativar.',
        'Comunidade: organização local utilizada pela operação e pelos motoristas.',
        'Ativação territorial: nunca é automática, exige verificação regulatória e decisão de SUPER_ADMIN.',
        'CRM: organiza leads e contatos comerciais.',
        'Financeiro: controla contas, receitas, despesas, obrigações e informações contábeis.',
        'Inbox e WhatsApp: apoiam a comunicação administrativa.',
        'Chat KAVIAR: assistente administrativo e operacional. Não substitui contador, advogado ou decisão humana.',
      ],
    };
  }

  return { tool: 'company_profile', data };
}

function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
