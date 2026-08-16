/**
 * Pacote "Conhecimento Geral e Command Center v1"
 * 6 tools determinísticas, read-only, sem chamada à OpenAI.
 */
import { pool } from '../../db';
import { projectFromAggregateRows } from '../finance/annual-incentive-payout/balance-projection';

// ══════════════════════════════════════════════════════════════════════════════
// 1. PLATFORM_CATALOG
// ══════════════════════════════════════════════════════════════════════════════

export type PlatformCatalogSection =
  | 'overview'
  | 'mobility_operations'
  | 'people_communities'
  | 'territory_regulatory'
  | 'finance_accounting'
  | 'communications_commercial'
  | 'products_verticals'
  | 'governance';

export type PlatformCatalogData = {
  section: PlatformCatalogSection;
  modules: { name: string; description: string; adminPath?: string }[];
  note: string;
};

const CATALOG: Record<PlatformCatalogSection, { name: string; description: string; adminPath?: string }[]> = {
  overview: [],
  mobility_operations: [
    { name: 'Corridas', description: 'Solicitação, oferta, aceite, acompanhamento e liquidação de corridas.', adminPath: '/admin/rides' },
    { name: 'Cockpit Operacional', description: 'Painel em tempo real de corridas ativas, motoristas online e demanda.', adminPath: '/admin/operations/cockpit' },
    { name: 'Auditoria de Corridas', description: 'Revisão e ajuste de corridas concluídas ou com incidentes.' },
    { name: 'Simulador de Corrida', description: 'Simulação de preço e rota sem criar corrida real.' },
    { name: 'Monitor de Matches', description: 'Visualização do algoritmo de oferta e aceite.' },
    { name: 'Emergências', description: 'Botão de emergência, rastreamento de localização e resolução de incidentes.', adminPath: '/admin/operations/cockpit' },
    { name: 'Compensações', description: 'Créditos compensatórios para passageiros ou motoristas.' },
    { name: 'Avaliações e Reputação', description: 'Notas, badges e sistema de reputação comunitária.' },
    { name: 'KAVIAR Particular', description: 'Corridas privadas com preço acordado entre passageiro e motorista.' },
    { name: 'Corridas Compartilhadas / Rotas Fixas', description: 'Rotas recorrentes com reserva antecipada e divisão de custo.' },
  ],
  people_communities: [
    { name: 'Motoristas', description: 'Cadastro, documentos, modalidades, aprovação e gestão de motoristas.', adminPath: '/admin/drivers' },
    { name: 'Passageiros', description: 'Cadastro e gestão de passageiros.' },
    { name: 'Guias Turísticos', description: 'Profissionais de turismo integrados à plataforma.' },
    { name: 'Comunidades', description: 'Organizações locais vinculadas a bairros e territórios.', adminPath: '/admin/communities' },
    { name: 'Bairros', description: 'Divisão geográfica operacional dentro de cada território.' },
    { name: 'Apoio Local', description: 'Pontos de apoio físico para motoristas e passageiros.' },
  ],
  territory_regulatory: [
    { name: 'Territórios', description: 'Áreas municipais ou operacionais cadastradas. Cadastrar não significa ativar.', adminPath: '/admin/territories' },
    { name: 'Gestores e Operadores Territoriais', description: 'Administradores regionais vinculados a territórios.' },
    { name: 'Parceiros Territoriais', description: 'Parceiros locais com participação operacional ou comercial.' },
    { name: 'Geofences', description: 'Cercas virtuais que delimitam áreas de operação de motoristas.' },
    { name: 'Regulatório Municipal', description: 'Avaliação de exigências municipais para transporte por aplicativo.' },
    { name: 'Checklists e Protocolos Municipais', description: 'Acompanhamento de protocolos junto a prefeituras e órgãos.' },
    { name: 'Seguro APP e Coberturas', description: 'Gestão de coberturas de seguro obrigatório.' },
    { name: 'Landing de Motoristas por Cidade', description: 'Páginas de captação de motoristas por cidade.' },
    { name: 'KAVIAR Lab / Maturidade Territorial', description: 'Painel experimental de indicadores de maturidade por cidade.' },
  ],
  finance_accounting: [
    { name: 'Painel Financeiro', description: 'Dashboard com receitas, despesas, resultado e obrigações.', adminPath: '/admin/finance' },
    { name: 'Transações e Lançamentos Manuais', description: 'Registro e gestão de movimentações financeiras.' },
    { name: 'Obrigações Financeiras', description: 'Contas a pagar com vencimento e status.' },
    { name: 'Contas a Pagar', description: 'Obrigações do portal do contador com fluxo accountant→empresa.' },
    { name: 'Gratificação Anual', description: 'Bônus acumulado pelos motoristas com base na operação.', adminPath: '/admin/annual-incentive' },
    { name: 'Repasses de Gestores', description: 'Ciclos de repasse para gestores territoriais.' },
    { name: 'Repasses Territoriais', description: 'Distribuição de receita por território.' },
    { name: 'Compras de Créditos', description: 'Aquisição de créditos pelo motorista.' },
    { name: 'Pacotes de Saldo', description: 'Configuração de pacotes de recarga.' },
    { name: 'Políticas Financeiras', description: 'Regras de reconhecimento e categorização.' },
    { name: 'Área e Portal do Contador', description: 'Portal dedicado ao contador para obrigações, competências e documentos.' },
  ],
  communications_commercial: [
    { name: 'Inbox Institucional', description: 'E-mails recebidos via Cloudflare Email Worker.', adminPath: '/admin/inbox' },
    { name: 'Central WhatsApp', description: 'Conversas bidirecionais via Twilio.', adminPath: '/admin/whatsapp' },
    { name: 'CRM', description: 'Gestão de leads e funil comercial.', adminPath: '/admin/crm' },
    { name: 'Leads de Consultores', description: 'Leads captados por agentes indicadores.' },
    { name: 'Indicações e Performance Comercial', description: 'Tracking de indicações e métricas de captação.' },
  ],
  products_verticals: [
    { name: 'KAVIAR Pet', description: 'Transporte de animais com motoristas homologados.' },
    { name: 'Premium Tourism', description: 'Corridas turísticas com guias e roteiros.' },
    { name: 'KAVIAR Local / Vitrine de Comércios', description: 'Marketplace de comércios locais parceiros.' },
    { name: 'Grupos KAVIAR', description: 'Agrupamento de motoristas para corridas coletivas.' },
    { name: 'Preferência por Motorista Mulher', description: 'Matching preferencial por gênero.' },
    { name: 'Idosos / CARE', description: 'Atendimento diferenciado para pessoas idosas.' },
  ],
  governance: [
    { name: 'Equipe Administrativa', description: 'Gestão de admins, roles e permissões.', adminPath: '/admin/staff' },
    { name: 'Auditoria', description: 'Log de ações administrativas.' },
    { name: 'Conformidade Jurídica e Operacional', description: 'Checagem de requisitos legais e operacionais.' },
    { name: 'Preços e Taxas', description: 'Configuração de perfis de preço e taxas da plataforma.', adminPath: '/admin/pricing' },
    { name: 'Feature Flags', description: 'Controle de funcionalidades habilitadas por território ou globalmente.' },
    { name: 'Investidores', description: 'Área de documentos e acompanhamento para investidores.' },
    { name: 'Contratos', description: 'Gestão de contratos operacionais e territoriais.' },
  ],
};

