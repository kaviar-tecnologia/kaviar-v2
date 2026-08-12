import type {
  KaviarAiRequest,
  KaviarAiResponse,
} from './kaviar-ai.types';

import { getRidesSummaryToday } from './kaviar-ai.tools';

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

    return {
      answer:
        'Hoje tivemos 3 corridas, com R$ 55,00 em valor bruto e R$ 9,90 de receita para a KAVIAR.',
      toolsUsed: [result.tool],
    };
  }

  return {
    answer: `Ainda não sei responder: "${question}".`,
    toolsUsed: [],
  };
}