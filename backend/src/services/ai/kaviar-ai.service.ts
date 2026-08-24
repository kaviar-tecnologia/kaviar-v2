import { pool } from '../../db';
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
  CompanyProfileData,
  CompanyProfileSection,
} from './kaviar-ai.tools';
import type {
  PlatformCatalogData,
  AnnualIncentiveSummaryData,
  WhatsAppSummaryData,
  DriverPipelineSummaryData,
  EmergencyOperationsSummaryData,
  TerritoryPortfolioSummaryData,
  TerritoryManagerCoverageData,
} from './kaviar-ai.command-center';
import type { KnowledgeAnswerData } from './kaviar-ai.knowledge';
import type { DriverRatingsSummaryData } from './kaviar-ai.driver-ratings';
import type { ComplianceSummaryData, ExcellenceSealSummaryData } from './kaviar-ai.compliance-seal';
import type { OperationsOverviewData, PersonLookupData, DriverDetailData, SealHistoryData } from './kaviar-ai.central-ops';
import type { DriverCityLandingsData } from './kaviar-ai.city-landings';
import type { CityOpeningOverviewData } from './kaviar-ai.city-opening-overview';
import { MIN_DRIVERS_FOR_TERRITORY_ACTIVATION } from './kaviar-ai.city-opening-overview';
import { getCityOpeningOverview } from './kaviar-ai.city-opening-overview';
import { executeTool, canRoleExecuteTool } from './kaviar-ai.registry';
import { routeQuestion, getRouterMode } from './kaviar-ai.router';
import { orchestrate, classifyIntent } from './kaviar-ai.orchestrator';
import { classifyDriverIntent, refineDriverTools, formatConsolidatedPending } from './kaviar-ai.driver-intent';
import { classifyFinanceIntent, formatFinancePendingSummary, formatFinanceOverdue, formatFinanceDueSoon } from './kaviar-ai.finance-intent';
import { classifyCrmIntent, formatCrmIntent } from './kaviar-ai.crm-intent';
import {
  classifySupervisorIntent,
  formatSupervisorActions,
} from './kaviar-ai.supervisor';
import {
  detectOperationalFindings,
  formatOperationalFindings,
  isInconsistencyQuestion,
} from './kaviar-ai.inconsistency-detector';
import {
  isDriverDocumentsInvestigation,
  formatDriverDocumentsInvestigation,
} from './kaviar-ai.investigator';
import {
  classifyCommunicationIntent,
  formatEmailNew,
  formatEmailImportant,
  formatEmailSubjects,
  formatEmailRisk,
  formatWhatsAppUnread,
  formatWhatsAppUrgent,
  formatWhatsAppNew,
} from './kaviar-ai.communication-intent';
import {
  isTerritoryManagerInvestigation,
  investigateTerritoryManager,
  formatTerritoryManagerInvestigation,
} from './kaviar-ai.territory-investigator';
import { detectDevelopmentIntent } from './kaviar-ai.dev-intent';
import { detectDraftingIntent } from './kaviar-ai.drafting-intent';
import { searchKnowledgeSemantic } from './kaviar-ai.knowledge-semantic';
import type { KaviarAiDraftingComposer } from './kaviar-ai.provider';

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

