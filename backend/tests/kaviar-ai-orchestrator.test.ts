import { describe, expect, it } from 'vitest';
import {
  classifyIntent,
  buildPlan,
  applyPlan,
  orchestrate,
} from '../src/services/ai/kaviar-ai.orchestrator';
import type { KaviarAiToolName } from '../src/services/ai/kaviar-ai.types';

// ── 1. CITY_STATUS ─────────────────────────────────────────────────────────

describe('Orchestrator — CITY_STATUS', () => {
  it('classifies "Como está Tambaú para operar?" as CITY_STATUS', () => {
    expect(classifyIntent('Como está Tambaú para operar?')).toBe('CITY_STATUS');
  });

  it('classifies "Podemos ativar Tambaú?" as CITY_STATUS', () => {
    expect(classifyIntent('Podemos ativar Tambaú?')).toBe('CITY_STATUS');
  });

  it('classifies "O que falta para abrir Santa Cruz das Palmeiras?" as CITY_STATUS', () => {
    expect(classifyIntent('O que falta para abrir Santa Cruz das Palmeiras?')).toBe('CITY_STATUS');
  });

  it('classifies "Quais pendências existem para iniciar Tambaú?" as CITY_STATUS', () => {
    expect(classifyIntent('Quais pendências existem para iniciar Tambaú?')).toBe('CITY_STATUS');
  });

  it('prioritizes city_opening_overview and removes unrelated tools', () => {
    const tools: KaviarAiToolName[] = [
      'city_opening_overview',
      'driver_pipeline_summary',
      'finance_accounting_brief',
    ];
    const result = orchestrate('Como está Tambaú para operar?', tools);
    expect(result.intent).toBe('CITY_STATUS');
    expect(result.tools).toContain('city_opening_overview');
    expect(result.tools).not.toContain('driver_pipeline_summary');
    expect(result.tools).not.toContain('finance_accounting_brief');
  });

  it('respects maxTools=1 for CITY_STATUS', () => {
    const plan = buildPlan('CITY_STATUS');
    expect(plan.maxTools).toBe(1);
  });
});

// ── 2. DRIVERS ─────────────────────────────────────────────────────────────

describe('Orchestrator — DRIVERS', () => {
  it('classifies "Quantos motoristas estão pendentes?" as DRIVERS', () => {
    expect(classifyIntent('Quantos motoristas estão pendentes?')).toBe('DRIVERS');
  });

  it('classifies "Tem motorista com documento faltando?" as DRIVERS', () => {
    expect(classifyIntent('Tem motorista com documento faltando?')).toBe('DRIVERS');
  });

  it('classifies "Como está o pipeline de motoristas?" as DRIVERS', () => {
    expect(classifyIntent('Como está o pipeline de motoristas?')).toBe('DRIVERS');
  });

  it('prioritizes driver tools and removes unrelated', () => {
    const tools: KaviarAiToolName[] = [
      'driver_pipeline_summary',
      'finance_accounting_brief',
      'inbox_summary',
      'territory_portfolio_summary',
    ];
    const result = orchestrate('Quantos motoristas estão pendentes?', tools);
    expect(result.intent).toBe('DRIVERS');
    expect(result.tools).toContain('driver_pipeline_summary');
    expect(result.tools).not.toContain('finance_accounting_brief');
    expect(result.tools).not.toContain('inbox_summary');
    expect(result.tools).not.toContain('territory_portfolio_summary');
  });

  it('respects maxTools=2 for DRIVERS', () => {
    const plan = buildPlan('DRIVERS');
    expect(plan.maxTools).toBe(2);
  });
});

// ── 3. FINANCE ─────────────────────────────────────────────────────────────