const CATALOG_NOTE = 'Módulos existentes na plataforma. A existência de um módulo não significa que esteja disponível em todos os territórios ou habilitado para uso comercial. Território cadastrado ≠ território ativado.';

const VALID_CATALOG_SECTIONS: PlatformCatalogSection[] = ['overview', 'mobility_operations', 'people_communities', 'territory_regulatory', 'finance_accounting', 'communications_commercial', 'products_verticals', 'governance'];

export async function getPlatformCatalog(args?: Record<string, string>): Promise<{
  tool: 'platform_catalog';
  data: PlatformCatalogData;
}> {
  const section = (args?.section ?? 'overview') as PlatformCatalogSection;
  if (!VALID_CATALOG_SECTIONS.includes(section)) {
    throw new Error('[platform_catalog] Seção inválida.');
  }

  if (section === 'overview') {
    // Return all modules across all sections
    const allModules: PlatformCatalogData['modules'] = [];
    for (const [, mods] of Object.entries(CATALOG)) {
      for (const m of mods) allModules.push(m);
    }
    return { tool: 'platform_catalog', data: { section, modules: allModules, note: CATALOG_NOTE } };
  }

  return { tool: 'platform_catalog', data: { section, modules: CATALOG[section], note: CATALOG_NOTE } };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. ANNUAL_INCENTIVE_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

export type AnnualIncentiveForecast = {
  available: boolean;
  observedFrom?: string;
  observedDays?: number;
  projectedAdditionalCents?: string;
  projectedYearEndOutstandingCents?: string;
  basis?: string;
  reason?: string;
};

export type AnnualIncentiveSummaryData = {
  available: boolean;
  totalAccruedCents: string;
  totalAvailableCents: string;
  totalReservedCents: string;
  totalPaidCents: string;
  totalReversedCents: string;
  totalOutstandingCents: string;
  driversWithBalance: number;
  deadlineBreaches: number;
  byYear: { programYear: number; accruedCents: string; availableCents: string; reservedCents: string; paidCents: string }[];
  forecast: AnnualIncentiveForecast;
  referenceTime: string;
};

export async function getAnnualIncentiveSummary(): Promise<{
  tool: 'annual_incentive_summary';
  data: AnnualIncentiveSummaryData;
}> {
  try {
    // Aggregate per driver_id, program_year, event_type — same query shape as canonical projectBalance
    const aggResult = await pool.query<{
      driver_id: string; program_year: number; event_type: string; total_cents: string;
    }>(`
      SELECT driver_id, program_year, event_type, SUM(ABS(amount_cents))::text AS total_cents
      FROM annual_incentive_ledger
      GROUP BY driver_id, program_year, event_type
      ORDER BY driver_id, program_year
    `);

    // Group rows by driver and project each using the canonical function
    const driverRows = new Map<string, { program_year: number; event_type: string; total_cents: string }[]>();
    for (const row of aggResult.rows) {
      if (!driverRows.has(row.driver_id)) driverRows.set(row.driver_id, []);
      driverRows.get(row.driver_id)!.push({ program_year: row.program_year, event_type: row.event_type, total_cents: row.total_cents });
    }

    let totalAccrued = 0n;
    let totalReversed = 0n;
    let totalPaid = 0n;
    let totalReserved = 0n;
    let totalAvailable = 0n;
    let driversWithBalance = 0;
    const yearTotals = new Map<number, { accrued: bigint; available: bigint; reserved: bigint; paid: bigint }>();

    for (const [driverId, rows] of driverRows) {
      const projection = projectFromAggregateRows(driverId, rows);
      totalAccrued += projection.totalAccruedCents;
      totalReversed += projection.totalReversedCents;
      totalPaid += projection.totalPaidCents;
      totalReserved += projection.totalOpenReservedCents;
      totalAvailable += projection.totalAvailableCents;

      // Count driver with balance if outstanding > 0
      if (projection.totalAvailableCents + projection.totalOpenReservedCents > 0n) {
        driversWithBalance++;
      }

      // Aggregate by year
      for (const yr of projection.byYear) {
        if (!yearTotals.has(yr.programYear)) {
          yearTotals.set(yr.programYear, { accrued: 0n, available: 0n, reserved: 0n, paid: 0n });
        }
        const yt = yearTotals.get(yr.programYear)!;
        yt.accrued += yr.accruedCents;
        yt.available += yr.availableCents;
        yt.reserved += yr.openReservedCents;
        yt.paid += yr.paidCents;
      }
    }

    const totalOutstanding = totalAvailable + totalReserved;

    const byYear: AnnualIncentiveSummaryData['byYear'] = [];
    for (const [year, yt] of yearTotals) {
      byYear.push({
        programYear: year,
        accruedCents: yt.accrued.toString(),
        availableCents: yt.available.toString(),
        reservedCents: yt.reserved.toString(),
        paidCents: yt.paid.toString(),
      });
    }
    byYear.sort((a, b) => a.programYear - b.programYear);

    // Deadline breaches
    const breachResult = await pool.query<{ cnt: number }>(`
      SELECT COUNT(*)::int AS cnt
      FROM annual_incentive_requests
      WHERE status NOT IN ('paid', 'rejected', 'cancelled', 'expired')
        AND deadline_at IS NOT NULL
        AND deadline_at < NOW()
    `);
    const deadlineBreaches = breachResult.rows[0]?.cnt ?? 0;

    // Reference time
    const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);
    const referenceTime = refResult.rows[0]?.ref ?? new Date().toISOString();

    // Forecast
    const forecast = await computeIncentiveForecast(totalOutstanding);

    return {
      tool: 'annual_incentive_summary',
      data: {
        available: true,
        totalAccruedCents: totalAccrued.toString(),
        totalAvailableCents: totalAvailable.toString(),
        totalReservedCents: totalReserved.toString(),
        totalPaidCents: totalPaid.toString(),
        totalReversedCents: totalReversed.toString(),
        totalOutstandingCents: totalOutstanding.toString(),
        driversWithBalance,
        deadlineBreaches,
        byYear,
        forecast,
        referenceTime,
      },
    };
  } catch {
    return {
      tool: 'annual_incentive_summary',
      data: {
        available: false,
        totalAccruedCents: '0', totalAvailableCents: '0', totalReservedCents: '0',
        totalPaidCents: '0', totalReversedCents: '0', totalOutstandingCents: '0',
        driversWithBalance: 0, deadlineBreaches: 0, byYear: [],
        forecast: { available: false, reason: 'Fonte indisponível.' },
        referenceTime: new Date().toISOString(),
      },
    };
  }
}