function formatDateBR(isoDate: string): string {
  // Input: 'YYYY-MM-DD' (from ISO slice). Output: 'DD/MM/YYYY'
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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
  if (data.manager) {
    const scope =
      data.manager.territory_level === 'region'
        ? ` (${data.manager.territory_name})`
        : '';
    parts.push(`Tem gestor: Sim — ${data.manager.name}${scope}`);
  } else {
    parts.push('Tem gestor: Não');
  }
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
    parts.push('Pendências do contador: indisponíveis nesta versão porque exigem contexto do contador.');
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

function formatCompanyProfile(data: CompanyProfileData): string {
  if (!data.available) {
    return 'Dados institucionais: não foi possível consultar.';
  }

  const parts: string[] = [];

  if (data.about) {
    parts.push('🏢 Sobre a KAVIAR');
    parts.push(data.about.description);
    parts.push('');
    parts.push('Conceitos:');
    for (const c of data.about.concepts) parts.push(`• ${c}`);
  }

  if (data.identity) {
    parts.push('');
    parts.push('📋 Identidade');
    parts.push(`CNPJ: ${data.identity.cnpj}`);
    parts.push(`Razão social: ${data.identity.razaoSocial}`);
    if (data.identity.nomeFantasia) parts.push(`Nome fantasia: ${data.identity.nomeFantasia}`);
    if (data.identity.dataAbertura) parts.push(`Data de abertura: ${formatDateBR(data.identity.dataAbertura)}`);
    if (data.identity.situacaoCadastral) {
      const since = data.identity.dataSituacaoCadastral ? ` desde ${formatDateBR(data.identity.dataSituacaoCadastral)}` : '';
      parts.push(`Situação cadastral: ${data.identity.situacaoCadastral}${since}`);
    }
    if (data.identity.porte) parts.push(`Porte: ${data.identity.porte}`);
    if (data.identity.naturezaJuridica) parts.push(`Natureza jurídica: ${data.identity.naturezaJuridica}`);
    if (data.identity.capitalSocialCents) parts.push(`Capital social: ${formatCentsBRL(data.identity.capitalSocialCents)}`);
  }

  if (data.contacts) {
    parts.push('');
    parts.push('📞 Contatos');
    if (data.contacts.email) parts.push(`E-mail: ${data.contacts.email}`);
    if (data.contacts.telefone) parts.push(`Telefone: ${data.contacts.telefone}`);
    if (data.contacts.whatsapp) parts.push(`WhatsApp: ${data.contacts.whatsapp}`);
    if (data.contacts.site) parts.push(`Site: ${data.contacts.site}`);
    const e = data.contacts.endereco;
    if (e.logradouro) {
      const addr = [e.logradouro, e.numero, e.complemento, e.bairro, e.municipio ? `${e.municipio}/${e.uf}` : null, e.cep ? `CEP ${e.cep}` : null].filter(Boolean).join(', ');
      parts.push(`Endereço: ${addr}`);
    }
  }

  if (data.governance) {
    parts.push('');
    parts.push('👥 Governança');
    if (data.governance.persons.length === 0) {
      parts.push('Nenhuma pessoa cadastrada.');
    } else {
      for (const p of data.governance.persons) {
        const origem = p.funcaoOrigem === 'RFB_QSA' ? '(QSA/Receita Federal)' : '(função interna)';
        parts.push(`• ${p.nome} — ${p.funcao} ${origem}`);
      }
    }
  }

  if (data.structure) {
    parts.push('');
    parts.push('🏗️ Estrutura');
    if (!data.structure.available || data.structure.entities.length === 0) {
      parts.push('Não foi possível consultar a estrutura.');
    } else {
      for (const e of data.structure.entities) {
        parts.push(`• ${e.nomeFantasia || 'Sem nome fantasia'} (${e.tipo}) — ${e.cnpj} — ${e.municipio || ''}/${e.uf || ''}`);
      }
    }
  }

  if (data.activities) {
    parts.push('');
    parts.push('📊 Atividades');
    if (data.activities.cnaePrincipal) parts.push(`CNAE principal: ${data.activities.cnaePrincipal}`);
    if (data.activities.cnaesSecundarios.length > 0) {
      parts.push('CNAEs secundários:');
      for (const c of data.activities.cnaesSecundarios) parts.push(`• ${c}`);
    }
  }

  if (parts.length === 0) {
    return 'Dados institucionais: não cadastrados.';
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
  territory_manager_coverage: (data) =>
    formatTerritoryManagerCoverage(data as TerritoryManagerCoverageData),
  territory_activation_readiness: (data) =>
    formatTerritoryReadiness(data as TerritoryActivationReadinessData),
  driver_city_landings: (data) =>
    formatDriverCityLandings(data as DriverCityLandingsData),
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
  company_profile: (data) =>
    formatCompanyProfile(data as CompanyProfileData),
  platform_catalog: (data) =>
    formatPlatformCatalog(data as PlatformCatalogData),
  annual_incentive_summary: (data) =>
    formatAnnualIncentiveSummary(data as AnnualIncentiveSummaryData),
  whatsapp_summary: (data) =>
    formatWhatsAppSummary(data as WhatsAppSummaryData),
  driver_pipeline_summary: (data) =>
    formatDriverPipelineSummary(data as DriverPipelineSummaryData),
  emergency_operations_summary: (data) =>
    formatEmergencyOperationsSummary(data as EmergencyOperationsSummaryData),
  territory_portfolio_summary: (data) =>
    formatTerritoryPortfolioSummary(data as TerritoryPortfolioSummaryData),
  knowledge_answer: (data) =>
    formatKnowledgeAnswer(data as KnowledgeAnswerData),
  driver_ratings_summary: (data) =>
    formatDriverRatingsSummary(data as DriverRatingsSummaryData),
  compliance_summary: (data) => {
    const d = data as ComplianceSummaryData;
    if (!d.available) return 'Compliance: não foi possível consultar.';
    return `📋 Compliance de Antecedentes — ${d.referenceTime}\nVálidos: ${d.valid} | Vencendo em 30d: ${d.expiringSoon30d} | Vencidos: ${d.expired}\nPendentes de análise: ${d.pending} | Sem data de emissão: ${d.noEmissionDate}\nTotal de registros: ${d.total}`;
  },
  excellence_seal_summary: (data) => {
    const d = data as ExcellenceSealSummaryData;
    if (!d.available) return 'Selo Excelência: não foi possível consultar.';
    return `🏆 Selo Excelência KAVIAR — ${d.referenceTime}\nAtivos: ${d.activeCount} | Suspensos: ${d.suspendedCount}\nEsta semana: +${d.grantedThisWeek} concedidos, ${d.suspendedThisWeek} suspensos`;
  },
  operations_overview: (data) => {
    const d = data as OperationsOverviewData;
    if (!d.available) return 'Visão operacional: não foi possível consultar.';
    const parts = [`📊 Visão Operacional — ${d.referenceTime}`];
    parts.push(`Motoristas: ${d.drivers.total} total | ${d.drivers.active} ativos | ${d.drivers.pending} pendentes | ${d.drivers.suspended} suspensos`);
    parts.push(`Selo Excelência: ${d.drivers.sealActive} ativos, ${d.drivers.sealSuspended} suspensos`);
    if (d.drivers.petApproved > 0) parts.push(`Homologações Pet aprovadas: ${d.drivers.petApproved}`);
    parts.push(`Admins: ${d.admins.total} (${Object.entries(d.admins.byRole).map(([r,c]) => `${r}: ${c}`).join(', ')})`);
    parts.push(`Territórios: ${d.territories.total} total | ${d.territories.active} ativos | ${d.territories.preparation} preparação | ${d.territories.blocked} bloqueados`);
    return parts.join('\n');
  },
  person_lookup: (data) => {
    const d = data as PersonLookupData;
    if (!d.available) return 'Busca de pessoa: não foi possível consultar.';
    if (d.results.length === 0) return d.message;
    const parts = [d.message, ''];
    for (const r of d.results) {
      const link = r.adminLink ? ` → gestão: ${r.adminLink}` : '';
      parts.push(`• ${r.name} (${r.type}) — ${r.status}${r.role ? ` [${r.role}]` : ''}${link}`);
    }
    return parts.join('\n');
  },
  driver_detail: (data) => {
    const d = data as DriverDetailData;
    if (!d.available) return 'Detalhe do motorista: não foi possível consultar.';
    if (!d.found) return 'Motorista não encontrado.';
    const parts = [`👤 ${d.name} — ${d.status} (${d.vehicleType})`];
    if (d.rating) { parts.push(`Avaliações: média ${d.rating.average ?? '—'} | total ${d.rating.total} | baixas 30d: ${d.rating.lowLast30d}${d.rating.needsAttention ? ' ⚠️' : ''}`); }
    if (d.compliance) { parts.push(`Compliance: ${d.compliance.currentStatus} | validade: ${d.compliance.validUntil ?? 'indisponível'}`); }
    if (d.seal) { parts.push(`Selo: ${d.seal.active ? '✓ Ativo' : d.seal.suspended ? '⏸ Suspenso' : '—'}${d.seal.grantedAt ? ` (desde ${d.seal.grantedAt.slice(0,10)})` : ''}`); }
    if (d.modalities.length > 0) { parts.push(`Modalidades: ${d.modalities.map(m => `${m.modality}:${m.status}`).join(', ')}`); }
    parts.push(`Admin: ${d.adminLink}`);
    return parts.join('\n');
  },
  seal_history: (data) => {
    const d = data as SealHistoryData;
    if (!d.available) return 'Histórico do selo: não foi possível consultar.';
    const parts = [`🏆 Histórico do Selo — ${d.referenceTime}`, `Ativos: ${d.totalActive} | Suspensos: ${d.totalSuspended}`];
    if (d.recentEvents.length > 0) { parts.push('', 'Eventos recentes:'); for (const e of d.recentEvents) parts.push(`  • ${e.driverName} — ${e.eventType}${e.reason ? ` (${e.reason})` : ''} — ${e.createdAt.slice(0,10)}`); }
    return parts.join('\n');
  },
  city_opening_overview: (data) => {
    const d = data as CityOpeningOverviewData;
    if (!d.available) return 'Visão de abertura de cidade: não foi possível consultar.';

    const parts: string[] = [];
    parts.push(`## Abertura de cidade — ${d.city}/${d.uf}`);
    parts.push('');

    // Regulatório
    if (d.regulatory.available) {
      const statusMap: Record<string, string> = {
        approved: '✅ Aprovado',
        controlled_operation: '✅ Operação controlada',
        not_evaluated: '⚠️ Não avaliado',
        blocked: '❌ Bloqueado',
        suspended: '❌ Suspenso',
        pending_review: '⏳ Aguardando revisão',
      };
      const regLabel = statusMap[d.regulatory.status ?? ''] || d.regulatory.status || 'Não disponível';
      parts.push(`**Regulatório:** ${regLabel}`);
      if (d.regulatory.notes) parts.push(`  Notas: ${d.regulatory.notes}`);
    } else {
      parts.push('**Regulatório:** Não disponível (território não encontrado)');
    }

    // Território
    if (d.territory.found) {
      const statusMap: Record<string, string> = {
        active: '✅ Ativo',
        preparation: '⏳ Preparação',
        planning: '📋 Planejamento',
        inactive: '⚠️ Inativo',
        blocked: '❌ Bloqueado',
      };
      parts.push(`**Território:** ${statusMap[d.territory.status ?? ''] || d.territory.status || 'Não disponível'} (${d.territory.name})`);
    } else {
      parts.push('**Território:** ❌ Não cadastrado no sistema');
    }

    // Gestor
    if (d.manager.available) {
      if (d.manager.hasManager) {
        parts.push(`**Gestor territorial:** ✅ ${d.manager.managerName} (${d.manager.activeManagers} ativo${d.manager.activeManagers > 1 ? 's' : ''})`);
      } else {
        parts.push('**Gestor territorial:** ❌ Nenhum gestor vinculado');
      }
    } else {
      parts.push('**Gestor territorial:** Não disponível');
    }

    // Landing
    if (d.landing.available) {
      if (d.landing.enabled) {
        parts.push(`**Landing:** ✅ Ativa — ${d.landing.url || 'URL não disponível'}`);
      } else {
        parts.push('**Landing:** ❌ Não habilitada');
      }
    } else {
      parts.push('**Landing:** Não disponível');
    }

    // Motoristas
    if (d.drivers.available) {
      const statusParts = Object.entries(d.drivers.byStatus).map(([s, c]) => `${s}: ${c}`).join(', ');
      const minLabel = `${d.drivers.operationalCount}/${MIN_DRIVERS_FOR_TERRITORY_ACTIVATION}`;
      const belowMin = d.drivers.operationalCount < MIN_DRIVERS_FOR_TERRITORY_ACTIVATION ? ' ⚠️' : ' ✅';
      parts.push(`**Motoristas aptos:** ${minLabel}${belowMin}${d.drivers.total > d.drivers.operationalCount ? ` (total cadastrados: ${d.drivers.total})` : ''}`);
      if (statusParts) parts.push(`  Distribuição: ${statusParts}`);
    } else {
      parts.push('**Motoristas:** Não disponível');
    }

    // Leads
    if (d.leads.available) {
      parts.push(`**Leads/recrutamento:** ${d.leads.total} lead${d.leads.total !== 1 ? 's' : ''}`);
    } else {
      parts.push('**Leads/recrutamento:** Não disponível');
    }

    // Pronto para ativar
    parts.push('');
    if (d.activation.available) {
      if (d.activation.operationalReady === null) {
        parts.push('**Pronto para ativar:** ⚠️ AINDA NÃO É POSSÍVEL CONFIRMAR (dados de motoristas indisponíveis)');
      } else {
        const status = d.activation.operationalReady ? '✅ SIM' : '❌ NÃO';
        parts.push(`**Pronto para ativar:** ${status}`);
      }
    } else {
      parts.push('**Pronto para ativar:** Ainda não é possível confirmar');
    }

    // Pendências
    if (d.pendencies.length > 0) {
      parts.push('');
      parts.push('**Pendências:**');
      for (const p of d.pendencies) parts.push(`- ${p}`);
    }

    // Próxima ação
    parts.push('');
    parts.push(`**Próxima ação recomendada:** ${d.nextAction}`);

    return parts.join('\n');
  },
};

// ── Formatters Command Center ───────────────────────────────────────────────

function formatDriverCityLandings(data: DriverCityLandingsData): string {
  if (!data.available) {
    return 'Landing pages de motoristas: não foi possível consultar.';
  }

  if (data.items.length === 0) {
    return 'Nenhuma landing page de motoristas correspondente foi encontrada.';
  }

  if (data.items.length === 1) {
    const item = data.items[0];
    return [
      `📍 Landing de Motoristas — ${item.city}/${item.state}`,
      `Status público: ${item.publicStatus}`,
      `Landing: ${item.landingEnabled ? 'ativa' : 'desativada'}`,
      `URL: ${item.url}`,
    ].join('\n');
  }

  const parts: string[] = [];
  parts.push(`📍 Landing Pages de Motoristas — ${data.active} ativas de ${data.total} cadastradas`);

  for (const item of data.items) {
    parts.push(
      `• ${item.city}/${item.state} — ${item.publicStatus} — ${item.landingEnabled ? 'ativa' : 'desativada'} — ${item.url}`
    );
  }

  return parts.join('\n');
}

function formatPlatformCatalog(data: PlatformCatalogData): string {
  const parts: string[] = [];
  parts.push(`📚 Catálogo da Plataforma — Seção: ${data.section}`);
  parts.push(data.note);
  parts.push('');
  for (const m of data.modules) {
    const path = m.adminPath ? ` (${m.adminPath})` : '';
    parts.push(`• ${m.name}${path}: ${m.description}`);
  }
  if (data.modules.length === 0) parts.push('Nenhum módulo nesta seção.');
  return parts.join('\n');
}

function formatAnnualIncentiveSummary(data: AnnualIncentiveSummaryData): string {
  if (!data.available) return 'Gratificação Anual: não foi possível consultar.';
  const parts: string[] = [];
  parts.push(`🎁 Gratificação Anual — ${data.referenceTime}`);
  parts.push(`Total adquirido (ledger): ${formatCentsBRL(data.totalAccruedCents)}`);
  parts.push(`A pagar atualmente (disponível + reservado): ${formatCentsBRL(data.totalOutstandingCents)}`);
  parts.push(`  Disponível (pode ser solicitado): ${formatCentsBRL(data.totalAvailableCents)}`);
  parts.push(`  Reservado (já solicitado/processando): ${formatCentsBRL(data.totalReservedCents)}`);
  parts.push(`Já pago (liquidado): ${formatCentsBRL(data.totalPaidCents)}`);
  parts.push(`Revertido: ${formatCentsBRL(data.totalReversedCents)}`);
  parts.push(`Motoristas com saldo: ${data.driversWithBalance}`);
  if (data.deadlineBreaches > 0) parts.push(`⚠️ Solicitações com prazo vencido: ${data.deadlineBreaches}`);
  if (data.forecast.available) {
    parts.push('');
    parts.push(`📊 Previsão até 31/12:`);
    parts.push(`  Geração adicional estimada: ${formatCentsBRL(data.forecast.projectedAdditionalCents!)}`);
    parts.push(`  Valor a pagar projetado no fim do ano: ${formatCentsBRL(data.forecast.projectedYearEndOutstandingCents!)}`);
    parts.push(`  ${data.forecast.basis}`);
    parts.push('  Estimativa baseada no ritmo registrado; não é valor já devido nem garantia de pagamento.');
  } else if (data.forecast.reason) {
    parts.push(`Previsão: ${data.forecast.reason}`);
  }
  return parts.join('\n');
}

function formatWhatsAppSummary(data: WhatsAppSummaryData): string {
  if (!data.available) return 'Central WhatsApp: não foi possível consultar.';
  const parts: string[] = [];
  parts.push(`💬 Central WhatsApp — ${data.referenceTime}`);
  parts.push(`Mensagens não lidas: ${data.unreadMessages} (em ${data.conversationsWithUnread} conversas)`);
  parts.push(`Conversas novas: ${data.newConversations} | Em andamento: ${data.inProgressConversations} | Urgentes: ${data.highPriorityConversations}`);
  if (data.recentConversations.length > 0) {
    parts.push('');
    parts.push('Conversas recentes com mensagens não lidas:');
    for (const c of data.recentConversations) {
      parts.push(`  • ${c.contactType} | ${c.status} | prioridade: ${c.priority} | não lidas: ${c.unreadCount}`);
    }
  }
  return parts.join('\n');
}

function formatDriverPipelineSummary(data: DriverPipelineSummaryData): string {
  if (!data.available) return 'Pipeline de motoristas: não foi possível consultar.';
  const parts: string[] = [];
  parts.push(`👤 Pipeline de Motoristas — ${data.referenceTime}`);
  parts.push(`Total: ${data.total} | Ativos: ${data.activeDrivers} | Pendentes: ${data.pendingApproval} | Suspensos: ${data.suspendedDrivers}`);
  const statusEntries = Object.entries(data.byStatus);
  if (statusEntries.length > 0) {
    parts.push('Por status: ' + statusEntries.map(([s, c]) => `${s}: ${c}`).join(', '));
  }
  const vehicleEntries = Object.entries(data.byVehicleType);
  if (vehicleEntries.length > 0) {
    parts.push('Por veículo: ' + vehicleEntries.map(([v, c]) => `${v}: ${c}`).join(', '));
  }
  parts.push(`Docs: ${data.docsSubmitted} aguardando revisão, ${data.docsMissing} ausentes, ${data.docsRejected} rejeitados`);
  if (data.compliancePending > 0) parts.push(`Compliance pendente: ${data.compliancePending}`);
  if (data.modalities.available) {
    parts.push(`Modalidades: ${data.modalities.pending} aguardando aprovação, ${data.modalities.approved} aprovadas, ${data.modalities.rejected} rejeitadas`);
  } else {
    parts.push('Modalidades: não foi possível consultar.');
  }
  return parts.join('\n');
}

function formatEmergencyOperationsSummary(data: EmergencyOperationsSummaryData): string {
  const parts: string[] = [];
  parts.push(`🚨 Emergências e Corridas — ${data.referenceTime}`);

  if (data.emergencies.available) {
    if (data.emergencies.active > 0) {
      parts.push(`⚠️ EMERGÊNCIAS ATIVAS: ${data.emergencies.active}`);
    } else {
      parts.push('Nenhuma emergência ativa no momento.');
    }
    if (data.emergencies.unresolved > 0) parts.push(`Não resolvidas: ${data.emergencies.unresolved}`);
  } else {
    parts.push('Emergências: não foi possível consultar.');
  }

  if (data.rides.available) {
    if (data.rides.noDriver > 0) parts.push(`Corridas sem motorista (hoje): ${data.rides.noDriver}`);
    if (data.rides.pendingAdjustment > 0) parts.push(`Corridas com ajuste pendente: ${data.rides.pendingAdjustment}`);
    if (data.rides.noDriver === 0 && data.rides.pendingAdjustment === 0) parts.push('Nenhuma corrida com pendência operacional.');
  } else {
    parts.push('Corridas operacionais: não foi possível consultar.');
  }

  return parts.join('\n');
}

function formatTerritoryManagerCoverage(
  data: TerritoryManagerCoverageData
): string {
  if (!data.available) {
    return 'Cobertura de gestores: não foi possível consultar.';
  }

  if (!data.found || !data.territory) {
    return `Território ${data.city}/${data.uf} não encontrado no sistema.`;
  }

  const parts: string[] = [];

  parts.push(`👥 Cobertura de Gestores — ${data.city}/${data.uf}`);
  parts.push(
    `Território: ${data.territory.name} (${data.territory.status})`
  );
  const coverageDescription =
    data.coverageStatus === 'COMPLETE'
      ? 'COMPLETE — cobertura homologada pela KAVIAR'
      : data.coverageStatus === 'AWAITING_REVIEW'
        ? 'AWAITING_REVIEW — dados carregados, aguardando homologação'
        : data.officialNeighborhoods > 0
          ? 'NOT_LOADED — há dados cadastrados, mas a completude ainda não foi revisada/homologada'
          : 'NOT_LOADED — cobertura ainda não carregada/homologada';

  parts.push(`Cobertura territorial: ${coverageDescription}`);
  parts.push(`Bairros oficiais ativos: ${data.officialNeighborhoods}`);
  parts.push(`Regiões territoriais ativas: ${data.activeRegions}`);
  parts.push(`Gestores ativos: ${data.managers.length}`);

  if (data.managers.length > 0) {
    for (const manager of data.managers) {
      const hasCityScope = manager.territories.some(
        territory => territory.level === 'city'
      );

      if (hasCityScope) {
        parts.push(`  • ${manager.name} — cidade inteira`);
        continue;
      }

      const regionNames = manager.territories
        .filter(territory => territory.level === 'region')
        .map(territory => territory.name);

      parts.push(
        `  • ${manager.name} — ${regionNames.length > 0 ? regionNames.join(', ') : manager.territoryName}`
      );
    }
  } else {
    parts.push('  • Nenhum gestor ativo vinculado.');
  }

  parts.push('');

  if (data.recommendedManagers === null) {
    parts.push(
      'Recomendação de gestores: não calculada — não há bairros oficiais ativos suficientes.'
    );
  } else {
    parts.push(
      `Demanda sugerida${data.provisional ? ' (provisória)' : ''}: ${data.recommendedManagers} gestor${data.recommendedManagers === 1 ? '' : 'es'}`
    );

    if (data.hasRoomForMoreManagers) {
      parts.push(
        `Capacidade sugerida adicional: +${data.additionalManagers}`
      );
    } else {
      parts.push('Capacidade sugerida adicional: 0');
    }
  }

  parts.push('');
  parts.push(`Estrutura atual: ${data.activeRegions} regiões territoriais ativas`);
  parts.push(
    `Regiões sem gestor regional específico: ${data.uncoveredRegions.length}`
  );

  const visibleRegions = data.uncoveredRegions.slice(0, 20);
  for (const region of visibleRegions) {
    parts.push(`  • ${region.name}`);
  }

  if (data.uncoveredRegions.length > visibleRegions.length) {
    parts.push(
      `  • ... e mais ${data.uncoveredRegions.length - visibleRegions.length}`
    );
  }

  parts.push('');
  parts.push(
    `Critério: 1 gestor para cada ${data.neighborhoodsPerManager} bairros oficiais cadastrados. A quantidade de regiões existentes não reduz a demanda sugerida.`
  );

  if (data.coverageStatus === 'COMPLETE') {
    parts.push(
      '✅ Cobertura territorial homologada pela KAVIAR; a recomendação usa a base marcada como completa.'
    );
    parts.push(
      'ℹ️ COMPLETE homologa somente a base territorial; não aprova quantidade de gestores nem contratação.'
    );
  } else if (data.coverageStatus === 'AWAITING_REVIEW') {
    parts.push(
      '⚠️ Recomendação provisória: os dados estão carregados, mas a cobertura territorial ainda aguarda homologação.'
    );
  } else {
    parts.push(
      data.officialNeighborhoods > 0
        ? '⚠️ Recomendação provisória: há dados territoriais cadastrados, mas a completude ainda não foi revisada/homologada.'
        : '⚠️ Recomendação provisória: a cobertura territorial ainda não foi carregada/homologada como completa.'
    );
  }

  return parts.join('\n');
}

function formatTerritoryPortfolioSummary(data: TerritoryPortfolioSummaryData): string {
  if (!data.available) return 'Portfólio de territórios: não foi possível consultar.';
  const parts: string[] = [];
  parts.push(`🗺️ Portfólio de Territórios — ${data.referenceTime}`);
  parts.push(`Total: ${data.total}`);
  const statusEntries = Object.entries(data.byStatus);
  if (statusEntries.length > 0) parts.push('Por status: ' + statusEntries.map(([s, c]) => `${s}: ${c}`).join(', '));
  const regEntries = Object.entries(data.byRegulatoryStatus);
  if (regEntries.length > 0) parts.push('Regulatório: ' + regEntries.map(([s, c]) => `${s}: ${c}`).join(', '));
  parts.push(`Sem gestor (territórios ativos): ${data.withoutManager} | Moto passageiro: ${data.withMotoPassenger} | Moto express: ${data.withMotoExpress}`);

  parts.push('');
  if (data.withoutManagerCities.length > 0) {
    parts.push('Territórios sem gestor:');
    for (const c of data.withoutManagerCities) {
      parts.push(
        `  • ${c.city}/${c.uf} — ${c.status} — ${c.isActive ? 'ativo' : 'inativo'}`
      );
    }
  } else {
    parts.push('Territórios sem gestor: nenhum.');
  }

  if (data.regulatoryChecklist.available && data.regulatoryChecklist.pending > 0) parts.push(`Checklist regulatório pendente: ${data.regulatoryChecklist.pending}`);
  if (data.regulatoryProtocols.available && data.regulatoryProtocols.pending > 0) parts.push(`Protocolos regulatórios pendentes: ${data.regulatoryProtocols.pending}`);
  if (data.insuranceCoverages.available && data.insuranceCoverages.pending > 0) parts.push(`Coberturas de seguro pendentes/expiradas: ${data.insuranceCoverages.pending}`);
  if (data.cityLandings.available) parts.push(`Landings de cidade: ${data.cityLandings.active} ativas de ${data.cityLandings.total} total`);

  if (data.attentionCities.length > 0) {
    parts.push('');
    parts.push('Cidades com atenção:');
    for (const c of data.attentionCities) parts.push(`  • ${c.city}/${c.uf}: ${c.reasons.join(', ')}`);
  }
  return parts.join('\n');
}

function formatKnowledgeAnswer(data: KnowledgeAnswerData): string {
  if (!data.available) return 'Base de conhecimento: não foi possível consultar.';
  if (data.noMatch) return data.answer;

  const parts: string[] = [];
  parts.push(data.answer);

  if (data.citations.length > 0) {
    parts.push('');
    parts.push('Fontes:');
    for (const c of data.citations) {
      parts.push(`• ${c.title} (${c.slug} v${c.version})`);
    }
  }

  return parts.join('\n');
}

function formatDriverRatingsSummary(data: DriverRatingsSummaryData): string {
  if (!data.available) return 'Avaliações de motoristas: não foi possível consultar.';

  const parts: string[] = [];
  parts.push(`⭐ Avaliações de Motoristas — ${data.referenceTime}`);
  parts.push(`Total de motoristas avaliados: ${data.totalDriversRated}`);
  if (data.globalAverageRating) parts.push(`Média global: ${data.globalAverageRating}`);

  if (data.driversNeedingAttention.length > 0) {
    parts.push('');
    parts.push(`⚠️ Motoristas com atenção (${data.attentionCriteria}):`);
    for (const d of data.driversNeedingAttention) {
      parts.push(`  • ${d.driverName} — ${d.lowRatingsCount} avaliações baixas, média ${d.averageRating} (${d.totalRatings} total)`);
    }
  } else {
    parts.push('Nenhum motorista com padrão de avaliações baixas recorrentes no período.');
  }

  if (data.individual?.available && data.individual.driverId) {
    parts.push('');
    parts.push(`Motorista: ${data.individual.driverName || data.individual.driverId}`);
    parts.push(`Média: ${data.individual.averageRating ?? 'sem avaliações'} | Total: ${data.individual.totalRatings}`);
    if (data.individual.totalRatings > 0) {
      const dist = data.individual.distribution;
      parts.push(`Distribuição: ⭐1=${dist['1']||0} ⭐2=${dist['2']||0} ⭐3=${dist['3']||0} ⭐4=${dist['4']||0} ⭐5=${dist['5']||0}`);
    }
    parts.push(`Avaliações baixas (últimos 30d): ${data.individual.lowRatingsLast30d}`);
    if (data.individual.needsAttention) parts.push('⚠️ Este motorista requer atenção.');
  }

  return parts.join('\n');
}

// ── Extração de city/uf da pergunta ─────────────────────────────────────────

export function parseCityUf(question: string): { city: string; uf: string } | null {
  let match = question.match(/(.+?)\s*\/\s*([A-Za-z]{2})(?:\s|$|[.,!?])/);
  if (!match) match = question.match(/(.+?)\s+[-–]\s+([A-Za-z]{2})(?:\s|$|[.,!?])/);
  if (!match) match = question.match(/(.+?)\s*\(\s*([A-Za-z]{2})\s*\)/);
  if (!match) return null;

  const uf = match[2].trim().toUpperCase();
  if (uf.length !== 2) return null;

  let city = match[1].trim();

  // Remove frases de comando, preservando o nome real da cidade.
  // Ex.: "Qual é o status de Nova Iguaçu/RJ" -> "Nova Iguaçu".
  const prefixes = [
    /^(?:investigue|investigar|verifique|verificar)\s+(?:por\s+que\s+)?/i,
    /^(?:homologar|homologue|homologa|marcar|marque)\s+(?:a\s+)?cobertura(?:\s+territorial)?\s+(?:de|da|do|em|na|no)\s+/i,
    /^(?:enviar|envie|mandar|mande)\s+(?:a\s+)?cobertura(?:\s+territorial)?\s+(?:de|da|do|em|na|no)\s+/i,
    /^(?:reabrir|reabra)\s+(?:a\s+)?cobertura(?:\s+territorial)?\s+(?:de|da|do|em|na|no)\s+/i,
    /^(?:tem|há|ha|existe)\s+espaço\s+para\s+mais\s+gestores?\s+(?:em|na|no|de|da|do)\s+/i,
    /^(?:quantos?)\s+gestores?\s+(?:temos?|existem?|faltam?|há|ha)\s+(?:em|na|no|de|da|do)\s+/i,
    /^(?:quem\s+são|quem\s+sao)\s+(?:os\s+)?gestores?\s+(?:em|na|no|de|da|do)\s+/i,
    /^(?:quais\s+)?regiões?\s+(?:em|na|no|de|da|do)\s+/i,
    /^(?:como\s+está|como\s+esta)\s+(?:a\s+)?cobertura\s+(?:de\s+)?gestores?\s+(?:em|na|no|de|da|do)\s+/i,
    /^(?:como\s+está|como\s+esta)\s+(?:a\s+)?gestão\s+(?:em|na|no|de|da|do)\s+/i,
    /^(?:tem|há|ha|existe)\s+(?:(?:um|uma)\s+)?gestor(?:a)?\s+(?:(?:na|no)\s+cidade\s+de\s+|(?:em|na|no|de|da|do)\s+)/i,

    /^(?:(?:qual|quais)(?:\s+é|\s+e)?\s+(?:(?:o|a)\s+)?)?(?:status|situação|situacao)\s+(?:de|da|do|em)\s+/i,

    /^(?:quero\s+)?(?:abrir|cadastrar|criar)\s+(?:(?:(?:uma|um|a|o)\s+)?(?:(?:nova|novo)\s+)?(?:cidade|território|territorio)\s+)?(?:(?:de|da|do|em|para)\s+)?/i,

    /^(?:liberar|libere|habilitar|habilite|ativar|ative)\s+(?:(?:a|o)\s+)?(?:(?:landing(?:\s+page)?|página|pagina)\s+)?(?:(?:de|da|do|em|para)\s+)?/i,

    /^(?:como\s+está|como\s+esta|verificar|verifique|veja)\s+(?:(?:o|a)\s+)?(?:(?:status|situação|situacao)\s+)?(?:(?:de|da|do|em|para)\s+)?/i,
  ];

  for (const prefix of prefixes) {
    const cleaned = city.replace(prefix, '').trim();
    if (cleaned !== city) {
      city = cleaned;
      break;
    }
  }

  if (city.length < 2) return null;

  return { city, uf };
}

// ── Resolução de cidade sem UF explícita ────────────────────────────────────

/**
 * Attempts to resolve a city name from the question by matching against
 * known operational_territories in the database.
 *
 * Returns:
 * - { city, uf } if exactly one territory matches
 * - 'ambiguous' if multiple UFs match the same city name
 * - null if no match found
 *
 * Read-only. Does not create or alter data.
 */
async function resolveCityFromQuestion(
  question: string
): Promise<{ city: string; uf: string } | 'ambiguous' | null> {
  // Extract potential city names: words starting with uppercase (2+ chars)
  // that are not common Portuguese words
  const words = question.match(/[A-ZÀ-Ú][a-záàâãéèêíïóôõúç]+(?:\s+(?:d[aeo]s?|e)\s+[A-ZÀ-Ú][a-záàâãéèêíïóôõúç]+)*/g);
  if (!words || words.length === 0) return null;

  // Try each candidate (longest first for compound names like "Santa Cruz das Palmeiras")
  const candidates = [...new Set(words)].sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    if (candidate.length < 3) continue;
    // Skip common Portuguese words that start with uppercase (beginning of sentence)
    const skipWords = new Set(['Como', 'Qual', 'Quais', 'Para', 'Onde', 'Quando', 'Porque', 'Podemos', 'Precisamos', 'Ainda', 'Sobre', 'Toda', 'Toda', 'Fazer', 'Tornar', 'Mais']);
    if (skipWords.has(candidate)) continue;

    try {
      const result = await pool.query<{ city_name: string; uf: string }>(`
        SELECT DISTINCT city_name, uf
        FROM operational_territories
        WHERE level = 'city'
          AND LOWER(city_name) = LOWER($1)
      `, [candidate]);

      if (result.rows.length === 1) {
        return { city: result.rows[0].city_name, uf: result.rows[0].uf };
      }
      if (result.rows.length > 1) {
        return 'ambiguous';
      }
    } catch {
      // DB error — continue trying other candidates
    }
  }

  return null;
}

// ── Extração de período da pergunta ─────────────────────────────────────────

function parsePeriod(question: string): 'today' | 'week' | 'month' {
  const q = question.toLowerCase();
  if (q.includes('mês') || q.includes('mes') || q.includes('mensal')) return 'month';
  if (q.includes('semana') || q.includes('semanal')) return 'week';
  return 'today';
}

// ── Extração de seção da company_profile ────────────────────────────────────

// ── Extração de nome de pessoa da pergunta ──────────────────────────────────

function extractPersonName(question: string): string {
  // Remove common prefixes: "quem é", "mostre o motorista", "buscar", "encontre"
  let name = question
    .replace(/^(quem [eé]|mostre o motorista|buscar motorista|encontre|procure|motorista|admin|gestor)\s*/i, '')
    .replace(/[?!.]+$/, '')
    .trim();
  // If still has "motorista X" or "o X", extract the name part
  name = name.replace(/^(o|a|motorista|passageiro|gestor|admin)\s+/i, '').trim();
  return name.slice(0, 100);
}

function parseCatalogSection(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('corrida') || q.includes('cockpit') || q.includes('emergência') || q.includes('emergencia') || q.includes('compensaç') || q.includes('avaliação') || q.includes('avaliacao') || q.includes('particular') || q.includes('rota fixa')) return 'mobility_operations';
  if (q.includes('motorista') || q.includes('passageiro') || q.includes('guia') || q.includes('comunidade') || q.includes('bairro')) return 'people_communities';
  if (q.includes('território') || q.includes('territorio') || q.includes('regulat') || q.includes('geofence') || q.includes('seguro') || q.includes('landing') || q.includes('lab')) return 'territory_regulatory';
  if (q.includes('financ') || q.includes('contador') || q.includes('contábil') || q.includes('contabil') || q.includes('obrigaç') || q.includes('repasse') || q.includes('crédito') || q.includes('credito') || q.includes('gratificaç') || q.includes('gratificacao')) return 'finance_accounting';
  if (q.includes('whatsapp') || q.includes('inbox') || q.includes('crm') || q.includes('lead') || q.includes('indicaç') || q.includes('indicacao') || q.includes('comercial')) return 'communications_commercial';
  if (q.includes('pet') || q.includes('tourism') || q.includes('turismo') || q.includes('vitrine') || q.includes('comércio') || q.includes('comercio') || q.includes('grupo') || q.includes('mulher') || q.includes('idoso') || q.includes('care')) return 'products_verticals';
  if (q.includes('equipe') || q.includes('auditoria') || q.includes('conformidade') || q.includes('preço') || q.includes('preco') || q.includes('feature') || q.includes('investidor') || q.includes('contrato')) return 'governance';
  return 'overview';
}

