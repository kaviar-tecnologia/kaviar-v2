import type { KaviarAiToolName } from './kaviar-ai.types';
import {
  getRidesSummaryToday,
  getDriversDocumentsPending,
  getFinanceDueObligations,
  getTerritoryOnboardingStatus,
  getTerritoryActivationReadiness,
  getDailyBriefing,
  getRidesOperations,
  getFinanceAccountingBrief,
  getCrmLeadsSummary,
  getInboxSummary,
  getCompanyProfile,
} from './kaviar-ai.tools';
import {
  getPlatformCatalog,
  getAnnualIncentiveSummary,
  getWhatsAppSummary,
  getDriverPipelineSummary,
  getEmergencyOperationsSummary,
  getTerritoryPortfolioSummary,
} from './kaviar-ai.command-center';

/**
 * Schema de argumentos de uma ferramenta da KAVIAR IA.
 * Nesta fase nenhuma ferramenta aceita argumentos do usuário.
 */
export interface KaviarAiToolArgSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
}

/**
 * Definição de uma ferramenta registrada no AI Core.
 */
export interface KaviarAiToolDefinition {
  name: KaviarAiToolName;
  description: string;
  readOnly: true;
  argSchema: KaviarAiToolArgSchema;
  allowedRoles: string[];
  execute: (args?: Record<string, string>) => Promise<{ tool: KaviarAiToolName; data: unknown }>;
}

/**
 * Registry estático das ferramentas autorizadas.
 *
 * Somente ferramentas presentes neste array podem ser executadas.
 * Não é permitida execução dinâmica por nome arbitrário, reflection,
 * eval ou import indicado pelo modelo.
 */
