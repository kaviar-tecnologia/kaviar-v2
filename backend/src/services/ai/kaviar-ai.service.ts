import type {
  KaviarAiRequest,
  KaviarAiResponse,
} from './kaviar-ai.types';

import { getRidesSummaryToday } from './kaviar-ai.tools';

function formatBRLDecimal(value: string): string {
  const match = value.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    throw new Error('Valor financeiro inválido.');
  }

  const sign = match[1];
  const integer = match[2];
  const fraction = (match[3] ?? '').padEnd(2, '0');

  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${sign}R$ ${grouped},${fraction}`;
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

    const grossAmount = formatBRLDecimal(result.data.grossAmount);
    const kaviarFee = formatBRLDecimal(result.data.kaviarFee);

    const ridesLabel =
      result.data.rides === 1
        ? 'corrida liquidada'
        : 'corridas liquidadas';

    return {
      answer: `Hoje tivemos ${result.data.rides} ${ridesLabel}, com ${grossAmount} em valor bruto e ${kaviarFee} de receita registrada para a KAVIAR.`,
      toolsUsed: [result.tool],
    };
  }

  return {
    answer: `Ainda não sei responder: "${question}".`,
    toolsUsed: [],
  };
}