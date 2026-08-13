import type {
  KaviarAiRequest,
  KaviarAiResponse,
  KaviarAiToolName,
} from './kaviar-ai.types';
import type { KaviarAiModelProvider } from './kaviar-ai.provider';
import type {
  RidesSummaryTodayData,
  DriversDocumentsPendingData,
  FinanceDueObligationsData,
  TerritoryOnboardingStatusData,
  TerritoryActivationReadinessData,
  DailyBriefingData,
  RidesOperationsData,
  FinanceAccountingBriefData,
  CrmLeadsSummaryData,
  InboxSummaryData,
} from './kaviar-ai.tools';
import { executeTool, canRoleExecuteTool } from './kaviar-ai.registry';
import { routeQuestion } from './kaviar-ai.router';

function formatBRLDecimal(value: string): string {
  const match = value.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    throw new Error('Valor financeiro inválido.');
  }

  const sign = match[1];
  const integer = match[2];
  const fraction = (match[3] ?? '').padEnd(2, '0');

  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${sign}R$ ${grouped},${fraction}`;
}

function formatCentsBRL(cents: string): string {
  const value = BigInt(cents);
  const isNegative = value < 0n;
  const abs = isNegative ? -value : value;
  const integer = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, '0');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}R$ ${grouped},${fraction}`;
}

// ── Formatadores por ferramenta ────────────────────────────────────────────

function formatRidesSummary(data: RidesSummaryTodayData): string {
  const grossAmount = formatBRLDecimal(data.grossAmount);
  const kaviarFee = formatBRLDecimal(data.kaviarFee);

  const ridesLabel =
    data.rides === 1 ? 'corrida liquidada' : 'corridas liquidadas';

  return `Hoje tivemos ${data.rides} ${ridesLabel}, com ${grossAmount} em valor bruto e ${kaviarFee} de receita registrada para a KAVIAR.`;
}

function formatDriversDocumentsPending(data: DriversDocumentsPendingData): string {
  const { driversAffected, summary, compliancePending } = data;

  if (driversAffected === 0 && compliancePending === 0) {
    return 'Nenhum motorista com documentos pendentes no momento.';
  }

  const parts: string[] = [];

  if (driversAffected > 0) {
    const driverLabel =
      driversAffected === 1 ? 'motorista' : 'motoristas';
    parts.push(
      `${driversAffected} ${driverLabel} com documentos pendentes`
    );

    const statusParts: string[] = [];
    for (const [status, count] of Object.entries(summary)) {
      statusParts.push(`${status}: ${count}`);
    }
    if (statusParts.length > 0) {
      parts.push(`(${statusParts.join(', ')})`);
    }
  }

  if (compliancePending > 0) {
    const compLabel =
      compliancePending === 1 ? 'motorista' : 'motoristas';
    parts.push(
      `${compliancePending} ${compLabel} com documento de compliance aguardando aprovação`
    );
  }

  return `Há ${parts.join('. ')}.`;
}

function formatFinanceDueObligations(data: FinanceDueObligationsData): string {
  const { totalPending, totalAmountCents, overdueCount, overdueAmountCents, dueSoonCount, dueSoonAmountCents } = data;

  if (totalPending === 0) {
    return 'Não há obrigações financeiras pendentes com vencimento registrado.';
  }

  const parts: string[] = [];

  parts.push(
    `${totalPending} ${totalPending === 1 ? 'obrigação pendente' : 'obrigações pendentes'}, totalizando ${formatCentsBRL(totalAmountCents)}`
  );

  if (overdueCount > 0) {
    parts.push(
      `${overdueCount} ${overdueCount === 1 ? 'está vencida' : 'estão vencidas'} (${formatCentsBRL(overdueAmountCents)})`
    );
  }

  if (dueSoonCount > 0) {
    parts.push(
      `${dueSoonCount} ${dueSoonCount === 1 ? 'vence' : 'vencem'} nos próximos 7 dias (${formatCentsBRL(dueSoonAmountCents)})`
    );
  }

  return `Há ${parts.join('. ')}.`;
}

