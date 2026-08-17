export type KaviarAiToolName =
  | 'rides_summary_today'
  | 'drivers_documents_pending'
  | 'finance_due_obligations'
  | 'territory_onboarding_status'
  | 'territory_manager_coverage'
  | 'territory_activation_readiness'
  | 'daily_briefing'
  | 'rides_operations'
  | 'finance_accounting_brief'
  | 'crm_leads_summary'
  | 'inbox_summary'
  | 'company_profile'
  | 'platform_catalog'
  | 'annual_incentive_summary'
  | 'whatsapp_summary'
  | 'driver_pipeline_summary'
  | 'emergency_operations_summary'
  | 'territory_portfolio_summary'
  | 'knowledge_answer'
  | 'driver_ratings_summary'
  | 'compliance_summary'
  | 'excellence_seal_summary'
  | 'operations_overview'
  | 'person_lookup'
  | 'driver_detail'
  | 'seal_history'
  | 'driver_city_landings';

export type KaviarAiRequest = {
  userId: string;
  question: string;
  role: string;
};

export type KaviarAiToolResult = {
  tool: KaviarAiToolName;
  data: unknown;
};

export type KaviarAiResponse = {
  answer: string;
  toolsUsed: KaviarAiToolName[];
};
