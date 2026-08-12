import type {
  KaviarAiRequest,
  KaviarAiResponse,
  KaviarAiToolName,
} from './kaviar-ai.types';
import type { KaviarAiModelProvider } from './kaviar-ai.provider';
import type {
  RidesSummaryTodayData,
  DriversDocumentsPendingData,
  FinanceDueObligationsData,
} from './kaviar-ai.tools';
import { executeTool } from './kaviar-ai.registry';
import { routeQuestion } from './kaviar-ai.router';

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

function formatCentsBRL(cents: string): string {
  const value = BigInt(cents);
  const isNegative = value < 0n;
  const abs = isNegative ? -value : value;
  const integer = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, '0');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}R$ ${grouped},${fraction}`;
}

// ── Formatadores por ferramenta ────────────────────────────────────────────

function formatRidesSummary(data: RidesSummaryTodayData): string {
  const grossAmount = formatBRLDecimal(data.grossAmount);
  const kaviarFee = formatBRLDecimal(data.kaviarFee);

  const ridesLabel =
    data.rides === 1 ? 'corrida liquidada' : 'corridas liquidadas';

  return `Hoje tivemos ${data.rides} ${ridesLabel}, com ${grossAmount} em valor bruto e ${kaviarFee} de receita registrada para a KAVIAR.`;
}

function formatDriversDocumentsPending(data: DriversDocumentsPendingData): string {
  const { driversAffected, summary, compliancePending } = data;

  if (driversAffected === 0 && compliancePending === 0) {
    return 'Nenhum motorista com documentos pendentes no momento.';
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

  return `Há ${parts.join('. ')}.`;
}

function formatFinanceDueObligations(data: FinanceDueObligationsData): string {
  const { totalPending, totalAmountCents, overdueCount, overdueAmountCents, dueSoonCount, dueSoonAmountCents } = data;

  if (totalPending === 0) {
    return 'Não há obrigações financeiras pendentes com vencimento registrado.';
  }

  const parts: string[] = [];

  parts.push(
    `${totalPending} ${totalPending === 1 ? 'obrigação pendente' : 'obrigações pendentes'}, totalizando ${formatCentsBRL(totalAmountCents)}`
  );

  if (overdueCount > 0) {
    parts.push(
      `${overdueCount} ${overdueCount === 1 ? 'está vencida' : 'estão vencidas'} (${formatCentsBRL(overdueAmountCents)})`
    );
  }

  if (dueSoonCount > 0) {
    parts.push(
      `${dueSoonCount} ${dueSoonCount === 1 ? 'vence' : 'vencem'} nos próximos 7 dias (${formatCentsBRL(dueSoonAmountCents)})`
    );
  }

  return `Há ${parts.join('. ')}.`;
}

const FORMATTERS: Record<KaviarAiToolName, (data: unknown) => string> = {
  rides_summary_today: (data) =>
    formatRidesSummary(data as RidesSummaryTodayData),
  drivers_documents_pending: (data) =>
    formatDriversDocumentsPending(data as DriversDocumentsPendingData),
  finance_due_obligations: (data) =>
    formatFinanceDueObligations(data as FinanceDueObligationsData),
};

// ── Função principal ───────────────────────────────────────────────────────

export async function askKaviarAi(
  request: KaviarAiRequest,
  provider?: KaviarAiModelProvider
): Promise<KaviarAiResponse> {
  const question = request.question.trim();

  if (!question) {
    return {
      answer: 'Faça uma pergunta para a KAVIAR IA.',
      toolsUsed: [],
    };
  }

  const route = await routeQuestion(question, provider);

  if (route.toolsToCall.length === 0) {
    return {
      answer: `Ainda não sei responder: "${question}".`,
      toolsUsed: [],
    };
  }

  // Executa todas as ferramentas roteadas, na ordem retornada pelo router.
  // Cada nome passa obrigatoriamente por executeTool() (validação via registry).
  const answers: string[] = [];
  const toolsUsed: KaviarAiToolName[] = [];

  for (const toolName of route.toolsToCall) {
    const result = await executeTool(toolName);
    const formatter = FORMATTERS[result.tool as KaviarAiToolName];
    const formatted = formatter
      ? formatter(result.data)
      : `Resultado obtido da ferramenta "${result.tool}".`;
    answers.push(formatted);
    toolsUsed.push(result.tool as KaviarAiToolName);
  }

  return {
    answer: answers.join('\n\n'),
    toolsUsed,
  };
}