function parseCompanySection(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('cnpj') || q.includes('razão social') || q.includes('razao social') || q.includes('capital social') || q.includes('natureza jurídica') || q.includes('natureza juridica') || q.includes('data de abertura') || q.includes('quando') && q.includes('aberta')) return 'identity';
  if (q.includes('telefone') || q.includes('whatsapp') || q.includes('e-mail') || q.includes('email') || q.includes('site') || q.includes('endereço') || q.includes('endereco') || q.includes('onde fica')) return 'contacts';
  if (q.includes('sócio') || q.includes('socio') || q.includes('ceo') || q.includes('administrador') || q.includes('quem administra') || q.includes('quem são')) return 'governance';
  if (q.includes('filial') || q.includes('filiais') || q.includes('matriz')) return 'structure';
  if (q.includes('cnae') || q.includes('atividade econômica') || q.includes('atividade economica')) return 'activities';
  if (q.includes('o que é') || q.includes('o que e') || q.includes('o que faz') || q.includes('como funciona') || q.includes('módulo') || q.includes('modulo') || q.includes('serviço') || q.includes('servico') || q.includes('para quem') || q.includes('território') && q.includes('comunidade')) return 'about';
  return 'full';
}

// ── Roles permitidas no Chat KAVIAR ─────────────────────────────────────────

