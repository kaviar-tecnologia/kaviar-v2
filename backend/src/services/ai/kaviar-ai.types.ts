export type KaviarAiToolName =
  | 'rides_summary_today'
  | 'drivers_documents_pending'
  | 'finance_due_obligations'
  | 'territory_onboarding_status'
  | 'territory_activation_readiness'
  | 'daily_briefing'
  | 'rides_operations'
  | 'finance_accounting_brief'
  | 'crm_leads_summary'
  | 'inbox_summary';

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
