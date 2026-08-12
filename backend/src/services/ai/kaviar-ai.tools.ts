import { pool } from '../../db';

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

  // Busca gestor vinculado (manager assignment ativo)
  const managerResult = await pool.query<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  }>(`
    SELECT a.id, a.name, a.email, a.role,
           tma.status
    FROM territory_manager_assignments tma
    INNER JOIN admins a ON a.id = tma.admin_id
    WHERE tma.territory_id = $1
      AND tma.status = 'active'
      AND tma.ended_at IS NULL
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
    `, [manager.id, territory.id]);
    const profile = profileResult.rows[0];
    if (profile) {
      if (!profile.is_active) pendencies.push('Perfil do gestor inativo.');
      if (profile.contract_status !== 'signed' && profile.contract_status !== 'not_required') pendencies.push(`Contrato do gestor: ${profile.contract_status}.`);
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
    FROM territory_manager_assignments
    WHERE territory_id = $1 AND status = 'active' AND ended_at IS NULL
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
      INNER JOIN operator_profiles op ON op.admin_id = tma.admin_id AND op.territory_id = tma.territory_id
      WHERE tma.territory_id = $1 AND tma.status = 'active' AND tma.ended_at IS NULL
      LIMIT 1
    `, [territory.id]);

    const profile = profileResult.rows[0];
    if (!profile) {
      reasons.push('Gestor sem perfil operacional.');
    } else {
      if (!profile.is_active) reasons.push('Perfil do gestor inativo.');
      if (profile.contract_status !== 'signed' && profile.contract_status !== 'not_required') {
        reasons.push(`Contrato do gestor: ${profile.contract_status}.`);
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
