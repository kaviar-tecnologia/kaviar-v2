import type { KaviarAiToolResult } from './kaviar-ai.types';

export type RidesSummaryTodayData = {
  rides: number;
  grossAmountCents: number;
  kaviarFeeCents: number;
};

export async function getRidesSummaryToday(): Promise<
  KaviarAiToolResult & { data: RidesSummaryTodayData }
> {
  return {
    tool: 'rides_summary_today',
    data: {
      rides: 3,
      grossAmountCents: 5500,
      kaviarFeeCents: 990,
    },
  };
}