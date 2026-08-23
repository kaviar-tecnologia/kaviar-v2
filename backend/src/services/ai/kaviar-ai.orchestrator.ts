import type { KaviarAiToolName } from './kaviar-ai.types';

// ── Intent types ─────────────────────────────────────────────────────────────

export type KaviarAiIntent =
  | 'CITY_STATUS'
  | 'CITY_STRATEGY'
  | 'DRIVERS'
  | 'REGULATORY'
  | 'FINANCE'
  | 'CRM'
  | 'COMMUNICATION'
  | 'KNOWLEDGE'
  | 'DRAFTING'
  | 'DEVELOPMENT'
  | 'GENERAL';

export interface OrchestratorPlan {
  intent: KaviarAiIntent;
  preferredTools: KaviarAiToolName[];
  maxTools: number;
}

// ── Tool families per intent ─────────────────────────────────────────────────

const INTENT_TOOL_FAMILIES: Record<KaviarAiIntent, KaviarAiToolName[]> = {
  CITY_STATUS: [
    'city_opening_overview',
    'territory_onboarding_status',
    'territory_activation_readiness',
    'territory_manager_coverage',
    'driver_city_landings',
  ],
  CITY_STRATEGY: [
    'city_opening_overview',
    'territory_onboarding_status',
    'territory_manager_coverage',
    'driver_city_landings',
    'crm_leads_summary',
  ],
  DRIVERS: [
    'driver_pipeline_summary',
    'drivers_documents_pending',
    'driver_ratings_summary',
    'compliance_summary',
    'excellence_seal_summary',
    'person_lookup',
    'driver_detail',
    'seal_history',
  ],
  REGULATORY: [
    'territory_onboarding_status',
    'territory_portfolio_summary',
    'city_opening_overview',
  ],
  FINANCE: [
    'finance_due_obligations',
    'finance_accounting_brief',
    'annual_incentive_summary',
    'rides_summary_today',
    'rides_operations',
  ],
  CRM: [
    'crm_leads_summary',
  ],
  COMMUNICATION: [
    'inbox_summary',
    'whatsapp_summary',
  ],
  KNOWLEDGE: [
    'knowledge_answer',
    'platform_catalog',
    'company_profile',
  ],
  DRAFTING: [
    // Drafting is handled before orchestrator — this is a safety net
    'company_profile',
    'knowledge_answer',
  ],
  DEVELOPMENT: [
    // Development Agent is handled before orchestrator — not filtered here
  ],
  GENERAL: [
    // GENERAL does not restrict tools
  ],
};

// ── Default tool budget per intent ───────────────────────────────────────────

const INTENT_MAX_TOOLS: Record<KaviarAiIntent, number> = {
  CITY_STATUS: 1,
  CITY_STRATEGY: 2,
  DRIVERS: 2,
  REGULATORY: 2,
  FINANCE: 2,
  CRM: 1,
  COMMUNICATION: 2,
  KNOWLEDGE: 1,
  DRAFTING: 2,
  DEVELOPMENT: 1,
  GENERAL: 3,
};

// ── Intent classification (deterministic, keyword-based) ─────────────────────

/**
 * Classifies the user's question into a KaviarAiIntent.
 * Pure function, no I/O. Deterministic keyword matching.
 */
