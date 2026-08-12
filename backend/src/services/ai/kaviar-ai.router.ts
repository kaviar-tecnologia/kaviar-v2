import type { KaviarAiToolName } from './kaviar-ai.types';
import type { KaviarAiModelProvider } from './kaviar-ai.provider';
import { getRegisteredTools } from './kaviar-ai.registry';

/**
 * Modos de roteamento da KAVIAR IA.
 *
 * - `rules`: Detecção por palavras-chave (comportamento atual).
 * - `model`: Delegação para um KaviarAiModelProvider (futuro).
 */
export type KaviarAiRouterMode = 'rules' | 'model';

/**
 * Resultado do roteamento: lista de ferramentas que devem ser executadas.
 */
export interface KaviarAiRouteResult {
  toolsToCall: KaviarAiToolName[];
}

/**
 * Obtém o modo de roteamento da variável de ambiente.
 * Padrão: 'rules'.
 */
export function getRouterMode(): KaviarAiRouterMode {
  const mode = process.env.KAVIAR_AI_ROUTER_MODE;
  if (mode === 'model') return 'model';
  return 'rules';
}

/**
 * Roteamento por regras (palavras-chave).
 *
 * Esta é a estratégia atual. Mantida como fallback e como comportamento
 * padrão enquanto nenhum modelo externo estiver configurado.
 */
export function routeByRules(question: string): KaviarAiRouteResult {
  const q = question.toLowerCase();

  // ── Rides summary ─────────────────────────────────────────────────────
  if (
    q.includes('ganhou hoje') ||
    q.includes('corridas hoje') ||
    q.includes('faturou hoje')
  ) {
    return { toolsToCall: ['rides_summary_today'] };
  }

  // ── Drivers documents pending ─────────────────────────────────────────
  const hasDriverContext =
    q.includes('motorista') || q.includes('driver');

  const hasDocContext =
    q.includes('documento') ||
    q.includes('doc ') ||
    q.includes('docs ') ||
    q.includes('docs?');

  const hasPendingContext =
    q.includes('pendente') ||
    q.includes('aprovação') ||
    q.includes('aprovacao') ||
    q.includes('aguardando');

  if (
    (hasDocContext && hasDriverContext) ||
    (hasDocContext && hasPendingContext) ||
    (hasDriverContext && hasPendingContext)
  ) {
    return { toolsToCall: ['drivers_documents_pending'] };
  }

  // ── Finance due obligations ───────────────────────────────────────────
  const hasFinanceContext =
    q.includes('obrigaç') ||
    q.includes('financeira') ||
    q.includes('financeiro') ||
    q.includes('pagar') ||
    q.includes('pagamento') ||
    q.includes('conta');

  const hasDueContext =
    q.includes('vence') ||
    q.includes('vencid') ||
    q.includes('pendente') ||
    q.includes('atenção') ||
    q.includes('atencao') ||
    q.includes('semana') ||
    q.includes('próximos') ||
    q.includes('proximos');

  if (hasFinanceContext && hasDueContext) {
    return { toolsToCall: ['finance_due_obligations'] };
  }

  return { toolsToCall: [] };
}

/**
 * Valida a decisão do provider em runtime.
 *
 * Não confia apenas em tipagem TypeScript — dados futuramente virão de rede/JSON.
 * Se a estrutura for inválida ou contiver ferramenta não registrada, rejeita
 * a decisão inteira (fail-closed).
 *
 * @throws se toolsToCall não existir, não for array, contiver não-strings,
 *         ou contiver ferramentas não registradas.
 */
export function validateModelDecision(
  decision: unknown
): KaviarAiToolName[] {
  if (
    decision === null ||
    decision === undefined ||
    typeof decision !== 'object'
  ) {
    throw new Error(
      '[kaviar-ai-router] Decisão do provider inválida: resposta não é um objeto.'
    );
  }

  const obj = decision as Record<string, unknown>;

  if (!Array.isArray(obj.toolsToCall)) {
    throw new Error(
      '[kaviar-ai-router] Decisão do provider inválida: toolsToCall ausente ou não é array.'
    );
  }

  const tools = getRegisteredTools();
  const registeredNames = new Set<string>(tools.map((t) => t.name));

  for (const item of obj.toolsToCall) {
    if (typeof item !== 'string') {
      throw new Error(
        '[kaviar-ai-router] Decisão do provider inválida: toolsToCall contém elemento não-string.'
      );
    }
    if (!registeredNames.has(item)) {
      throw new Error(
        '[kaviar-ai-router] Decisão do provider rejeitada: ferramenta não registrada solicitada.'
      );
    }
  }

  return obj.toolsToCall as KaviarAiToolName[];
}

/**
 * Roteamento via modelo de linguagem.
 *
 * Requer um provider configurado. Se o provider não for fornecido,
 * falha de forma controlada sem executar nenhuma ferramenta.
 *
 * Comportamento fail-closed: se o provider retornar qualquer ferramenta
 * não registrada, a decisão inteira é rejeitada. Nenhuma ferramenta
 * (válida ou não) será executada.
 */
export async function routeByModel(
  question: string,
  provider: KaviarAiModelProvider | undefined
): Promise<KaviarAiRouteResult> {
  if (!provider) {
    throw new Error(
      '[kaviar-ai-router] Modo "model" configurado mas nenhum provider disponível. ' +
        'Configure um KaviarAiModelProvider ou use KAVIAR_AI_ROUTER_MODE=rules.'
    );
  }

  const tools = getRegisteredTools();
  const availableTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    argSchema: t.argSchema,
  }));

  const decision = await provider.decide({ question, availableTools });

  // Validação runtime fail-closed: rejeita decisão inteira se inválida
  const validatedTools = validateModelDecision(decision);

  return { toolsToCall: validatedTools };
}

/**
 * Roteia a pergunta para as ferramentas adequadas.
 *
 * @param question - Pergunta do usuário (já trimada)
 * @param provider - Provider opcional (necessário apenas no modo model)
 */
export async function routeQuestion(
  question: string,
  provider?: KaviarAiModelProvider
): Promise<KaviarAiRouteResult> {
  const mode = getRouterMode();

  if (mode === 'model') {
    return routeByModel(question, provider);
  }

  return routeByRules(question);
}