// ── Detecção determinística de aceitação de oferta ─────────────────────────

const OFFER_PATTERNS = [
  'posso transformar',
  'posso montar',
  'posso criar',
  'posso resumir',
  'posso gerar',
  'posso preparar',
  'posso fazer',
  'posso elaborar',
  'quer que eu faça',
  'quer que eu monte',
  'quer que eu crie',
  'quer que eu prepare',
  'quer que eu gere',
  'quer que eu resuma',
  'quer que eu transforme',
];

const AFFIRMATIVE_SHORT = new Set([
  'quero', 'sim', 'pode', 'faça', 'faca', 'ok', 'por favor',
  'pode sim', 'quero sim', 'sim por favor', 'claro', 'bora', 'manda',
]);

/**
 * Detects when the user gives a short affirmative to the assistant's last explicit text offer.
 * Returns an explicit instruction string if detected, or null otherwise.
 * This makes the intent deterministic rather than relying on model interpretation.
 *
 * Does NOT apply to: "continue", "continua" (those mean continuation).
 */
export function resolveOfferAcceptance(
  question: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
): string | null {
  if (!history || history.length === 0) return null;

  const q = question.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // "continue/continua" is NOT offer acceptance
  if (q === 'continue' || q === 'continua' || q === 'prossiga') return null;

  // Check if question is a short affirmative
  if (!AFFIRMATIVE_SHORT.has(q)) return null;

  // Find the last assistant message
  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return null;

  const lower = lastAssistant.content.toLowerCase();

  // Check if the assistant's message contains an explicit offer
  const hasOffer = OFFER_PATTERNS.some(p => lower.includes(p));
  if (!hasOffer) return null;

  // Extract the sentence containing the offer for explicit inclusion
  const sentences = lastAssistant.content.split(/(?<=[.!?])\s+/);
  const offerSentence = sentences.find(s =>
    OFFER_PATTERNS.some(p => s.toLowerCase().includes(p))
  ) || lastAssistant.content;

  // Return explicit instruction with the literal offer text
  return `O usuário aceitou esta oferta textual do assistente: "${offerSentence.trim()}" Execute exatamente essa oferta agora usando o conteúdo anterior da conversa como matéria-prima. Não resuma novamente, não repita a oferta e não apresente novas opções.`;
}

