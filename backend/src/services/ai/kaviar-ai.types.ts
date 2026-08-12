export type KaviarAiToolName =
  | 'rides_summary_today'
  | 'drivers_documents_pending'
  | 'finance_due_obligations';

export type KaviarAiRequest = {
  userId: string;
  question: string;
};

export type KaviarAiToolResult = {
  tool: KaviarAiToolName;
  data: unknown;
};

export type KaviarAiResponse = {
  answer: string;
  toolsUsed: KaviarAiToolName[];
};