export function classifyIntent(question: string): KaviarAiIntent {
  const q = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // DEVELOPMENT — already handled upstream, but classify for completeness
  if (
    q.includes('implementar') || q.includes('refatorar') ||
    q.includes('corrigir bug') || q.includes('criar endpoint') ||
    q.includes('alterar o codigo') || q.includes('adicionar teste')
  ) {
    return 'DEVELOPMENT';
  }

  // DRAFTING — already handled upstream
  if (
    (q.includes('redigir') || q.includes('preparar') || q.includes('escrever') || q.includes('elaborar')) &&
    (q.includes('oficio') || q.includes('email') || q.includes('e-mail') || q.includes('comunicado') || q.includes('carta'))
  ) {
    return 'DRAFTING';
  }

  // CITY_STRATEGY — strategic/recommendation about a city
  if (
    (q.includes('tornar') && q.includes('atraente')) ||
    (q.includes('atrair') && (q.includes('motorista') || q.includes('parceiro'))) ||
    (q.includes('melhorar') && (q.includes('recrutamento') || q.includes('captacao'))) ||
    (q.includes('estrategia') && (q.includes('motorista') || q.includes('cidade') || q.includes('operacao'))) ||
    (q.includes('aumentar') && (q.includes('oferta') || q.includes('motorista'))) ||
    (q.includes('precisamos') && q.includes('tornar'))
  ) {
    return 'CITY_STRATEGY';
  }

  // CITY_STATUS — operational status of a specific city
  if (
    (q.includes('como esta') && (q.includes('para iniciar') || q.includes('para operar') || q.includes('para abrir') || q.includes('para ativar'))) ||
    q.includes('pronta para operar') || q.includes('pronto para operar') ||
    q.includes('pronta para ativar') || q.includes('pronto para ativar') ||
    (q.includes('o que falta') && (q.includes('abrir') || q.includes('operar') || q.includes('iniciar') || q.includes('ativar'))) ||
    (q.includes('podemos ativar') || q.includes('podemos abrir') || q.includes('podemos iniciar') || q.includes('podemos operar')) ||
    ((q.includes('quais pendencias') || q.includes('pendencias')) && (q.includes('iniciar') || q.includes('operar') || q.includes('abrir') || q.includes('ativar'))) ||
    q.includes('abertura') && q.includes('cidade')
  ) {
    return 'CITY_STATUS';
  }

  // COMMUNICATION — inbox, whatsapp, email received
  if (
    (q.includes('e-mail') || q.includes('email') || q.includes('inbox') || q.includes('caixa de entrada')) &&
    (q.includes('chegou') || q.includes('chegaram') || q.includes('novo') || q.includes('novos') || q.includes('importante') || q.includes('urgente'))
  ) {
    return 'COMMUNICATION';
  }

  if (
    (q.includes('whatsapp') || q.includes('zap')) &&
    (q.includes('novo') || q.includes('nao lid') || q.includes('nao lida') || q.includes('pendente') || q.includes('conversa') || q.includes('mensag'))
  ) {
    return 'COMMUNICATION';
  }

  // CRM — leads, funnel
  if (
    q.includes('lead') &&
    (q.includes('novo') || q.includes('sem contato') || q.includes('quanto') || q.includes('parado') || q.includes('funil') || q.includes('contato'))
  ) {
    return 'CRM';
  }

  if (q.includes('funil') && !q.includes('motorista')) {
    return 'CRM';
  }

  // FINANCE — obligations, payments, accounting
  if (
    (q.includes('obrigacao') || q.includes('obrigacoes') || q.includes('financeira') || q.includes('financeiro')) &&
    (q.includes('venc') || q.includes('pendente') || q.includes('pagar') || q.includes('pagamento') || q.includes('semana') || q.includes('como esta'))
  ) {
    return 'FINANCE';
  }

  if (
    q.includes('contador') || q.includes('contabil') ||
    (q.includes('financ') && (q.includes('resumo') || q.includes('balanco') || q.includes('como esta')))
  ) {
    return 'FINANCE';
  }

  // "O que vence?" / "vence esta semana" — standalone financial due date
  if (
    q.includes('vence') &&
    (q.includes('semana') || q.includes('hoje') || q.includes('amanha') || q.includes('mes') || q.includes('proxim'))
  ) {
    return 'FINANCE';
  }

  // REGULATORY — regulatory status
  if (
    q.includes('regulatorio') || q.includes('regulatoria') ||
    (q.includes('exigencia') && (q.includes('cidade') || q.includes('municipio'))) ||
    (q.includes('exigencias') && !q.includes('motorista')) ||
    (q.includes('pendencia regulatoria') || q.includes('pendencia regulatorio'))
  ) {
    return 'REGULATORY';
  }

  // DRIVERS — driver pipeline, documents, ratings
  if (
    (q.includes('motorista') || q.includes('driver')) &&
    (q.includes('pendente') || q.includes('pipeline') || q.includes('quantos') ||
     q.includes('documento') || q.includes('faltando') || q.includes('suspenso') ||
     q.includes('cadastro') || q.includes('por status'))
  ) {
    return 'DRIVERS';
  }

  if (
    q.includes('pipeline de motorista') || q.includes('funil de motorista')
  ) {
    return 'DRIVERS';
  }

  // KNOWLEDGE — how does it work, what is, explain
  if (
    q.includes('como funciona') || q.includes('o que e') ||
    q.includes('explique') || q.includes('me explica') ||
    q.includes('o que significa') || q.includes('quais as regras') ||
    q.includes('seguranca do chat') || q.includes('limites do chat') ||
    q.includes('quais modulos') || q.includes('modulos existem')
  ) {
    return 'KNOWLEDGE';
  }

  return 'GENERAL';
}