// ── Detecção de intenção estratégica sobre cidade ─────────────────────────

/**
 * Detects strategic/recommendation questions about a specific city.
 * These should NOT be routed to city_opening_overview as a final formatted response,
 * but should use its data as context for a generative strategic answer.
 *
 * Examples:
 * - "Como tornar Tambaú mais atraente para motoristas?"
 * - "O que podemos fazer para atrair mais motoristas em Tambaú?"
 * - "Como melhorar o recrutamento de motoristas em Tambaú?"
 * - "Que estratégia usar para aumentar a oferta em Tambaú?"
 */
export function detectStrategicCityIntent(question: string): boolean {
  const q = question.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Must have strategic/recommendation verb/phrase
  const hasStrategicIntent =
    (q.includes('tornar') && q.includes('atraente')) ||
    (q.includes('atrair') && (q.includes('motorista') || q.includes('parceiro'))) ||
    (q.includes('melhorar') && (q.includes('recrutamento') || q.includes('captacao') || q.includes('captação'))) ||
    (q.includes('estrategia') && (q.includes('motorista') || q.includes('cidade') || q.includes('operacao'))) ||
    (q.includes('aumentar') && (q.includes('oferta') || q.includes('motorista'))) ||
    (q.includes('precisamos') && q.includes('tornar'));

  return hasStrategicIntent;
}

