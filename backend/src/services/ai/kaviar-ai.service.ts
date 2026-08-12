import type {
  KaviarAiRequest,
  KaviarAiResponse,
} from './kaviar-ai.types';

import { getRidesSummaryToday } from './kaviar-ai.tools';

function formatBRLFromCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export async function askKaviarAi(
  request: KaviarAiRequest
): Promise<KaviarAiResponse> {
  const question = request.question.trim();

  if (!question) {
    return {
      answer: 'Faça uma pergunta para a KAVIAR IA.',
      toolsUsed: [],
    };
  }

  const normalizedQuestion = question.toLowerCase();

  if (
    normalizedQuestion.includes('ganhou hoje') ||
    normalizedQuestion.includes('corridas hoje') ||
    normalizedQuestion.includes('faturou hoje')
  ) {
    const result = await getRidesSummaryToday();

    const grossAmount = formatBRLFromCents(
      result.data.grossAmountCents
    );

    const kaviarFee = formatBRLFromCents(
      result.data.kaviarFeeCents
    );

    return {
      answer: `Hoje tivemos ${result.data.rides} corridas, com ${grossAmount} em valor bruto e ${kaviarFee} de receita para a KAVIAR.`,
      toolsUsed: [result.tool],
    };
  }

  return {
    answer: `Ainda não sei responder: "${question}".`,
    toolsUsed: [],
  };
}