const TOOL_DEFINITIONS: readonly KaviarAiToolDefinition[] = [
  {
    name: 'rides_summary_today',
    description:
      'Retorna o resumo financeiro das corridas liquidadas hoje: quantidade, valor bruto e receita da KAVIAR.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN', 'FINANCE'],
    execute: getRidesSummaryToday,
  },
  {
    name: 'drivers_documents_pending',
    description:
      'Retorna a contagem de motoristas com documentos pendentes de análise (SUBMITTED, MISSING, REJECTED) e compliance pendente.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN', 'FINANCE'],
    execute: getDriversDocumentsPending,
  },
  {
    name: 'finance_due_obligations',
    description:
      'Retorna obrigações financeiras pendentes: total, valor, vencidas e a vencer nos próximos 7 dias.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN', 'FINANCE'],
    execute: getFinanceDueObligations,
  },
  {
    name: 'territory_onboarding_status',
    description:
      'Consulta o status de onboarding de um território/cidade: existência, status, regulatório, gestor e pendências. Requer city e uf.',
    readOnly: true,
    argSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Nome da cidade' },
        uf: { type: 'string', description: 'Sigla do estado (2 letras)' },
      },
      required: ['city', 'uf'],
    },
    allowedRoles: ['SUPER_ADMIN'],
    execute: (args) => getTerritoryOnboardingStatus(args?.city ?? '', args?.uf ?? ''),
  },
  {
    name: 'territory_activation_readiness',
    description:
      'Verifica se um território está pronto para ativação: regulatório, gestor, bloqueios. Requer city e uf.',
    readOnly: true,
    argSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Nome da cidade' },
        uf: { type: 'string', description: 'Sigla do estado (2 letras)' },
      },
      required: ['city', 'uf'],
    },
    allowedRoles: ['SUPER_ADMIN'],
    execute: (args) => getTerritoryActivationReadiness(args?.city ?? '', args?.uf ?? ''),
  },
  // ── Pacote Administrativo Inteligente v1 ────────────────────────────────
  {
    name: 'daily_briefing',
    description:
      'Resumo administrativo consolidado: corridas, motoristas, financeiro, leads, inbox e territórios com classificação de prioridade.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN'],
    execute: getDailyBriefing,
  },
  {
    name: 'rides_operations',
    description:
      'Consulta operacional de corridas por período (today/week/month) com comparação ao período anterior.',
    readOnly: true,
    argSchema: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['today', 'week', 'month'] } },
      required: ['period'],
    },
    allowedRoles: ['SUPER_ADMIN', 'FINANCE'],
    execute: getRidesOperations,
  },
  {
    name: 'finance_accounting_brief',
    description:
      'Resumo financeiro e contábil: receita, despesa, resultado, obrigações e pendências do contador.',
    readOnly: true,
    argSchema: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['month', 'quarter'] } },
      required: ['period'],
    },
    allowedRoles: ['SUPER_ADMIN', 'FINANCE'],
    execute: getFinanceAccountingBrief,
  },
  {
    name: 'crm_leads_summary',
    description:
      'Resumo do CRM: leads novos, funil, sem contato, parados e distribuição por origem/território.',
    readOnly: true,
    argSchema: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['today', 'week', 'month'] } },
      required: ['period'],
    },
    allowedRoles: ['SUPER_ADMIN'],
    execute: getCrmLeadsSummary,
  },
  {
    name: 'inbox_summary',
    description:
      'Resumo da inbox institucional: e-mails novos, assuntos recentes e classificação de risco. Nunca retorna corpo das mensagens.',
    readOnly: true,
    argSchema: {
      type: 'object',
      properties: { limit: { type: 'string', description: 'Máximo de e-mails (1-10, default 5)' } },
      required: [],
    },
    allowedRoles: ['SUPER_ADMIN'],
    execute: getInboxSummary,
  },
  {
    name: 'company_profile',
    description:
      'Dados institucionais da KAVIAR: identidade (CNPJ, razão social), contatos, governança (sócios, CEO), estrutura (matriz/filiais) e atividades (CNAEs).',
    readOnly: true,
    argSchema: {
      type: 'object',
      properties: { section: { type: 'string', enum: ['identity', 'contacts', 'governance', 'structure', 'activities', 'about', 'full'] } },
      required: [],
    },
    allowedRoles: ['SUPER_ADMIN', 'FINANCE'],
    execute: getCompanyProfile,
  },
  // ── Command Center v1 ───────────────────────────────────────────────────
  {
    name: 'platform_catalog',
    description: 'Catálogo de módulos da plataforma KAVIAR: o que existe, para que serve e onde acessar no admin.',
    readOnly: true,
    argSchema: { type: 'object', properties: { section: { type: 'string' } }, required: [] },
    allowedRoles: ['SUPER_ADMIN', 'FINANCE'],
    execute: getPlatformCatalog,
  },
  {
    name: 'annual_incentive_summary',
    description: 'Resumo da Gratificação Anual: total acumulado, a pagar, disponível, reservado, pago e previsão até dezembro.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN', 'FINANCE'],
    execute: getAnnualIncentiveSummary,
  },
  {
    name: 'whatsapp_summary',
    description: 'Resumo da Central WhatsApp: conversas novas, não lidas e urgentes. Nunca retorna telefone ou corpo de mensagem.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN'],
    execute: getWhatsAppSummary,
  },
  {
    name: 'driver_pipeline_summary',
    description: 'Pipeline de motoristas: total, por status, por tipo de veículo, documentos pendentes e compliance.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN'],
    execute: getDriverPipelineSummary,
  },
  {
    name: 'emergency_operations_summary',
    description: 'Emergências operacionais: ativas, registradas hoje, resolvidas e alarmes falsos.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN'],
    execute: getEmergencyOperationsSummary,
  },
  {
    name: 'territory_portfolio_summary',
    description: 'Portfólio de territórios: total por status, regulatório, sem gestor e modalidades habilitadas.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['SUPER_ADMIN'],
    execute: getTerritoryPortfolioSummary,
  },
] as const;

/**
 * Retorna todas as definições de ferramentas autorizadas.
 */
export function getRegisteredTools(): readonly KaviarAiToolDefinition[] {
  return TOOL_DEFINITIONS;
}

/**
 * Busca uma ferramenta pelo nome exato.
 * Retorna undefined se o nome não estiver registrado.
 */
export function getToolByName(
  name: string
): KaviarAiToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

/**
 * Verifica se uma role pode executar determinada tool.
 */
export function canRoleExecuteTool(role: string, toolName: string): boolean {
  const tool = getToolByName(toolName);
  if (!tool) return false;
  return tool.allowedRoles.includes(role);
}

/**
 * Executa uma ferramenta registrada pelo nome.
 * Lança erro se o nome não estiver no registry.
 */
export async function executeTool(
  name: string,
  args?: Record<string, string>
): Promise<{ tool: KaviarAiToolName; data: unknown }> {
  const tool = getToolByName(name);
  if (!tool) {
    throw new Error(
      `[kaviar-ai-registry] Ferramenta "${name}" não está registrada. Execução negada.`
    );
  }
  return tool.execute(args);
}