function formatTerritoryOnboarding(data: TerritoryOnboardingStatusData): string {
  if (!data.found) {
    return data.pendencies[0] || 'Território não encontrado.';
  }
  const t = data.territory!;
  const parts: string[] = [];
  parts.push(`ID: ${t.id}`);
  parts.push(`Cidade: ${t.city_name || t.name}/${t.uf || '??'}`);
  parts.push(`Território: ${t.name}`);
  parts.push(`Status: ${t.status}`);
  parts.push(`Regulatório: ${t.regulatory_status}`);
  parts.push(`Gestor: ${data.manager ? data.manager.name : 'Nenhum vinculado'}`);
  if (t.moto_express_enabled) parts.push('Moto Express: habilitado');
  if (t.moto_passenger_enabled) parts.push('Moto Passageiro: habilitado');
  if (data.pendencies.length > 0) {
    parts.push(`\nPendências:\n${data.pendencies.map(p => `• ${p}`).join('\n')}`);
  }
  return parts.join('\n');
}

function formatTerritoryReadiness(data: TerritoryActivationReadinessData): string {
  if (!data.territory) {
    return data.reasons[0] || 'Território não encontrado.';
  }
  const status = data.ready ? '✓ READY' : '✗ NOT_READY';
  const parts = [`Prontidão: ${status}`, `Território: ${data.territory.name} (${data.territory.status})`];
  parts.push(data.reasons.map(r => `• ${r}`).join('\n'));
  return parts.join('\n');
}

function formatDailyBriefing(data: DailyBriefingData): string {
  const parts: string[] = [];
  parts.push(`📋 Briefing Administrativo — ${data.referenceTime} (America/Sao_Paulo)`);
  parts.push(`Prioridade geral: ${data.priority}`);
  parts.push('');

  // Rides
  if (data.rides.available) {
    parts.push(`🚗 Corridas hoje: ${data.rides.completed} liquidadas (bruto: ${formatBRLDecimal(data.rides.grossAmount)}, receita KAVIAR: ${formatBRLDecimal(data.rides.kaviarFee)})`);
    if (data.rides.canceled > 0) parts.push(`   Canceladas: ${data.rides.canceled}`);
    if (data.rides.noDriver > 0) parts.push(`   Sem motorista: ${data.rides.noDriver}`);
    if (data.rides.pendingAdjustment > 0) parts.push(`   Ajuste pendente: ${data.rides.pendingAdjustment}`);
  } else {
    parts.push('🚗 Corridas hoje: não foi possível consultar.');
  }

  // Drivers
  if (data.drivers.available) {
    parts.push(`👤 Motoristas: ${data.drivers.docsPending} docs pendentes, ${data.drivers.pendingApproval} aguardando aprovação, ${data.drivers.compliancePending} compliance pendente`);
  } else {
    parts.push('👤 Motoristas: não foi possível consultar.');
  }

  // Finance
  if (data.finance.available) {
    parts.push(`💰 Financeiro: ${data.finance.overdueCount} vencida(s), ${data.finance.due7dCount} em 7d, ${data.finance.due15dCount} em 15d, ${data.finance.due30dCount} em 30d`);
    if (data.finance.uncategorizedAvailable) {
      if (data.finance.uncategorizedTransactions > 0) parts.push(`   ${data.finance.uncategorizedTransactions} lançamento(s) sem categoria`);
    } else {
      parts.push('   Lançamentos sem categoria: não foi possível consultar.');
    }
  } else {
    parts.push('💰 Financeiro: não foi possível consultar.');
  }

  // Leads
  if (data.leads.available) {
    parts.push(`📊 Leads: ${data.leads.newToday} novos hoje, ${data.leads.noContact} sem contato, ${data.leads.stale3d} parados >3d`);
  } else {
    parts.push('📊 Leads: não foi possível consultar.');
  }

  // Inbox
  if (data.inbox.available) {
    parts.push(`📧 Inbox: ${data.inbox.newCount} novos`);
    if (data.inbox.highRiskRecentCount > 0) {
      parts.push(`   ${data.inbox.highRiskRecentCount} com risco elevado entre os ${data.inbox.riskAssessedLimit} e-mails novos mais recentes analisados`);
    }
    if (data.inbox.latestSubjects.length > 0) {
      parts.push('   Últimos assuntos:');
      for (const s of data.inbox.latestSubjects) parts.push(`   • ${s}`);
    }
  } else {
    parts.push('📧 Inbox: não foi possível consultar.');
  }

  // Territories
  if (data.territories.available) {
    parts.push(`🗺️ Territórios: ${data.territories.preparationCount} em preparação, ${data.territories.withoutManagerCount} sem gestor`);
  } else {
    parts.push('🗺️ Territórios: não foi possível consultar.');
  }

  // Priority items
  if (data.highItems.length > 0) {
    parts.push('');
    parts.push('🔴 PRIORIDADE ALTA:');
    for (const i of data.highItems) parts.push(`  • ${i}`);
  }
  if (data.attentionItems.length > 0) {
    parts.push('');
    parts.push('🟡 ATENÇÃO:');
    for (const i of data.attentionItems) parts.push(`  • ${i}`);
  }
  if (data.normalItems.length > 0 && data.highItems.length === 0 && data.attentionItems.length === 0) {
    parts.push('');
    parts.push('🟢 SITUAÇÃO NORMAL:');
    for (const i of data.normalItems) parts.push(`  • ${i}`);
  }
  if (data.unavailableItems.length > 0) {
    parts.push('');
    parts.push('⚠️ INDISPONÍVEL:');
    for (const i of data.unavailableItems) parts.push(`  • ${i}`);
  }

  return parts.join('\n');
}