// ── Roles permitidas no Chat KAVIAR ─────────────────────────────────────

const ALLOWED_CHAT_ROLES = new Set(['SUPER_ADMIN', 'FINANCE']);

// ── Função principal ───────────────────────────────────────────────────────

export async function askKaviarAi(
  request: KaviarAiRequest,
  provider?: KaviarAiModelProvider
): Promise<KaviarAiResponse> {
  const question = request.question.trim();
  const role = request.role;
  const history = request.history;

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

  const devIntent = detectDevelopmentIntent(question);
  if (devIntent.isDevIntent) {
    if (role !== 'SUPER_ADMIN') {
      return {
        answer: 'Acesso negado: a sua role não tem permissão para acionar o Development Agent.',
        toolsUsed: [],
      };
    }

    return {
      answer: 'Proposta de job de desenvolvimento (' + devIntent.category + ') criada com sucesso. Aguardando confirmação humana.',
      toolsUsed: [],
      developmentProposal: devIntent.proposal,
    };
  }

  // ── Offer acceptance short-circuit (read-only) ─────────────────────────
  // Must be AFTER devIntent (cannot bypass development confirmation)
  // and BEFORE routeQuestion (so "quero" is not misrouted by keyword rules).
  const acceptedOffer = resolveOfferAcceptance(question, history);
  if (
    acceptedOffer &&
    getRouterMode() !== 'rules' &&
    provider && 'answerGeneral' in provider
  ) {
    try {
      const answer = await (provider as unknown as KaviarAiDraftingComposer).answerGeneral(acceptedOffer, history);
      return { answer, toolsUsed: [] };
    } catch {
      return {
        answer: 'Não foi possível processar a pergunta no momento. Tente novamente.',
        toolsUsed: [],
      };
    }
  }

  // ── Strategic city intent (recomendação sobre cidade) ──────────────────
  // Detects strategic/recommendation questions about a specific city.
  // Uses city_opening_overview data as CONTEXT for a generative answer,
  // NOT as the final response. Prevents model from selecting multiple tools.
  const strategicCityIntent = detectStrategicCityIntent(question);
  if (
    strategicCityIntent &&
    getRouterMode() !== 'rules' &&
    provider && 'answerGeneral' in provider
  ) {
    const cityResolved = await resolveCityFromQuestion(question);
    if (cityResolved === 'ambiguous') {
      return {
        answer: 'Encontrei mais de uma cidade com esse nome em UFs diferentes. Informe a UF, por exemplo: Tambaú/SP.',
        toolsUsed: [],
      };
    }
    if (cityResolved) {
      // RBAC: same authorization as the city_opening_overview tool
      if (!canRoleExecuteTool(role, 'city_opening_overview')) {
        return {
          answer: 'Você não tem permissão para acessar essas informações.',
          toolsUsed: [],
        };
      }

      try {
        // Get consolidated city data as context (not for direct display)
        const overviewResult = await getCityOpeningOverview({ city: cityResolved.city, uf: cityResolved.uf });
        const overviewData = overviewResult.data;

        // Build concise context from overview data
        const contextParts: string[] = [];
        contextParts.push(`Cidade: ${cityResolved.city}/${cityResolved.uf}`);
        if (overviewData.regulatory.available) contextParts.push(`Regulatório: ${overviewData.regulatory.status}`);
        if (overviewData.territory.found) contextParts.push(`Território: ${overviewData.territory.status}`);
        if (overviewData.manager.available) contextParts.push(`Gestor: ${overviewData.manager.hasManager ? overviewData.manager.managerName : 'nenhum'}`);
        if (overviewData.landing.available) contextParts.push(`Landing: ${overviewData.landing.enabled ? 'ativa' : 'não habilitada'}`);
        if (overviewData.drivers.available) contextParts.push(`Motoristas aptos: ${overviewData.drivers.operationalCount}/${MIN_DRIVERS_FOR_TERRITORY_ACTIVATION} (total: ${overviewData.drivers.total})`);
        if (overviewData.leads.available) contextParts.push(`Leads: ${overviewData.leads.total}`);
        if (overviewData.activation.available) contextParts.push(`Pronta para ativação: ${overviewData.activation.operationalReady === true ? 'sim' : 'não'}`);
        if (overviewData.pendencies.length > 0) contextParts.push(`Pendências: ${overviewData.pendencies.join('; ')}`);

        const cityContext = contextParts.join('\n');
        const enrichedQuestion = `[Dados operacionais reais de ${cityResolved.city}/${cityResolved.uf}]\n${cityContext}\n\n[Pergunta do usuário]\n${question}\n\nResponda com recomendações estratégicas práticas baseadas nos dados acima. Não repita os dados em formato de relatório.`;

        const answer = await (provider as unknown as KaviarAiDraftingComposer).answerGeneral(enrichedQuestion, history);
        return { answer, toolsUsed: [] };
      } catch {
        return {
          answer: 'Não foi possível processar a pergunta no momento. Tente novamente.',
          toolsUsed: [],
        };
      }
    }
  }

  // ── Drafting intent (redação) — após dev-intent, antes do routing ────
  const draftingIntent = detectDraftingIntent(question);
  if (draftingIntent.isDrafting) {
    // Check if provider supports compose (KaviarAiDraftingComposer)
    const composer = provider && 'compose' in provider
      ? (provider as unknown as KaviarAiDraftingComposer)
      : undefined;

    if (!composer) {
      return {
        answer: 'Redação requer modelo de linguagem configurado. Entre em contato com o administrador do sistema.',
        toolsUsed: [],
      };
    }

    // Gather factual context from relevant tools
    let factualContext = '';
    const toolsUsed: KaviarAiToolName[] = [];

    for (const toolName of draftingIntent.toolsForContext) {
      if (!canRoleExecuteTool(role, toolName)) continue;

      let args: Record<string, string> | undefined;
      if (toolName === 'company_profile') {
        args = { section: 'full' };
      }

      try {
        const result = await executeTool(toolName, args);
        const formatter = FORMATTERS[result.tool as KaviarAiToolName];
        if (formatter) {
          factualContext += formatter(result.data) + '\n\n';
        }
        toolsUsed.push(result.tool as KaviarAiToolName);
      } catch {
        // Tool failure is non-fatal for drafting; compose with whatever is available
      }
    }

    try {
      const composedText = await composer.compose({
        question,
        documentType: draftingIntent.documentType,
        factualContext: factualContext.trim(),
        currentDate: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        history,
      });

      return {
        answer: composedText,
        toolsUsed,
      };
    } catch {
      return {
        answer: 'Não foi possível gerar o rascunho. Tente novamente.',
        toolsUsed,
      };
    }
  }

  // ── Investigator Territorial v1 ───────────────────────────────────────
  if (isTerritoryManagerInvestigation(question)) {
    if (role !== 'SUPER_ADMIN') {
      return {
        answer: 'Você não tem permissão para executar esta investigação territorial.',
        toolsUsed: [],
      };
    }

    let territorialArgs = parseCityUf(question);

    if (!territorialArgs) {
      const resolved = await resolveCityFromQuestion(question);

      if (resolved === 'ambiguous') {
        return {
          answer: 'Encontrei mais de uma cidade com esse nome em UFs diferentes. Informe a UF.',
          toolsUsed: [],
        };
      }

      if (resolved) {
        territorialArgs = resolved;
      }
    }

    if (!territorialArgs) {
      return {
        answer: 'Informe a cidade e a UF, por exemplo: Salvador/BA.',
        toolsUsed: [],
      };
    }

    try {
      const investigation = await investigateTerritoryManager(
        territorialArgs.city,
        territorialArgs.uf
      );

      return {
        answer: formatTerritoryManagerInvestigation(investigation),
        toolsUsed: ['territory_manager_coverage'],
      };
    } catch {
      return {
        answer: 'Não foi possível concluir a investigação territorial no momento. Tente novamente.',
        toolsUsed: [],
      };
    }
  }

  const route = await routeQuestion(question, provider);

  // ── Investigator v1 — documentos de motoristas ─────────────────────────
  if (isDriverDocumentsInvestigation(question)) {
    route.toolsToCall = [
      'drivers_documents_pending',
      'driver_pipeline_summary',
    ];
  }

  // ── Inconsistency Detector v1 ───────────────────────────────────────────
  // Explicit inconsistency requests override generic routes such as person_lookup.
  if (isInconsistencyQuestion(question)) {
    route.toolsToCall = ['daily_briefing'];
  }

  // ── Supervisor routing: action/priority questions use daily briefing ─────
  if (
    route.toolsToCall.length === 0 &&
    classifySupervisorIntent(question) === 'SUPERVISOR_ACTIONS'
  ) {
    route.toolsToCall = ['daily_briefing'];
  }

  // ── Driver intent routing: fill gap when rules don't match DRIVERS questions ─
  if (route.toolsToCall.length === 0 && classifyIntent(question) === 'DRIVERS') {
    const driverSub = classifyDriverIntent(question);
    const driverPreferred: KaviarAiToolName[] =
      driverSub === 'DRIVER_DOCUMENTS' ? ['drivers_documents_pending'] :
      driverSub === 'DRIVER_RATINGS' ? ['driver_ratings_summary'] :
      ['driver_pipeline_summary'];
    route.toolsToCall = driverPreferred;
  }

  // ── CRM intent routing: fill gap when rules don't match CRM questions ──
  if (route.toolsToCall.length === 0 && classifyIntent(question) === 'CRM') {
    route.toolsToCall = ['crm_leads_summary'];
  }

  // ── Communication routing: fill gaps left by deterministic rules ────────
  if (route.toolsToCall.length === 0 && classifyIntent(question) === 'COMMUNICATION') {
    const communicationSub = classifyCommunicationIntent(question);
    route.toolsToCall = communicationSub.startsWith('COMM_WHATSAPP_')
      ? ['whatsapp_summary']
      : ['inbox_summary'];
  }

  // ── Finance intent routing: fill gap when rules don't match FINANCE questions ─
  if (route.toolsToCall.length === 0 && classifyIntent(question) === 'FINANCE') {
    const financeSub = classifyFinanceIntent(question);
    const financePreferred: KaviarAiToolName[] =
      financeSub === 'FINANCE_OVERDUE' || financeSub === 'FINANCE_DUE_SOON'
        ? ['finance_due_obligations'] :
      financeSub === 'FINANCE_REVENUE'
        ? ['rides_summary_today'] :
      financeSub === 'FINANCE_INCENTIVE'
        ? ['annual_incentive_summary'] :
      ['finance_accounting_brief'];
    route.toolsToCall = financePreferred;
  }

  if (route.toolsToCall.length === 0) {
    // Generative fallback: only when mode is NOT 'rules' and provider supports it
    if (getRouterMode() !== 'rules' && provider && 'answerGeneral' in provider) {
      // Enrich with city context if a known city is mentioned without explicit /UF
      let enrichedQuestion = question;
      if (!question.match(/\/\s*[A-Za-z]{2}\b/)) {
        const cityResolved = await resolveCityFromQuestion(question);
        if (cityResolved === 'ambiguous') {
          return {
            answer: 'Encontrei mais de uma cidade com esse nome em UFs diferentes. Informe a UF, por exemplo: Tambaú/SP.',
            toolsUsed: [],
          };
        }
        if (cityResolved) {
          enrichedQuestion = `[Cidade identificada no sistema: ${cityResolved.city}/${cityResolved.uf}]\n\n${question}`;
        }
      }

      try {
        const answer = await (provider as unknown as KaviarAiDraftingComposer).answerGeneral(enrichedQuestion, history);
        return { answer, toolsUsed: [] };
      } catch {
        return {
          answer: 'Não foi possível processar a pergunta no momento. Tente novamente.',
          toolsUsed: [],
        };
      }
    }

    return {
      answer: `Ainda não sei responder: "${question}".`,
      toolsUsed: [],
    };
  }

  // Filter tools by RBAC
  // ── Orchestrator: filter/prioritize tools in model mode ────────────────
  const toolsAfterOrchestrator = getRouterMode() === 'model'
    ? orchestrate(question, route.toolsToCall).tools
    : route.toolsToCall;

  // If orchestrator filtered all tools (intent-specific, no relevant tools),
  // fall back to generative response instead of returning misleading RBAC error.
  if (toolsAfterOrchestrator.length === 0 && route.toolsToCall.length > 0) {
    if (provider && 'answerGeneral' in provider) {
      try {
        const answer = await (provider as unknown as KaviarAiDraftingComposer).answerGeneral(question, history);
        return { answer, toolsUsed: [] };
      } catch {
        return {
          answer: 'Não foi possível processar a pergunta no momento. Tente novamente.',
          toolsUsed: [],
        };
      }
    }
    return {
      answer: `Ainda não sei responder: "${question}".`,
      toolsUsed: [],
    };
  }

  let authorizedTools = toolsAfterOrchestrator.filter(t => canRoleExecuteTool(role, t));
  if (authorizedTools.length === 0) {
    return {
      answer: 'Você não tem permissão para acessar essas informações.',
      toolsUsed: [],
    };
  }

  // ── Investigator v1 — documentos de motoristas ─────────────────────────
  if (isDriverDocumentsInvestigation(question)) {
    const requiredTools: KaviarAiToolName[] = [
      'drivers_documents_pending',
      'driver_pipeline_summary',
    ];

    const allowed = requiredTools.filter(t =>
      authorizedTools.includes(t)
    );

    if (allowed.length !== requiredTools.length) {
      return {
        answer: 'Você não tem permissão para executar esta investigação completa.',
        toolsUsed: [],
      };
    }

    try {
      const documentsResult = await executeTool(
        'drivers_documents_pending'
      );

      const pipelineResult = await executeTool(
        'driver_pipeline_summary'
      );

      const answer = formatDriverDocumentsInvestigation(
        documentsResult.data as DriversDocumentsPendingData,
        pipelineResult.data as DriverPipelineSummaryData
      );

      return {
        answer,
        toolsUsed: [
          'drivers_documents_pending',
          'driver_pipeline_summary',
        ],
      };
    } catch {
      return {
        answer: 'Não foi possível concluir a investigação dos documentos de motoristas no momento. Tente novamente.',
        toolsUsed: [],
      };
    }
  }

  // ── Inconsistency Detector v1 ───────────────────────────────────────────
  if (
    isInconsistencyQuestion(question) &&
    authorizedTools.includes('daily_briefing')
  ) {
    try {
      const result = await executeTool('daily_briefing');
      const findings = detectOperationalFindings(
        result.data as DailyBriefingData
      );

      return {
        answer: formatOperationalFindings(findings),
        toolsUsed: ['daily_briefing'],
      };
    } catch {
      return {
        answer: 'Não foi possível analisar inconsistências operacionais no momento. Tente novamente.',
        toolsUsed: [],
      };
    }
  }

  // ── Supervisor v1 ──────────────────────────────────────────────────────
  if (
    classifySupervisorIntent(question) === 'SUPERVISOR_ACTIONS' &&
    authorizedTools.includes('daily_briefing')
  ) {
    try {
      const result = await executeTool('daily_briefing');
      const answer = formatSupervisorActions(
        result.data as DailyBriefingData
      );

      return {
        answer,
        toolsUsed: ['daily_briefing'],
      };
    } catch {
      return {
        answer: 'Não foi possível montar as prioridades operacionais no momento. Tente novamente.',
        toolsUsed: [],
      };
    }
  }

  // ── Driver semantic refinement ─────────────────────────────────────────
  // For DRIVERS intent, refine sub-intent and handle consolidated pending.
  const overallIntent = classifyIntent(question);
  if (overallIntent === 'DRIVERS') {
    const driverSubIntent = classifyDriverIntent(question);
    const refinedTools = refineDriverTools(driverSubIntent, authorizedTools);

    if (driverSubIntent === 'DRIVER_PENDING_GENERAL') {
      // Consolidated pending: canonical source is driver_pipeline_summary.
      // It contains status, docs, compliance and modalities in a single call.
      // Do NOT substitute another tool silently.
      if (!canRoleExecuteTool(role, 'driver_pipeline_summary')) {
        return {
          answer: 'Você não tem permissão para acessar essas informações.',
          toolsUsed: [],
        };
      }

      try {
        const result = await executeTool('driver_pipeline_summary');
        const answer = formatConsolidatedPending(result.data as DriverPipelineSummaryData);
        return { answer, toolsUsed: ['driver_pipeline_summary'] };
      } catch {
        return {
          answer: 'Não foi possível consultar as pendências de motoristas no momento. Tente novamente.',
          toolsUsed: [],
        };
      }
    }

    // For other specific sub-intents, narrow the tool list
    if (refinedTools.length > 0 && refinedTools.length < authorizedTools.length) {
      authorizedTools = refinedTools;
    }
  }

  // ── Finance semantic refinement ────────────────────────────────────────
  if (overallIntent === 'FINANCE') {
    const financeSubIntent = classifyFinanceIntent(question);

    if (financeSubIntent === 'FINANCE_PENDING_GENERAL') {
      // Canonical source: finance_accounting_brief (contains overdue + due_soon + result)
      if (!canRoleExecuteTool(role, 'finance_accounting_brief')) {
        return {
          answer: 'Você não tem permissão para acessar essas informações.',
          toolsUsed: [],
        };
      }

      try {
        const result = await executeTool('finance_accounting_brief', { period: 'month' });
        const answer = formatFinancePendingSummary(result.data as FinanceAccountingBriefData);
        return { answer, toolsUsed: ['finance_accounting_brief'] };
      } catch {
        return {
          answer: 'Não foi possível consultar as pendências financeiras no momento. Tente novamente.',
          toolsUsed: [],
        };
      }
    }

    // Specific overdue/due-soon questions use the canonical obligations source
    // and a sub-intent-specific formatter so unrelated obligation horizons are not mixed.
    if (financeSubIntent === 'FINANCE_OVERDUE' || financeSubIntent === 'FINANCE_DUE_SOON') {
      const correctTool: KaviarAiToolName = 'finance_due_obligations';

      if (!canRoleExecuteTool(role, correctTool)) {
        return {
          answer: 'Você não tem permissão para acessar essas informações.',
          toolsUsed: [],
        };
      }

      try {
        const result = await executeTool(correctTool);
        const data = result.data as FinanceDueObligationsData;
        const answer = financeSubIntent === 'FINANCE_OVERDUE'
          ? formatFinanceOverdue(data)
          : formatFinanceDueSoon(data);

        return { answer, toolsUsed: [correctTool] };
      } catch {
        return {
          answer: 'Não foi possível consultar as obrigações financeiras no momento. Tente novamente.',
          toolsUsed: [],
        };
      }
    } else if (financeSubIntent === 'FINANCE_REVENUE') {
      const revTools = authorizedTools.filter(t =>
        t === 'rides_summary_today' || t === 'rides_operations'
      );
      if (revTools.length > 0) {
        authorizedTools = revTools.slice(0, 1);
      }
    } else if (financeSubIntent === 'FINANCE_INCENTIVE') {
      if (authorizedTools.includes('annual_incentive_summary')) {
        authorizedTools = ['annual_incentive_summary'];
      }
    } else if (financeSubIntent === 'FINANCE_ACCOUNTING') {
      if (authorizedTools.includes('finance_accounting_brief')) {
        authorizedTools = ['finance_accounting_brief'];
      }
    }
  }

  // ── CRM semantic refinement ────────────────────────────────────────────
  if (overallIntent === 'CRM') {
    const crmTool: KaviarAiToolName = 'crm_leads_summary';

    if (!canRoleExecuteTool(role, crmTool)) {
      return {
        answer: 'Você não tem permissão para acessar essas informações.',
        toolsUsed: [],
      };
    }

    try {
      const result = await executeTool(crmTool, { period: parsePeriod(question) });
      const answer = formatCrmIntent(
        classifyCrmIntent(question),
        result.data as CrmLeadsSummaryData
      );

      return {
        answer,
        toolsUsed: [crmTool],
      };
    } catch {
      return {
        answer: 'Não foi possível consultar os leads do CRM no momento. Tente novamente.',
        toolsUsed: [],
      };
    }
  }

  // ── Communication semantic refinement ──────────────────────────────────
  if (overallIntent === 'COMMUNICATION') {
    const communicationSub = classifyCommunicationIntent(question);

    const isWhatsApp = communicationSub.startsWith('COMM_WHATSAPP_');
    const communicationTool: KaviarAiToolName =
      isWhatsApp ? 'whatsapp_summary' : 'inbox_summary';

    if (!canRoleExecuteTool(role, communicationTool)) {
      return {
        answer: 'Você não tem permissão para acessar essas informações.',
        toolsUsed: [],
      };
    }

    try {
      const result = await executeTool(communicationTool);

      if (communicationTool === 'whatsapp_summary') {
        const data = result.data as WhatsAppSummaryData;

        const answer =
          communicationSub === 'COMM_WHATSAPP_UNREAD'
            ? formatWhatsAppUnread(data)
            : communicationSub === 'COMM_WHATSAPP_URGENT'
              ? formatWhatsAppUrgent(data)
              : communicationSub === 'COMM_WHATSAPP_NEW'
                ? formatWhatsAppNew(data)
                : formatWhatsAppSummary(data);

        return {
          answer,
          toolsUsed: [communicationTool],
        };
      }

      const data = result.data as InboxSummaryData;

      const answer =
        communicationSub === 'COMM_EMAIL_SUBJECTS'
          ? formatEmailSubjects(data)
          : communicationSub === 'COMM_EMAIL_RISK'
            ? formatEmailRisk(data)
            : communicationSub === 'COMM_EMAIL_IMPORTANT'
              ? formatEmailImportant()
              : communicationSub === 'COMM_EMAIL_NEW'
                ? formatEmailNew(data)
                : formatInboxSummary(data);

      return {
        answer,
        toolsUsed: [communicationTool],
      };
    } catch {
      return {
        answer: 'Não foi possível consultar as comunicações no momento. Tente novamente.',
        toolsUsed: [],
      };
    }
  }

  const answers: string[] = [];
  const toolsUsed: KaviarAiToolName[] = [];
  let knowledgeResultData: unknown = undefined;

  // Territorial tools need city/uf
  const territorialTools: KaviarAiToolName[] = [
    'territory_onboarding_status',
    'territory_manager_coverage',
    'territory_activation_readiness',
    'city_opening_overview',
  ];
  let territorialArgs: Record<string, string> | undefined;

  if (authorizedTools.some(t => territorialTools.includes(t))) {
    const parsed = parseCityUf(question);
    if (parsed) {
      territorialArgs = parsed;
    } else {
      // Try to resolve city without explicit UF from known territories
      const resolved = await resolveCityFromQuestion(question);
      if (resolved === 'ambiguous') {
        return {
          answer: 'Encontrei mais de uma cidade com esse nome em UFs diferentes. Informe a UF, por exemplo: Tambaú/SP.',
          toolsUsed: [],
        };
      }
      if (!resolved) {
        return {
          answer: 'Informe a cidade e a UF, por exemplo: Pirassununga/SP.',
          toolsUsed: [],
        };
      }
      territorialArgs = resolved;
    }
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
    } else if (toolName === 'company_profile') {
      args = { section: parseCompanySection(question) };
    } else if (toolName === 'platform_catalog') {
      args = { section: parseCatalogSection(question) };
    } else if (toolName === 'driver_city_landings') {
      args = { question };
    } else if (toolName === 'knowledge_answer') {
      args = { question, role };
    } else if (toolName === 'person_lookup') {
      args = { name: extractPersonName(question) };
    } else if (toolName === 'driver_detail') {
      const idMatch = question.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      args = idMatch ? { driverId: idMatch[0] } : undefined;
    }

    const result = await executeTool(toolName, args);
    const formatter = FORMATTERS[result.tool as KaviarAiToolName];
    const formatted = formatter
      ? formatter(result.data)
      : `Resultado obtido da ferramenta "${result.tool}".`;
    answers.push(formatted);
    toolsUsed.push(result.tool as KaviarAiToolName);

    if (toolName === 'knowledge_answer') {
      knowledgeResultData = result.data;
    }

    // Auto-chain: if person_lookup found exactly 1 driver, also get driver_detail
    if (toolName === 'person_lookup') {
      const lookupData = result.data as any;
      if (lookupData.results?.length === 1 && lookupData.results[0].type === 'driver' && !lookupData.ambiguous) {
        const detailResult = await executeTool('driver_detail', { driverId: lookupData.results[0].id });
        const detailFormatter = FORMATTERS['driver_detail'];
        if (detailFormatter) {
          answers.push(detailFormatter(detailResult.data));
          toolsUsed.push('driver_detail');
        }
      }
    }
  }

  // ── knowledge_answer noMatch fallback ───────────────────────────────────
  // If the only tool was knowledge_answer and it found no approved content,
  // fall back to answerGeneral in model mode (rules mode preserves current behavior).
  if (
    toolsUsed.length === 1 &&
    toolsUsed[0] === 'knowledge_answer' &&
    getRouterMode() !== 'rules' &&
    provider && 'answerGeneral' in provider
  ) {
    // Structural check: noMatch === true means no approved articles found.
    // available === false or noMatch === false means DB/tool error — do NOT fallback.
    const kData = knowledgeResultData as KnowledgeAnswerData | undefined;
    if (kData && kData.available && kData.noMatch) {
      // ── Semantic search before ungrounded fallback ────────────────────
      try {
        const semantic = await searchKnowledgeSemantic(question, role);
        if (semantic.available && semantic.matched && semantic.snippets.length > 0) {
          // Use answerGeneral with grounding context from approved articles
          const groundedContext = semantic.snippets.join('\n\n');
          const citationsText = semantic.citations.map(c => `• ${c.title} (${c.slug} v${c.version})`).join('\n');
          const groundedQuestion = `Responda à seguinte pergunta usando SOMENTE as informações dos trechos aprovados abaixo. Se os trechos não contiverem resposta suficiente, diga que não encontrou informação aprovada suficiente. Não invente.\n\nPergunta: ${question}\n\nTrechos aprovados:\n${groundedContext}`;
          const answer = await (provider as unknown as KaviarAiDraftingComposer).answerGeneral(groundedQuestion, history);
          const withCitations = `${answer}\n\nFontes:\n${citationsText}`;
          return { answer: withCitations, toolsUsed: ['knowledge_answer'] };
        }
      } catch {
        // Semantic search failure is non-fatal; fall through to ungrounded fallback
      }

      // ── Ungrounded generative fallback (no semantic match) ────────────
      try {
        const answer = await (provider as unknown as KaviarAiDraftingComposer).answerGeneral(question, history);
        return { answer, toolsUsed: [] };
      } catch {
        return {
          answer: 'Não foi possível processar a pergunta no momento. Tente novamente.',
          toolsUsed: [],
        };
      }
    }
  }

  return {
    answer: answers.join('\n\n'),
    toolsUsed,
  };
}