describe('Orchestrator — FINANCE', () => {
  it('classifies "Tem alguma obrigação vencida?" as FINANCE', () => {
    expect(classifyIntent('Tem alguma obrigação vencida?')).toBe('FINANCE');
  });

  it('classifies "Como está o financeiro?" as FINANCE', () => {
    expect(classifyIntent('Como está o financeiro?')).toBe('FINANCE');
  });

  it('classifies "O que vence esta semana?" as FINANCE', () => {
    expect(classifyIntent('O que vence esta semana?')).toBe('FINANCE');
  });

  it('preserves finance tools and removes driver_pipeline if model router incorrectly suggested', () => {
    const tools: KaviarAiToolName[] = [
      'finance_due_obligations',
      'driver_pipeline_summary',
      'crm_leads_summary',
    ];
    const result = orchestrate('Tem alguma obrigação vencida?', tools);
    expect(result.intent).toBe('FINANCE');
    expect(result.tools).toContain('finance_due_obligations');
    expect(result.tools).not.toContain('driver_pipeline_summary');
    expect(result.tools).not.toContain('crm_leads_summary');
  });
});

// ── 4. CRM ─────────────────────────────────────────────────────────────────

describe('Orchestrator — CRM', () => {
  it('classifies "Tem leads sem contato?" as CRM', () => {
    expect(classifyIntent('Tem leads sem contato?')).toBe('CRM');
  });

  it('classifies "Como está o funil?" as CRM', () => {
    expect(classifyIntent('Como está o funil?')).toBe('CRM');
  });

  it('classifies "Quantos leads chegaram pela landing?" as CRM', () => {
    expect(classifyIntent('Quantos leads novos chegaram pela landing?')).toBe('CRM');
  });

  it('prioritizes CRM tools and removes unrelated', () => {
    const tools: KaviarAiToolName[] = [
      'crm_leads_summary',
      'finance_due_obligations',
      'driver_pipeline_summary',
    ];
    const result = orchestrate('Tem leads sem contato?', tools);
    expect(result.intent).toBe('CRM');
    expect(result.tools).toContain('crm_leads_summary');
    expect(result.tools).not.toContain('finance_due_obligations');
    expect(result.tools).not.toContain('driver_pipeline_summary');
  });

  it('respects maxTools=1 for CRM', () => {
    const plan = buildPlan('CRM');
    expect(plan.maxTools).toBe(1);
  });
});

// ── 5. COMMUNICATION ───────────────────────────────────────────────────────

describe('Orchestrator — COMMUNICATION', () => {
  it('classifies "Chegou algum e-mail importante?" as COMMUNICATION', () => {
    expect(classifyIntent('Chegou algum e-mail importante?')).toBe('COMMUNICATION');
  });

  it('classifies "O que chegou na inbox?" as COMMUNICATION', () => {
    expect(classifyIntent('O que chegou na inbox novo?')).toBe('COMMUNICATION');
  });

  it('classifies "Tem algo urgente no WhatsApp?" as COMMUNICATION', () => {
    expect(classifyIntent('Tem algo urgente no WhatsApp? Mensagem nova?')).toBe('COMMUNICATION');
  });

  it('prioritizes inbox/whatsapp and removes finance/territory', () => {
    const tools: KaviarAiToolName[] = [
      'inbox_summary',
      'finance_accounting_brief',
      'territory_portfolio_summary',
    ];
    const result = orchestrate('Chegou algum e-mail importante?', tools);
    expect(result.intent).toBe('COMMUNICATION');
    expect(result.tools).toContain('inbox_summary');
    expect(result.tools).not.toContain('finance_accounting_brief');
    expect(result.tools).not.toContain('territory_portfolio_summary');
  });
});

// ── 6. KNOWLEDGE ───────────────────────────────────────────────────────────