function formatRidesOperations(data: RidesOperationsData): string {
  const parts: string[] = [];
  parts.push(`🚗 Corridas — ${data.periodLabel}`);
  parts.push(`Total: ${data.total} | Concluídas: ${data.completed} | Canceladas: ${data.canceled} | Sem motorista: ${data.noDriver} | Ajuste pendente: ${data.pendingAdjustment}`);
  parts.push(`Valor bruto: ${formatCentsBRL(data.grossAmountCents)} | Receita KAVIAR: ${formatCentsBRL(data.kaviarFeeCents)} | Ganhos motoristas: ${formatCentsBRL(data.driverEarningsCents)}`);
  parts.push('');
  parts.push(`Período anterior: ${data.previous.total} corridas, ${data.previous.completed} concluídas, ${formatCentsBRL(data.previous.grossAmountCents)} bruto`);
  const diff = data.completed - data.previous.completed;
  if (diff > 0) parts.push(`  ↑ +${diff} concluídas vs. período anterior`);
  else if (diff < 0) parts.push(`  ↓ ${diff} concluídas vs. período anterior`);
  else parts.push('  = Mesmo volume do período anterior');
  return parts.join('\n');
}

function formatFinanceAccountingBrief(data: FinanceAccountingBriefData): string {
  const parts: string[] = [];
  parts.push(`💰 Financeiro e Contábil — ${data.periodLabel}`);
  parts.push(`Receita realizada: ${formatCentsBRL(data.realizedRevenueCents)}`);
  parts.push(`Despesas realizadas: ${formatCentsBRL(data.realizedExpenseCents)}`);
  parts.push(`Resultado: ${formatCentsBRL(data.realizedResultCents)}`);
  parts.push('');
  parts.push(`Obrigações: ${data.overdueCount} vencida(s), ${data.due7dCount} em 7d, ${data.due15dCount} em 15d, ${data.due30dCount} em 30d`);
  if (data.uncategorizedCount > 0) parts.push(`Lançamentos sem categoria: ${data.uncategorizedCount}`);
  if (data.accountingPendencias.available) {
    if (data.accountingPendencias.total > 0) {
      parts.push(`Pendências contábeis: ${data.accountingPendencias.total} total (${data.accountingPendencias.urgent} urgente(s), ${data.accountingPendencias.high} alta(s))`);
    } else {
      parts.push('Pendências contábeis: nenhuma.');
    }
  } else {
    parts.push('Pendências contábeis: não foi possível consultar (fonte indisponível).');
  }
  return parts.join('\n');
}