// ── Orchestrator: filter and prioritize tools ────────────────────────────────

/**
 * Builds an OrchestratorPlan from the classified intent.
 * Pure function.
 */
export function buildPlan(intent: KaviarAiIntent): OrchestratorPlan {
  return {
    intent,
    preferredTools: [...INTENT_TOOL_FAMILIES[intent]],
    maxTools: INTENT_MAX_TOOLS[intent],
  };
}

/**
 * Applies the orchestrator plan to filter/prioritize the tools selected
 * by the router (rules or model).
 *
 * Rules:
 * 1. If intent is GENERAL, no filtering — pass through (respects maxTools=3).
 * 2. If intent is DEVELOPMENT or DRAFTING, no filtering — handled upstream.
 * 3. Otherwise:
 *    a. Keep only tools that belong to the intent's family (preferred).
 *    b. If none survive, keep original (fallback — don't block legitimate tools).
 *    c. Apply maxTools budget by priority order (family order).
 *
 * IMPORTANT:
 * - Does NOT add tools that weren't in the original routeResult.
 * - Does NOT override RBAC (that happens downstream).
 * - Does NOT block tools in rules mode (rules are already deterministic).
 */
export function applyPlan(
  plan: OrchestratorPlan,
  routedTools: KaviarAiToolName[]
): KaviarAiToolName[] {
  // Pass-through for intents handled upstream or GENERAL with few tools
  if (plan.intent === 'DEVELOPMENT' || plan.intent === 'DRAFTING') {
    return routedTools;
  }

  if (routedTools.length === 0) {
    return routedTools;
  }

  // GENERAL: only apply budget cap (generous: 3)
  if (plan.intent === 'GENERAL') {
    return routedTools.slice(0, plan.maxTools);
  }

  // Filter: keep only tools that are in the intent's family
  const familySet = new Set<KaviarAiToolName>(plan.preferredTools);
  const relevant = routedTools.filter(t => familySet.has(t));

  // If no tool matches the intent family:
  // - Do NOT fallback to irrelevant tools
  // - Return empty so the service layer can use the generative fallback
  if (relevant.length === 0) {
    return [];
  }

  // Sort by family priority order (tools listed first in INTENT_TOOL_FAMILIES are higher priority)
  const prioritized = relevant.sort((a, b) => {
    const idxA = plan.preferredTools.indexOf(a);
    const idxB = plan.preferredTools.indexOf(b);
    return idxA - idxB;
  });

  // Apply budget
  return prioritized.slice(0, plan.maxTools);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Main orchestrator entry point.
 *
 * Given a question and the tools selected by the router, returns a filtered
 * and prioritized list of tools respecting the intent budget.
 *
 * Position in askKaviarAi flow:
 *   ... → routeQuestion → orchestrate → RBAC filter → execute
 *
 * Only applies in MODEL mode (when the model may over-select tools).
 * In RULES mode, routeByRules is already deterministic — orchestrator
 * adds no value and should be bypassed for performance.
 */
export function orchestrate(
  question: string,
  routedTools: KaviarAiToolName[]
): { intent: KaviarAiIntent; tools: KaviarAiToolName[] } {
  const intent = classifyIntent(question);
  const plan = buildPlan(intent);
  const tools = applyPlan(plan, routedTools);
  return { intent, tools };
}
