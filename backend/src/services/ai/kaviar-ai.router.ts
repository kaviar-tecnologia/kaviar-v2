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

  // ── Emergency: corridas sem motorista / ajustes (before rides_summary) ──
  if (
    (q.includes('corrida') || q.includes('corridas')) &&
    (q.includes('sem motorista') || q.includes('ajuste pendente') || q.includes('ajustes pendentes'))
  ) {
    return { toolsToCall: ['emergency_operations_summary'] };
  }

  // ── Rides summary ─────────────────────────────────────────────────────
  if (
    q.includes('ganhou hoje') ||
    q.includes('corridas hoje') ||
    q.includes('faturou hoje')
  ) {
    return { toolsToCall: ['rides_summary_today'] };
  }

  // ── Emergency operations summary (must be before drivers_documents) ────
  if (
    q.includes('emergência') || q.includes('emergencia') ||
    q.includes('emergências') || q.includes('emergencias') ||
    q.includes('sos')
  ) {
    return { toolsToCall: ['emergency_operations_summary'] };
  }

  // ── Drivers documents pending ─────────────────────────────────────────
  const hasDriverContext =
    q.includes('motorista') || q.includes('driver');

  const hasDocContext =
    q.includes('documento') ||
    q.includes('doc ') ||
    q.includes('docs ') ||
    q.includes('docs?') ||
    q.includes('documentação') ||
    q.includes('documentacao');

  const hasPendingContext =
    q.includes('pendente') ||
    q.includes('aprovação') ||
    q.includes('aprovacao') ||
    q.includes('aguardando');

  if (
    (hasDocContext && hasDriverContext) ||
    (hasDocContext && hasPendingContext) ||
    (hasDriverContext && hasPendingContext && hasDocContext) ||
    (hasDriverContext && (q.includes('aprovação') || q.includes('aprovacao') || q.includes('aguardando') || q.includes('cadastro')))
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

  // ── Daily briefing (resumo consolidado) ────────────────────────────────
  if (
    q.includes('atenção hoje') ||
    q.includes('atencao hoje') ||
    q.includes('minha atenção') ||
    q.includes('minha atencao') ||
    q.includes('resumo do dia') ||
    q.includes('briefing administrativo') ||
    q.includes('briefing') ||
    q.includes('precisa da minha')
  ) {
    return { toolsToCall: ['daily_briefing'] };
  }

  // ── Rides operations ──────────────────────────────────────────────────
  if (
    (q.includes('corridas') || q.includes('corrida')) &&
    (q.includes('semana') || q.includes('mês') || q.includes('mes') || q.includes('como est'))
  ) {
    return { toolsToCall: ['rides_operations'] };
  }

  // ── Finance accounting brief ──────────────────────────────────────────
  if (
    (q.includes('financeiro') || q.includes('financeira') || q.includes('financ')) &&
    (q.includes('como est') || q.includes('resumo') || q.includes('balanço') || q.includes('balanco'))
  ) {
    return { toolsToCall: ['finance_accounting_brief'] };
  }

  if (
    q.includes('contador') ||
    q.includes('contábil') ||
    q.includes('contabil') ||
    q.includes('pendências do contador') ||
    q.includes('pendencias do contador')
  ) {
    return { toolsToCall: ['finance_accounting_brief'] };
  }

  // ── CRM leads summary ─────────────────────────────────────────────────
  if (
    q.includes('lead') &&
    (q.includes('novo') || q.includes('sem contato') || q.includes('quanto') || q.includes('parado') || q.includes('funil'))
  ) {
    return { toolsToCall: ['crm_leads_summary'] };
  }

  // ── Inbox summary ─────────────────────────────────────────────────────
  if (
    (q.includes('e-mail') || q.includes('email') || q.includes('inbox') || q.includes('caixa de entrada')) &&
    (q.includes('chegaram') || q.includes('novos') || q.includes('novo') || q.includes('assunto') || q.includes('suspeito') || q.includes('quais'))
  ) {
    return { toolsToCall: ['inbox_summary'] };
  }

  // ── Company profile ────────────────────────────────────────────────────
  if (
    (q.includes('o que é a kaviar') || q.includes('o que e a kaviar')) ||
    (q.includes('o que') && q.includes('kaviar') && (q.includes('faz') || q.includes('é') || q.includes('e '))) ||
    q.includes('como funciona a kaviar') ||
    q.includes('para quem') && q.includes('kaviar') ||
    q.includes('como funcionam territórios') || q.includes('como funcionam territorios')
  ) {
    return { toolsToCall: ['company_profile'] };
  }

  if (
    q.includes('cnpj') ||
    q.includes('razão social') ||
    q.includes('razao social') ||
    q.includes('capital social') ||
    q.includes('natureza jurídica') ||
    q.includes('natureza juridica')
  ) {
    return { toolsToCall: ['company_profile'] };
  }

  if (
    (q.includes('sócio') || q.includes('socio') || q.includes('ceo') || q.includes('administrador')) &&
    (q.includes('kaviar') || q.includes('empresa') || q.includes('quem'))
  ) {
    return { toolsToCall: ['company_profile'] };
  }

  if (
    (q.includes('cnae') || q.includes('atividade econômica') || q.includes('atividade economica'))
  ) {
    return { toolsToCall: ['company_profile'] };
  }

  if (
    (q.includes('filial') || q.includes('filiais') || q.includes('matriz')) &&
    (q.includes('kaviar') || q.includes('empresa') || q.includes('tem') || q.includes('possui'))
  ) {
    return { toolsToCall: ['company_profile'] };
  }

  if (
    (q.includes('telefone') || q.includes('whatsapp') || q.includes('e-mail') || q.includes('email') || q.includes('site') || q.includes('onde fica')) &&
    (q.includes('institucional') || q.includes('kaviar') || q.includes('empresa') || q.includes('da kaviar'))
  ) {
    return { toolsToCall: ['company_profile'] };
  }

  if (
    (q.includes('quando') && (q.includes('aberta') || q.includes('abertura') || q.includes('fundada'))) &&
    (q.includes('kaviar') || q.includes('empresa'))
  ) {
    return { toolsToCall: ['company_profile'] };
  }

  if (
    q.includes('dados da empresa') ||
    q.includes('dados institucionais') ||
    q.includes('ficha da empresa') ||
    q.includes('ficha da kaviar')
  ) {
    return { toolsToCall: ['company_profile'] };
  }

  // ── Platform catalog ───────────────────────────────────────────────────
  if (
    q.includes('quais módulos') || q.includes('quais modulos') ||
    q.includes('quais serviços') || q.includes('quais servicos') ||
    q.includes('módulos existem') || q.includes('modulos existem') ||
    q.includes('o que a plataforma possui') ||
    q.includes('como funciona o kaviar pet') ||
    q.includes('o que é o premium tourism') || q.includes('o que e o premium tourism') ||
    q.includes('onde vejo as mensagens') ||
    q.includes('áreas financeiras existem') || q.includes('areas financeiras existem') ||
    (q.includes('módulo') || q.includes('modulo')) && (q.includes('existe') || q.includes('possui') || q.includes('tem'))
  ) {
    return { toolsToCall: ['platform_catalog'] };
  }

  // ── Annual incentive summary ──────────────────────────────────────────
  if (
    q.includes('gratificação anual') || q.includes('gratificacao anual') ||
    q.includes('bônus') || q.includes('bonus') ||
    q.includes('incentivo anual') ||
    (q.includes('bônus') || q.includes('bonus') || q.includes('gratificação') || q.includes('gratificacao')) &&
    (q.includes('motorista') || q.includes('pagar') || q.includes('acumulad') || q.includes('previsão') || q.includes('previsao') || q.includes('dezembro'))
  ) {
    return { toolsToCall: ['annual_incentive_summary'] };
  }

  // ── WhatsApp summary ──────────────────────────────────────────────────
  if (
    (q.includes('whatsapp') || q.includes('zap')) &&
    (q.includes('novo') || q.includes('não lid') || q.includes('nao lid') || q.includes('pendente') || q.includes('conversa') || q.includes('mensag'))
  ) {
    return { toolsToCall: ['whatsapp_summary'] };
  }

  // ── Driver pipeline summary ───────────────────────────────────────────
  if (
    (q.includes('pipeline') || q.includes('funil de motorista')) ||
    (q.includes('quantos motoristas') && (q.includes('total') || q.includes('temos') || q.includes('cadastr'))) ||
    (q.includes('motorista') && (q.includes('por status') || q.includes('por tipo') || q.includes('suspenso')))
  ) {
    return { toolsToCall: ['driver_pipeline_summary'] };
  }

  // ── Territory portfolio summary ───────────────────────────────────────
  if (
    (q.includes('portfólio') || q.includes('portfolio')) && q.includes('territór') ||
    q.includes('quantos territórios') || q.includes('quantos territorios') ||
    (q.includes('territórios') || q.includes('territorios')) && (q.includes('por status') || q.includes('panorama') || q.includes('resumo'))
  ) {
    return { toolsToCall: ['territory_portfolio_summary'] };
  }

  // ── Territorial onboarding ────────────────────────────────────────────
  const hasTerritoryContext =
    q.includes('cidade') ||
    q.includes('território') ||
    q.includes('territorio') ||
    q.includes('abrir') ||
    q.includes('pirassununga') || // exemplo comum
    q.includes('onboarding');

  const hasTerritoryAction =
    q.includes('abrir') ||
    q.includes('cadastrar') ||
    q.includes('gestor') ||
    q.includes('pronta') ||
    q.includes('prontidão') ||
    q.includes('readiness') ||
    q.includes('ativ');

  if (hasTerritoryContext && hasTerritoryAction) {
    return { toolsToCall: ['territory_onboarding_status', 'territory_activation_readiness'] };
  }

  if (hasTerritoryContext && (q.includes('status') || q.includes('exist') || q.includes('regulat'))) {
    return { toolsToCall: ['territory_onboarding_status'] };
  }

  // ── Driver ratings summary ─────────────────────────────────────────────
  if (
    (q.includes('avaliação') || q.includes('avaliacao') || q.includes('avaliações') || q.includes('avaliacoes') || q.includes('nota') || q.includes('estrela')) &&
    (q.includes('motorista') || q.includes('driver') || q.includes('baixa') || q.includes('atenção') || q.includes('atencao'))
  ) {
    return { toolsToCall: ['driver_ratings_summary'] };
  }

  if (
    q.includes('média do motorista') || q.includes('media do motorista') ||
    q.includes('notas baixas') ||
    q.includes('avaliações do motorista') || q.includes('avaliacoes do motorista')
  ) {
    return { toolsToCall: ['driver_ratings_summary'] };
  }

  // ── Compliance summary ─────────────────────────────────────────────────
  if (
    (q.includes('antecedente') || q.includes('certidão') || q.includes('certidao') || q.includes('certidões') || q.includes('certidoes') || q.includes('compliance')) &&
    (q.includes('venc') || q.includes('válid') || q.includes('valid') || q.includes('quantos') || q.includes('pendente'))
  ) {
    return { toolsToCall: ['compliance_summary'] };
  }

  // ── Excellence seal summary ───────────────────────────────────────────
  if (
    q.includes('selo excelência') || q.includes('selo excelencia') ||
    q.includes('excellence seal') ||
    (q.includes('selo') && (q.includes('motorista') || q.includes('quantos') || q.includes('ativo')))
  ) {
    return { toolsToCall: ['excellence_seal_summary'] };
  }

  // ── Knowledge answer (RAG) — catch-all for explanatory/institutional questions ──
  // Only matches questions that seem to ask "what is", "how does", "explain", "tell me about"
  if (
    q.includes('o que é') || q.includes('o que e') ||
    q.includes('como funciona') ||
    q.includes('explique') || q.includes('me explica') ||
    q.includes('o que significa') ||
    q.includes('qual a política') || q.includes('qual a politica') ||
    q.includes('como a kaviar') ||
    q.includes('o que o chat') ||
    q.includes('quais as regras') ||
    q.includes('como funciona o rag') ||
    q.includes('segurança do chat') || q.includes('seguranca do chat') ||
    q.includes('limites do chat')
  ) {
    return { toolsToCall: ['knowledge_answer'] };
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
  // Rules-first: deterministic rules always take precedence
  const rulesDecision = routeByRules(question);

  if (rulesDecision.toolsToCall.length > 0) {
    return rulesDecision;
  }

  // If no rule matched and mode is 'model', delegate to provider
  if (getRouterMode() === 'model') {
    return routeByModel(question, provider);
  }

  return rulesDecision;
}