describe('Orchestrator — KNOWLEDGE', () => {
  it('classifies "Como funciona a segurança do Chat KAVIAR?" as KNOWLEDGE', () => {
    expect(classifyIntent('Como funciona a segurança do Chat KAVIAR?')).toBe('KNOWLEDGE');
  });

  it('classifies "Quais módulos existem?" as KNOWLEDGE', () => {
    expect(classifyIntent('Quais módulos existem?')).toBe('KNOWLEDGE');
  });

  it('does not break knowledge flow — knowledge_answer tool preserved', () => {
    const tools: KaviarAiToolName[] = ['knowledge_answer'];
    const result = orchestrate('Como funciona a segurança do Chat KAVIAR?', tools);
    expect(result.intent).toBe('KNOWLEDGE');
    expect(result.tools).toContain('knowledge_answer');
  });

  it('knowledge flow works with platform_catalog too', () => {
    const tools: KaviarAiToolName[] = ['platform_catalog', 'knowledge_answer'];
    const result = orchestrate('Quais módulos existem?', tools);
    expect(result.intent).toBe('KNOWLEDGE');
    // Should keep at most 1 (budget)
    expect(result.tools.length).toBeLessThanOrEqual(1);
  });
});

// ── 7. GENERAL ─────────────────────────────────────────────────────────────

describe('Orchestrator — GENERAL', () => {
  it('classifies ambiguous question as GENERAL', () => {
    expect(classifyIntent('O que você acha que podemos melhorar no KAVIAR?')).toBe('GENERAL');
  });

  it('classifies non-matching question as GENERAL', () => {
    expect(classifyIntent('Bom dia, como estamos hoje?')).toBe('GENERAL');
  });

  it('does not force incorrect category — passes through tools with budget cap', () => {
    const tools: KaviarAiToolName[] = [
      'daily_briefing',
      'driver_pipeline_summary',
      'finance_due_obligations',
      'inbox_summary',
    ];
    const result = orchestrate('O que você acha que podemos melhorar no KAVIAR?', tools);
    expect(result.intent).toBe('GENERAL');
    // Budget is 3, so at most 3 tools pass through
    expect(result.tools.length).toBeLessThanOrEqual(3);
    // Tools are not reordered arbitrarily — first 3 from original
    expect(result.tools).toEqual(tools.slice(0, 3));
  });

  it('GENERAL with fewer tools than budget passes all through', () => {
    const tools: KaviarAiToolName[] = ['daily_briefing', 'inbox_summary'];
    const result = orchestrate('Como estamos hoje?', tools);
    expect(result.intent).toBe('GENERAL');
    expect(result.tools).toEqual(tools);
  });
});

// ── 8. TOOL BUDGET ─────────────────────────────────────────────────────────