function formatCrmLeadsSummary(data: CrmLeadsSummaryData): string {
  const parts: string[] = [];
  parts.push(`📊 CRM Leads — ${data.periodLabel}`);
  parts.push(`Novos: ${data.newCount} | Sem contato: ${data.noContactCount} | Parados >3d: ${data.stale3dCount}`);
  parts.push('');
  const statusEntries = Object.entries(data.byStatus).slice(0, 8);
  if (statusEntries.length > 0) {
    parts.push('Funil:');
    for (const [status, count] of statusEntries) parts.push(`  ${status}: ${count}`);
  }
  if (Object.keys(data.bySource).length > 0) {
    parts.push('');
    parts.push('Por origem:');
    for (const [source, count] of Object.entries(data.bySource).slice(0, 5)) {
      parts.push(`  ${source}: ${count}`);
    }
  }
  if (data.topTerritories.length > 0) {
    parts.push('');
    parts.push('Top territórios:');
    for (const t of data.topTerritories) parts.push(`  ${t.name}: ${t.count}`);
  }
  return parts.join('\n');
}

function formatInboxSummary(data: InboxSummaryData): string {
  const parts: string[] = [];
  parts.push(`📧 Inbox — ${data.totalNew} e-mail(s) novo(s)`);
  if (data.recent.length === 0) {
    parts.push('Nenhum e-mail novo na caixa de entrada.');
    return parts.join('\n');
  }
  parts.push('');
  for (const r of data.recent) {
    const risk = r.riskLevel !== 'LOW' ? ` [risco: ${r.riskLevel}]` : '';
    const attach = r.hasAttachments ? ' 📎' : '';
    parts.push(`• ${r.subject}${attach}${risk}`);
    parts.push(`  De: ${r.fromName} — ${r.receivedAt}`);
  }
  return parts.join('\n');
}

const FORMATTERS: Record<KaviarAiToolName, (data: unknown) => string> = {
  rides_summary_today: (data) =>
    formatRidesSummary(data as RidesSummaryTodayData),
  drivers_documents_pending: (data) =>
    formatDriversDocumentsPending(data as DriversDocumentsPendingData),
  finance_due_obligations: (data) =>
    formatFinanceDueObligations(data as FinanceDueObligationsData),
  territory_onboarding_status: (data) =>
    formatTerritoryOnboarding(data as TerritoryOnboardingStatusData),
  territory_activation_readiness: (data) =>
    formatTerritoryReadiness(data as TerritoryActivationReadinessData),
  daily_briefing: (data) =>
    formatDailyBriefing(data as DailyBriefingData),
  rides_operations: (data) =>
    formatRidesOperations(data as RidesOperationsData),
  finance_accounting_brief: (data) =>
    formatFinanceAccountingBrief(data as FinanceAccountingBriefData),
  crm_leads_summary: (data) =>
    formatCrmLeadsSummary(data as CrmLeadsSummaryData),
  inbox_summary: (data) =>
    formatInboxSummary(data as InboxSummaryData),
};

// ── Extração de city/uf da pergunta ─────────────────────────────────────────

