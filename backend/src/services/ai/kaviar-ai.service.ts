import type {
  KaviarAiRequest,
  KaviarAiResponse,
} from './kaviar-ai.types';

import { getRidesSummaryToday, getDriversDocumentsPending } from './kaviar-ai.tools';

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

  const hasDriverContext =
    normalizedQuestion.includes('motorista') ||
    normalizedQuestion.includes('driver');

  const hasDocContext =
    normalizedQuestion.includes('documento') ||
    normalizedQuestion.includes('doc ') ||
    normalizedQuestion.includes('docs ') ||
    normalizedQuestion.includes('docs?');

  const hasPendingContext =
    normalizedQuestion.includes('pendente') ||
    normalizedQuestion.includes('aprovação') ||
    normalizedQuestion.includes('aprovacao') ||
    normalizedQuestion.includes('aguardando');

  if (
    (hasDocContext && hasDriverContext) ||
    (hasDocContext && hasPendingContext) ||
    (hasDriverContext && hasPendingContext)
  ) {
    const result = await getDriversDocumentsPending();
    const { driversAffected, summary, compliancePending } = result.data;

    if (driversAffected === 0 && compliancePending === 0) {
      return {
        answer: 'Nenhum motorista com documentos pendentes no momento.',
        toolsUsed: [result.tool],
      };
    }

    const parts: string[] = [];

    if (driversAffected > 0) {
      const driverLabel =
        driversAffected === 1 ? 'motorista' : 'motoristas';
      parts.push(
        `${driversAffected} ${driverLabel} com documentos pendentes`
      );

      const statusParts: string[] = [];
      for (const [status, count] of Object.entries(summary)) {
        statusParts.push(`${status}: ${count}`);
      }
      if (statusParts.length > 0) {
        parts.push(`(${statusParts.join(', ')})`);
      }
    }

    if (compliancePending > 0) {
      const compLabel =
        compliancePending === 1 ? 'motorista' : 'motoristas';
      parts.push(
        `${compliancePending} ${compLabel} com documento de compliance aguardando aprovação`
      );
    }

    const answer = `Há ${parts.join('. ')}.`;

    return {
      answer,
      toolsUsed: [result.tool],
    };
  }

  return {
    answer: `Ainda não sei responder: "${question}".`,
    toolsUsed: [],
  };
}