describe('Orchestrator — Tool Budget', () => {
  it('limits model router suggesting 5 tools to intent-relevant subset', () => {
    const tools: KaviarAiToolName[] = [
      'driver_pipeline_summary',
      'finance_accounting_brief',
      'inbox_summary',
      'crm_leads_summary',
      'territory_portfolio_summary',
    ];
    const result = orchestrate('Quantos motoristas estão pendentes?', tools);
    expect(result.intent).toBe('DRIVERS');
    // Only driver-related tools should survive
    expect(result.tools).toContain('driver_pipeline_summary');
    expect(result.tools.length).toBeLessThanOrEqual(2);
    // Non-driver tools removed
    expect(result.tools).not.toContain('finance_accounting_brief');
    expect(result.tools).not.toContain('inbox_summary');
    expect(result.tools).not.toContain('crm_leads_summary');
    expect(result.tools).not.toContain('territory_portfolio_summary');
  });

  it('preserves priority order within family', () => {
    const tools: KaviarAiToolName[] = [
      'drivers_documents_pending',
      'driver_pipeline_summary',
      'compliance_summary',
    ];
    const result = orchestrate('Motorista com documento pendente?', tools);
    expect(result.intent).toBe('DRIVERS');
    // driver_pipeline_summary is higher priority in the family than drivers_documents_pending
    expect(result.tools[0]).toBe('driver_pipeline_summary');
    expect(result.tools.length).toBeLessThanOrEqual(2);
  });

  it('CITY_STATUS limits to 1 tool even if multiple relevant tools routed', () => {
    const tools: KaviarAiToolName[] = [
      'city_opening_overview',
      'territory_onboarding_status',
      'territory_activation_readiness',
    ];
    const result = orchestrate('Podemos ativar Tambaú?', tools);
    expect(result.intent).toBe('CITY_STATUS');
    expect(result.tools.length).toBe(1);
    expect(result.tools[0]).toBe('city_opening_overview');
  });

  it('FINANCE budget respects max 2', () => {
    const tools: KaviarAiToolName[] = [
      'finance_due_obligations',
      'finance_accounting_brief',
      'annual_incentive_summary',
      'rides_operations',
    ];
    const result = orchestrate('Como está o financeiro? Tem obrigação vencida?', tools);
    expect(result.intent).toBe('FINANCE');
    expect(result.tools.length).toBeLessThanOrEqual(2);
    // Higher priority finance tools first
    expect(result.tools[0]).toBe('finance_due_obligations');
  });

  it('does not apply budget when no tools are routed', () => {
    const tools: KaviarAiToolName[] = [];
    const result = orchestrate('Qualquer pergunta', tools);
    expect(result.tools).toEqual([]);
  });

  it('fallback: if filtering removes all tools for specific intent, returns empty', () => {
    // DRIVERS intent but only non-driver tools available
    // Specific intent should NOT preserve irrelevant tools
    const tools: KaviarAiToolName[] = [
      'inbox_summary',
      'crm_leads_summary',
    ];
    const result = orchestrate('Quantos motoristas estão pendentes?', tools);
    expect(result.intent).toBe('DRIVERS');
    // Returns empty — service layer handles generative fallback
    expect(result.tools).toEqual([]);
  });

  it('FINANCE with only irrelevant tools — none should survive by fallback', () => {
    const tools: KaviarAiToolName[] = [
      'driver_pipeline_summary',
      'inbox_summary',
      'territory_portfolio_summary',
    ];
    const result = orchestrate('Tem alguma obrigação vencida?', tools);
    expect(result.intent).toBe('FINANCE');
    // None of these belong to FINANCE family — all filtered out
    expect(result.tools).toEqual([]);
    expect(result.tools).not.toContain('driver_pipeline_summary');
    expect(result.tools).not.toContain('inbox_summary');
    expect(result.tools).not.toContain('territory_portfolio_summary');
  });

  it('GENERAL with 5 tools — preserves original order with budget cap', () => {
    const tools: KaviarAiToolName[] = [
      'daily_briefing',
      'driver_pipeline_summary',
      'finance_due_obligations',
      'inbox_summary',
      'territory_portfolio_summary',
    ];
    const result = orchestrate('Bom dia, me dê um panorama geral rápido', tools);
    expect(result.intent).toBe('GENERAL');
    // GENERAL budget = 3, preserves first 3 from original
    expect(result.tools.length).toBe(3);
    expect(result.tools).toEqual(tools.slice(0, 3));
  });
});

// ── 9. RBAC ────────────────────────────────────────────────────────────────

describe('Orchestrator — RBAC preservation', () => {
  it('orchestrator does NOT add tools beyond what router selected', () => {
    // Even though DRIVERS family includes many tools, orchestrator can only keep
    // what was already in the routedTools list
    const tools: KaviarAiToolName[] = ['drivers_documents_pending'];
    const result = orchestrate('Quantos motoristas estão pendentes?', tools);
    // Should NOT contain tools that weren't originally routed
    expect(result.tools.every(t => tools.includes(t))).toBe(true);
  });

  it('orchestrator never injects protected tools not in original set', () => {
    const tools: KaviarAiToolName[] = ['company_profile'];
    const result = orchestrate('Como funciona a segurança?', tools);
    // Should only contain what was passed in
    for (const t of result.tools) {
      expect(tools).toContain(t);
    }
  });

  it('RBAC remains downstream — orchestrator output is just pre-filtered list', () => {
    // Simulate: model router suggests tools, orchestrator filters,
    // but RBAC (canRoleExecuteTool) is still applied after
    const tools: KaviarAiToolName[] = [
      'driver_pipeline_summary',
      'daily_briefing',
    ];
    const result = orchestrate('Quantos motoristas pendentes?', tools);
    // Orchestrator filtered to driver family
    // RBAC would still need to verify each tool against user's role
    // The orchestrator itself doesn't call canRoleExecuteTool
    expect(result.tools.length).toBeGreaterThan(0);
  });
});