function parseCityUf(question: string): { city: string; uf: string } | null {
  const STOP_WORDS = new Set(['quero', 'abrir', 'cadastrar', 'como', 'verificar', 'criar', 'está', 'status', 'cidade', 'território', 'territorio', 'nova', 'novo']);

  let match = question.match(/(.+?)\s*\/\s*([A-Z]{2})(?:\s|$|[.,!?])/);
  if (!match) match = question.match(/(.+?)\s+[-–]\s+([A-Z]{2})(?:\s|$|[.,!?])/);
  if (!match) match = question.match(/(.+?)\s*\(\s*([A-Z]{2})\s*\)/);
  if (!match) return null;

  const uf = match[2].trim();
  if (uf.length !== 2) return null;

  const words = match[1].trim().split(/\s+/);
  while (words.length > 0 && STOP_WORDS.has(words[0].toLowerCase())) {
    words.shift();
  }
  const city = words.join(' ').trim();
  if (city.length < 2) return null;

  return { city, uf };
}

// ── Extração de período da pergunta ─────────────────────────────────────────

function parsePeriod(question: string): 'today' | 'week' | 'month' {
  const q = question.toLowerCase();
  if (q.includes('mês') || q.includes('mes') || q.includes('mensal')) return 'month';
  if (q.includes('semana') || q.includes('semanal')) return 'week';
  return 'today';
}

// ── Roles permitidas no Chat KAVIAR ─────────────────────────────────────────

const ALLOWED_CHAT_ROLES = new Set(['SUPER_ADMIN', 'FINANCE']);

// ── Função principal ───────────────────────────────────────────────────────

export async function askKaviarAi(
  request: KaviarAiRequest,
  provider?: KaviarAiModelProvider
): Promise<KaviarAiResponse> {
  const question = request.question.trim();
  const role = request.role;

  // Fail-closed: role MUST come from the authenticated middleware, never body
  if (!role || !ALLOWED_CHAT_ROLES.has(role)) {
    return {
      answer: 'Acesso negado: role ausente ou não autorizada.',
      toolsUsed: [],
    };
  }

  if (!question) {
    return {
      answer: 'Faça uma pergunta para a KAVIAR IA.',
      toolsUsed: [],
    };
  }

  const route = await routeQuestion(question, provider);

  if (route.toolsToCall.length === 0) {
    return {
      answer: `Ainda não sei responder: "${question}".`,
      toolsUsed: [],
    };
  }

  // Filter tools by RBAC
  const authorizedTools = route.toolsToCall.filter(t => canRoleExecuteTool(role, t));
  if (authorizedTools.length === 0) {
    return {
      answer: 'Você não tem permissão para acessar essas informações.',
      toolsUsed: [],
    };
  }

  const answers: string[] = [];
  const toolsUsed: KaviarAiToolName[] = [];

  // Territorial tools need city/uf
  const territorialTools: KaviarAiToolName[] = ['territory_onboarding_status', 'territory_activation_readiness'];
  let territorialArgs: Record<string, string> | undefined;

  if (authorizedTools.some(t => territorialTools.includes(t))) {
    const parsed = parseCityUf(question);
    if (!parsed) {
      return {
        answer: 'Informe a cidade e a UF, por exemplo: Pirassununga/SP.',
        toolsUsed: [],
      };
    }
    territorialArgs = parsed;
  }

  // Period-based tools
  const periodTools: KaviarAiToolName[] = ['rides_operations', 'crm_leads_summary'];
  const period = parsePeriod(question);

  // Finance period
  const financePeriod = question.toLowerCase().includes('trimestre') || question.toLowerCase().includes('quarter')
    ? 'quarter' : 'month';

  for (const toolName of authorizedTools) {
    let args: Record<string, string> | undefined;

    if (territorialTools.includes(toolName)) {
      args = territorialArgs;
    } else if (periodTools.includes(toolName)) {
      args = { period };
    } else if (toolName === 'finance_accounting_brief') {
      args = { period: financePeriod };
    }

    const result = await executeTool(toolName, args);
    const formatter = FORMATTERS[result.tool as KaviarAiToolName];
    const formatted = formatter
      ? formatter(result.data)
      : `Resultado obtido da ferramenta "${result.tool}".`;
    answers.push(formatted);
    toolsUsed.push(result.tool as KaviarAiToolName);
  }

  return {
    answer: answers.join('\n\n'),
    toolsUsed,
  };
}
