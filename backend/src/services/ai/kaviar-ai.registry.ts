import type { KaviarAiToolName } from './kaviar-ai.types';
import {
  getRidesSummaryToday,
  getDriversDocumentsPending,
  getFinanceDueObligations,
} from './kaviar-ai.tools';

/**
 * Schema de argumentos de uma ferramenta da KAVIAR IA.
 * Nesta fase nenhuma ferramenta aceita argumentos do usuário.
 */
export interface KaviarAiToolArgSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
}

/**
 * Definição de uma ferramenta registrada no AI Core.
 */
export interface KaviarAiToolDefinition {
  name: KaviarAiToolName;
  description: string;
  readOnly: true;
  argSchema: KaviarAiToolArgSchema;
  execute: () => Promise<{ tool: KaviarAiToolName; data: unknown }>;
}

/**
 * Registry estático das ferramentas autorizadas.
 *
 * Somente ferramentas presentes neste array podem ser executadas.
 * Não é permitida execução dinâmica por nome arbitrário, reflection,
 * eval ou import indicado pelo modelo.
 */
const TOOL_DEFINITIONS: readonly KaviarAiToolDefinition[] = [
  {
    name: 'rides_summary_today',
    description:
      'Retorna o resumo financeiro das corridas liquidadas hoje: quantidade, valor bruto e receita da KAVIAR.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    execute: getRidesSummaryToday,
  },
  {
    name: 'drivers_documents_pending',
    description:
      'Retorna a contagem de motoristas com documentos pendentes de análise (SUBMITTED, MISSING, REJECTED) e compliance pendente.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    execute: getDriversDocumentsPending,
  },
  {
    name: 'finance_due_obligations',
    description:
      'Retorna obrigações financeiras pendentes: total, valor, vencidas e a vencer nos próximos 7 dias.',
    readOnly: true,
    argSchema: { type: 'object', properties: {}, required: [] },
    execute: getFinanceDueObligations,
  },
] as const;

/**
 * Retorna todas as definições de ferramentas autorizadas.
 */
export function getRegisteredTools(): readonly KaviarAiToolDefinition[] {
  return TOOL_DEFINITIONS;
}

/**
 * Busca uma ferramenta pelo nome exato.
 * Retorna undefined se o nome não estiver registrado.
 */
export function getToolByName(
  name: string
): KaviarAiToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

/**
 * Executa uma ferramenta registrada pelo nome.
 * Lança erro se o nome não estiver no registry.
 */
export async function executeTool(
  name: string
): Promise<{ tool: KaviarAiToolName; data: unknown }> {
  const tool = getToolByName(name);
  if (!tool) {
    throw new Error(
      `[kaviar-ai-registry] Ferramenta "${name}" não está registrada. Execução negada.`
    );
  }
  return tool.execute();
}