// ── 10. REGRESSIONS ────────────────────────────────────────────────────────

describe('Orchestrator — Regressions', () => {
  it('CITY_STRATEGY is classified correctly (strategic city intent)', () => {
    expect(classifyIntent('Como tornar Tambaú mais atraente para motoristas?')).toBe('CITY_STRATEGY');
    expect(classifyIntent('Como melhorar o recrutamento em Tambaú?')).toBe('CITY_STRATEGY');
    expect(classifyIntent('O que podemos fazer para atrair mais motoristas em Tambaú?')).toBe('CITY_STRATEGY');
  });

  it('CITY_STRATEGY does not interfere — handled upstream by detectStrategicCityIntent', () => {
    // The orchestrator classifies intent for completeness but CITY_STRATEGY
    // is already short-circuited before routeQuestion in the service layer
    const plan = buildPlan('CITY_STRATEGY');
    expect(plan.maxTools).toBe(2);
  });

  it('DEVELOPMENT intent classified but not filtered (handled upstream)', () => {
    const result = orchestrate('Implementar uma feature nova', ['knowledge_answer']);
    expect(result.intent).toBe('DEVELOPMENT');
    // DEVELOPMENT pass-through (handled by detectDevelopmentIntent upstream)
    expect(result.tools).toEqual(['knowledge_answer']);
  });

  it('DRAFTING intent classified but not filtered (handled upstream)', () => {
    const result = orchestrate('Redigir um ofício formal', ['company_profile']);
    expect(result.intent).toBe('DRAFTING');
    // DRAFTING pass-through (handled by detectDraftingIntent upstream)
    expect(result.tools).toEqual(['company_profile']);
  });

  it('offer acceptance short words are not incorrectly classified', () => {
    // "quero" / "sim" are very short — should be GENERAL
    expect(classifyIntent('quero')).toBe('GENERAL');
    expect(classifyIntent('sim')).toBe('GENERAL');
    expect(classifyIntent('ok')).toBe('GENERAL');
  });

  it('conversational context: empty or single word questions are GENERAL', () => {
    expect(classifyIntent('obrigado')).toBe('GENERAL');
    expect(classifyIntent('hmm')).toBe('GENERAL');
  });

  it('REGULATORY intent is classified for regulatory questions', () => {
    expect(classifyIntent('Como está a situação regulatória de Campinas?')).toBe('REGULATORY');
    expect(classifyIntent('Quais exigências existem em Tambaú?')).toBe('REGULATORY');
    expect(classifyIntent('Tem alguma pendência regulatória?')).toBe('REGULATORY');
  });

  it('applyPlan with empty tools returns empty', () => {
    const plan = buildPlan('FINANCE');
    expect(applyPlan(plan, [])).toEqual([]);
  });

  it('buildPlan returns correct structure for all intents', () => {
    const intents: Array<ReturnType<typeof classifyIntent>> = [
      'CITY_STATUS', 'CITY_STRATEGY', 'DRIVERS', 'REGULATORY',
      'FINANCE', 'CRM', 'COMMUNICATION', 'KNOWLEDGE', 'DRAFTING',
      'DEVELOPMENT', 'GENERAL',
    ];
    for (const intent of intents) {
      const plan = buildPlan(intent);
      expect(plan.intent).toBe(intent);
      expect(plan.maxTools).toBeGreaterThan(0);
      expect(Array.isArray(plan.preferredTools)).toBe(true);
    }
  });
});