async function computeIncentiveForecast(currentOutstanding: bigint): Promise<AnnualIncentiveForecast> {
  try {
    // Use database timezone for current year calculation (America/Sao_Paulo)
    const yearResult = await pool.query<{ current_year: number; now_sp: string }>(`
      SELECT
        EXTRACT(YEAR FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::int AS current_year,
        (NOW() AT TIME ZONE 'America/Sao_Paulo')::text AS now_sp
    `);
    const currentYear = yearResult.rows[0]?.current_year ?? new Date().getFullYear();
    const nowSp = yearResult.rows[0]?.now_sp ? new Date(yearResult.rows[0].now_sp) : new Date();

    // Net generation: ACCRUAL - REVERSAL only (no PAYMENT, RESERVATION, RELEASE, CARRY_FORWARD)
    const rangeResult = await pool.query<{ first_at: string | null; net_generation: string }>(`
      SELECT
        MIN(occurred_at)::text AS first_at,
        COALESCE(SUM(CASE
          WHEN event_type = 'ACCRUAL' THEN ABS(amount_cents)
          WHEN event_type = 'REVERSAL' THEN -ABS(amount_cents)
          ELSE 0
        END), 0)::text AS net_generation
      FROM annual_incentive_ledger
      WHERE program_year = $1
        AND event_type IN ('ACCRUAL', 'REVERSAL')
    `, [currentYear]);

    const row = rangeResult.rows[0];
    if (!row || !row.first_at) {
      return { available: false, reason: 'Sem eventos de geração no ano corrente.' };
    }

    const firstAt = new Date(row.first_at);
    const observedDays = Math.floor((nowSp.getTime() - firstAt.getTime()) / (1000 * 60 * 60 * 24));

    if (observedDays < 30) {
      return { available: false, reason: `Apenas ${observedDays} dias observados (mínimo: 30).`, observedDays };
    }

    const netGeneration = BigInt(row.net_generation);

    // If net generation is zero or negative, no meaningful projection
    if (netGeneration <= 0n) {
      return { available: true, observedFrom: firstAt.toISOString().slice(0, 10), observedDays, projectedAdditionalCents: '0', projectedYearEndOutstandingCents: currentOutstanding.toString(), basis: 'Geração líquida zero ou negativa no período — projeção adicional: zero.' };
    }

    const dailyRate = netGeneration / BigInt(observedDays);

    // Days remaining until Dec 31 of current year (using SP timezone)
    const yearEnd = new Date(currentYear, 11, 31);
    const daysRemaining = Math.max(0, Math.floor((yearEnd.getTime() - nowSp.getTime()) / (1000 * 60 * 60 * 24)));

    const projectedAdditional = dailyRate * BigInt(daysRemaining);
    const projectedYearEnd = currentOutstanding + projectedAdditional;

    return {
      available: true,
      observedFrom: firstAt.toISOString().slice(0, 10),
      observedDays,
      projectedAdditionalCents: projectedAdditional.toString(),
      projectedYearEndOutstandingCents: projectedYearEnd.toString(),
      basis: `Ritmo diário médio: ${dailyRate.toString()} centavos/dia × ${daysRemaining} dias restantes. Estimativa baseada no ritmo registrado; não é valor já devido nem garantia de pagamento.`,
    };
  } catch {
    return { available: false, reason: 'Não foi possível calcular previsão.' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. WHATSAPP_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

export type WhatsAppSummaryData = {
  available: boolean;
  unreadMessages: number;
  conversationsWithUnread: number;
  newConversations: number;
  inProgressConversations: number;
  highPriorityConversations: number;
  referenceTime: string;
  recentConversations: {
    contactType: string;
    status: string;
    priority: string;
    unreadCount: number;
    lastMessageAt: string | null;
  }[];
};

export async function getWhatsAppSummary(): Promise<{
  tool: 'whatsapp_summary';
  data: WhatsAppSummaryData;
}> {
  try {
    const result = await pool.query<{
      unread_messages: number;
      conversations_with_unread: number;
      new_conversations: number;
      in_progress_conversations: number;
      high_priority: number;
    }>(`
      SELECT
        COALESCE(SUM(unread_count), 0)::int AS unread_messages,
        COUNT(*) FILTER (WHERE unread_count > 0)::int AS conversations_with_unread,
        COUNT(*) FILTER (WHERE status = 'new')::int AS new_conversations,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_conversations,
        COUNT(*) FILTER (WHERE priority = 'urgent')::int AS high_priority
      FROM wa_conversations
      WHERE status NOT IN ('resolved', 'spam')
    `);

    const row = result.rows[0]!;

    const recentResult = await pool.query<{
      contact_type: string; status: string; priority: string; unread_count: number; last_message_at: string | null;
    }>(`
      SELECT contact_type, status, priority, unread_count, last_message_at::text
      FROM wa_conversations
      WHERE status NOT IN ('resolved', 'spam') AND unread_count > 0
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT 5
    `);

    const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);

    return {
      tool: 'whatsapp_summary',
      data: {
        available: true,
        unreadMessages: row.unread_messages,
        conversationsWithUnread: row.conversations_with_unread,
        newConversations: row.new_conversations,
        inProgressConversations: row.in_progress_conversations,
        highPriorityConversations: row.high_priority,
        referenceTime: refResult.rows[0]?.ref ?? new Date().toISOString(),
        recentConversations: recentResult.rows.map(r => ({
          contactType: r.contact_type,
          status: r.status,
          priority: r.priority,
          unreadCount: r.unread_count,
          lastMessageAt: r.last_message_at,
        })),
      },
    };
  } catch {
    return {
      tool: 'whatsapp_summary',
      data: {
        available: false, unreadMessages: 0, conversationsWithUnread: 0,
        newConversations: 0, inProgressConversations: 0, highPriorityConversations: 0,
        referenceTime: new Date().toISOString(), recentConversations: [],
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. DRIVER_PIPELINE_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

export type DriverPipelineSummaryData = {
  available: boolean;
  total: number;
  byStatus: Record<string, number>;
  byVehicleType: Record<string, number>;
  pendingApproval: number;
  docsMissing: number;
  docsSubmitted: number;
  docsRejected: number;
  compliancePending: number;
  activeDrivers: number;
  suspendedDrivers: number;
  modalities: {
    available: boolean;
    pending: number;
    approved: number;
    rejected: number;
  };
  referenceTime: string;
};

export async function getDriverPipelineSummary(): Promise<{
  tool: 'driver_pipeline_summary';
  data: DriverPipelineSummaryData;
}> {
  try {
    const statusResult = await pool.query<{ status: string; cnt: number }>(`
      SELECT status, COUNT(*)::int AS cnt FROM drivers GROUP BY status
    `);
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of statusResult.rows) { byStatus[r.status] = r.cnt; total += r.cnt; }

    const vehicleResult = await pool.query<{ vehicle_type: string; cnt: number }>(`
      SELECT vehicle_type, COUNT(*)::int AS cnt FROM drivers GROUP BY vehicle_type
    `);
    const byVehicleType: Record<string, number> = {};
    for (const r of vehicleResult.rows) byVehicleType[r.vehicle_type] = r.cnt;

    const docsResult = await pool.query<{ docs_missing: number; docs_submitted: number; docs_rejected: number; compliance_pending: number }>(`
      SELECT
        (SELECT COUNT(DISTINCT driver_id)::int FROM driver_documents WHERE status = 'MISSING') AS docs_missing,
        (SELECT COUNT(DISTINCT driver_id)::int FROM driver_documents WHERE status = 'SUBMITTED') AS docs_submitted,
        (SELECT COUNT(DISTINCT driver_id)::int FROM driver_documents WHERE status = 'REJECTED') AS docs_rejected,
        (SELECT COUNT(DISTINCT driver_id)::int FROM driver_compliance_documents WHERE status = 'pending') AS compliance_pending
    `);
    const docs = docsResult.rows[0]!;

    // Modalities (independent source)
    let modalities: DriverPipelineSummaryData['modalities'] = { available: false, pending: 0, approved: 0, rejected: 0 };
    try {
      const modResult = await pool.query<{ status: string; cnt: number }>(`
        SELECT status, COUNT(*)::int AS cnt FROM driver_modalities GROUP BY status
      `);
      const modMap: Record<string, number> = {};
      for (const r of modResult.rows) modMap[r.status] = r.cnt;
      modalities = {
        available: true,
        pending: modMap['PENDING_REVIEW'] ?? 0,
        approved: modMap['APPROVED'] ?? 0,
        rejected: modMap['REJECTED'] ?? 0,
      };
    } catch {
      modalities = { available: false, pending: 0, approved: 0, rejected: 0 };
    }

    const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);

    return {
      tool: 'driver_pipeline_summary',
      data: {
        available: true,
        total,
        byStatus,
        byVehicleType,
        pendingApproval: byStatus['pending'] ?? 0,
        docsMissing: docs.docs_missing,
        docsSubmitted: docs.docs_submitted,
        docsRejected: docs.docs_rejected,
        compliancePending: docs.compliance_pending,
        activeDrivers: byStatus['active'] ?? 0,
        suspendedDrivers: byStatus['suspended'] ?? 0,
        modalities,
        referenceTime: refResult.rows[0]?.ref ?? new Date().toISOString(),
      },
    };
  } catch {
    return {
      tool: 'driver_pipeline_summary',
      data: {
        available: false, total: 0, byStatus: {}, byVehicleType: {},
        pendingApproval: 0, docsMissing: 0, docsSubmitted: 0, docsRejected: 0,
        compliancePending: 0, activeDrivers: 0, suspendedDrivers: 0,
        modalities: { available: false, pending: 0, approved: 0, rejected: 0 },
        referenceTime: new Date().toISOString(),
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. EMERGENCY_OPERATIONS_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

export type EmergencyOperationsSummaryData = {
  emergencies: {
    available: boolean;
    active: number;
    unresolved: number;
    critical: number | null;
    criticalSupported: boolean;
    oldestActiveAt: string | null;
  };
  rides: {
    available: boolean;
    noDriver: number;
    pendingAdjustment: number;
  };
  referenceTime: string;
};

export async function getEmergencyOperationsSummary(): Promise<{
  tool: 'emergency_operations_summary';
  data: EmergencyOperationsSummaryData;
}> {
  const TODAY_SP = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;

  // Emergencies (independent)
  let emergencies: EmergencyOperationsSummaryData['emergencies'] = { available: false, active: 0, unresolved: 0, critical: null, criticalSupported: false, oldestActiveAt: null };
  try {
    const emResult = await pool.query<{ active: number; unresolved: number; oldest_active_at: string | null }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'false_alarm'))::int AS unresolved,
        (MIN(created_at) FILTER (WHERE status = 'active'))::text AS oldest_active_at
      FROM ride_emergency_events
    `);
    const em = emResult.rows[0]!;
    emergencies = { available: true, active: em.active, unresolved: em.unresolved, critical: null, criticalSupported: false, oldestActiveAt: em.oldest_active_at };
  } catch { /* emergencies unavailable */ }

  // Rides (independent)
  let rides: EmergencyOperationsSummaryData['rides'] = { available: false, noDriver: 0, pendingAdjustment: 0 };
  try {
    const ridesResult = await pool.query<{ no_driver: number; pending_adj: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'no_driver' AND (requested_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = ${TODAY_SP})::int AS no_driver,
        COUNT(*) FILTER (WHERE status = 'pending_adjustment')::int AS pending_adj
      FROM rides_v2
    `);
    const rd = ridesResult.rows[0]!;
    rides = { available: true, noDriver: rd.no_driver, pendingAdjustment: rd.pending_adj };
  } catch { /* rides unavailable */ }

  const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);

  return {
    tool: 'emergency_operations_summary',
    data: { emergencies, rides, referenceTime: refResult.rows[0]?.ref ?? new Date().toISOString() },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. TERRITORY_PORTFOLIO_SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

export type TerritoryPortfolioSummaryData = {
  available: boolean;
  total: number;
  byStatus: Record<string, number>;
  byRegulatoryStatus: Record<string, number>;
  withoutManager: number;
  withoutManagerCities: { city: string; uf: string; status: string; isActive: boolean }[];
  withMotoPassenger: number;
  withMotoExpress: number;
  regulatoryChecklist: { available: boolean; pending: number };
  regulatoryProtocols: { available: boolean; pending: number };
  insuranceCoverages: { available: boolean; pending: number };
  cityLandings: { available: boolean; total: number; active: number };
  attentionCities: { city: string; uf: string; reasons: string[] }[];
  referenceTime: string;
};

export async function getTerritoryPortfolioSummary(): Promise<{
  tool: 'territory_portfolio_summary';
  data: TerritoryPortfolioSummaryData;
}> {
  let available = false;
  let total = 0;
  let byStatus: Record<string, number> = {};
  let byRegulatoryStatus: Record<string, number> = {};
  let withoutManager = 0, withMotoPassenger = 0, withMotoExpress = 0;
  let withoutManagerCities: TerritoryPortfolioSummaryData['withoutManagerCities'] = [];

  try {
    const statusResult = await pool.query<{ status: string; cnt: number }>(`
      SELECT status, COUNT(*)::int AS cnt FROM operational_territories WHERE level = 'city' AND is_active = true GROUP BY status
    `);
    for (const r of statusResult.rows) { byStatus[r.status] = r.cnt; total += r.cnt; }

    const regResult = await pool.query<{ regulatory_status: string; cnt: number }>(`
      SELECT regulatory_status, COUNT(*)::int AS cnt FROM operational_territories WHERE level = 'city' AND is_active = true GROUP BY regulatory_status
    `);
    for (const r of regResult.rows) byRegulatoryStatus[r.regulatory_status] = r.cnt;

    const metaResult = await pool.query<{
      without_manager: number;
      moto_passenger: number;
      moto_express: number;
      without_manager_cities: TerritoryPortfolioSummaryData['withoutManagerCities'];
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1
          FROM territory_manager_assignments tma
          JOIN admins manager_admin
            ON manager_admin.id = tma.admin_id
           AND manager_admin.is_active = true
          WHERE tma.status = 'active'
            AND tma.ended_at IS NULL
            AND (
              tma.territory_id = t.id
              OR EXISTS (
                SELECT 1
                FROM operational_territories managed_t
                WHERE managed_t.id = tma.territory_id
                  AND managed_t.parent_id = t.id
                  AND managed_t.level = 'region'
                  AND managed_t.is_active = true
              )
            )
        ))::int AS without_manager,
        COUNT(*) FILTER (WHERE t.moto_passenger_enabled = true)::int AS moto_passenger,
        COUNT(*) FILTER (WHERE t.moto_express_enabled = true)::int AS moto_express,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'city', no_mgr.city_name,
                'uf', no_mgr.uf,
                'status', no_mgr.status,
                'isActive', no_mgr.is_active
              )
              ORDER BY no_mgr.is_active DESC, no_mgr.uf, no_mgr.city_name
            ),
            '[]'::json
          )
          FROM (
            SELECT t2.id, t2.city_name, t2.uf, t2.status, t2.is_active
            FROM operational_territories t2
            WHERE t2.level = 'city'
              AND t2.status <> 'inactive'
              AND NOT EXISTS (
                SELECT 1
                FROM territory_manager_assignments tma2
                JOIN admins manager_admin2
                  ON manager_admin2.id = tma2.admin_id
                 AND manager_admin2.is_active = true
                WHERE tma2.status = 'active'
                  AND tma2.ended_at IS NULL
                  AND (
                    tma2.territory_id = t2.id
                    OR EXISTS (
                      SELECT 1
                      FROM operational_territories managed_t2
                      WHERE managed_t2.id = tma2.territory_id
                        AND managed_t2.parent_id = t2.id
                        AND managed_t2.level = 'region'
                        AND managed_t2.is_active = true
                    )
                  )
              )
            ORDER BY t2.is_active DESC, t2.uf, t2.city_name
            LIMIT 50
          ) no_mgr
        ) AS without_manager_cities
      FROM operational_territories t WHERE t.level = 'city' AND t.is_active = true
    `);
    const meta = metaResult.rows[0]!;
    withoutManager = meta.without_manager;
    withoutManagerCities = Array.isArray(meta.without_manager_cities)
      ? meta.without_manager_cities
      : [];
    withMotoPassenger = meta.moto_passenger;
    withMotoExpress = meta.moto_express;
    available = true;
  } catch { /* core territory data unavailable */ }

  // Regulatory checklist (independent)
  let regulatoryChecklist: TerritoryPortfolioSummaryData['regulatoryChecklist'] = { available: false, pending: 0 };
  try {
    const checkResult = await pool.query<{ cnt: number }>(`
      SELECT COUNT(*)::int AS cnt FROM municipal_regulatory_checklist_items WHERE status = 'PENDING' AND required = true
    `);
    regulatoryChecklist = { available: true, pending: checkResult.rows[0]?.cnt ?? 0 };
  } catch { /* checklist unavailable */ }

  // Regulatory protocols (independent)
  let regulatoryProtocols: TerritoryPortfolioSummaryData['regulatoryProtocols'] = { available: false, pending: 0 };
  try {
    const protResult = await pool.query<{ cnt: number }>(`
      SELECT COUNT(*)::int AS cnt FROM municipal_regulatory_driver_protocols WHERE status NOT IN ('APPROVED', 'CANCELLED')
    `);
    regulatoryProtocols = { available: true, pending: protResult.rows[0]?.cnt ?? 0 };
  } catch { /* protocols unavailable */ }

  // Insurance coverages (independent)
  let insuranceCoverages: TerritoryPortfolioSummaryData['insuranceCoverages'] = { available: false, pending: 0 };
  try {
    const insResult = await pool.query<{ cnt: number }>(`
      SELECT COUNT(*)::int AS cnt FROM operational_insurance_coverages WHERE status IN ('DRAFT', 'EXPIRED', 'SUSPENDED')
    `);
    insuranceCoverages = { available: true, pending: insResult.rows[0]?.cnt ?? 0 };
  } catch { /* insurance unavailable */ }

  // City landings (independent)
  let cityLandings: TerritoryPortfolioSummaryData['cityLandings'] = { available: false, total: 0, active: 0 };
  try {
    const landResult = await pool.query<{ total: number; active: number }>(`
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE landing_enabled = true)::int AS active FROM driver_city_landings
    `);
    cityLandings = { available: true, total: landResult.rows[0]?.total ?? 0, active: landResult.rows[0]?.active ?? 0 };
  } catch { /* landings unavailable */ }

  // Attention cities (top 5 with issues)
  let attentionCities: TerritoryPortfolioSummaryData['attentionCities'] = [];
  if (available) {
    try {
      const attResult = await pool.query<{ city_name: string; uf: string; status: string; regulatory_status: string }>(`
        SELECT city_name, uf, status, regulatory_status FROM operational_territories
        WHERE level = 'city' AND is_active = true
          AND (regulatory_status IN ('blocked', 'suspended') OR status = 'planning')
        ORDER BY CASE WHEN regulatory_status = 'blocked' THEN 0 WHEN regulatory_status = 'suspended' THEN 1 ELSE 2 END
        LIMIT 5
      `);
      attentionCities = attResult.rows.map(r => ({
        city: r.city_name,
        uf: r.uf,
        reasons: [
          ...(r.regulatory_status === 'blocked' ? ['Regulatório bloqueado'] : []),
          ...(r.regulatory_status === 'suspended' ? ['Regulatório suspenso'] : []),
          ...(r.status === 'planning' ? ['Em planejamento'] : []),
        ],
      }));
    } catch { /* attention cities unavailable */ }
  }

  const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);

  return {
    tool: 'territory_portfolio_summary',
    data: {
      available, total, byStatus, byRegulatoryStatus, withoutManager, withoutManagerCities,
      withMotoPassenger, withMotoExpress,
      regulatoryChecklist, regulatoryProtocols, insuranceCoverages, cityLandings, attentionCities,
      referenceTime: refResult.rows[0]?.ref ?? new Date().toISOString(),
    },
  };
}
