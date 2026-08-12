import type { KaviarAiToolResult } from './kaviar-ai.types';

export async function getRidesSummaryToday(): Promise<KaviarAiToolResult> {
  return {
    tool: 'rides_summary_today',
    data: {
      rides: 3,
      grossAmountCents: 5500,
      kaviarFeeCents: 990,
    },
  };
}