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
    (hasDriverContext && hasPendingContext && hasDocContext)
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

  // ── Driver city landings ───────────────────────────────────────────────
  const hasDriverCityLandingContext =
    q.includes('landing') ||
    q.includes('landing page') ||
    ((q.includes('página') || q.includes('pagina')) &&
      q.includes('recrutamento')) ||
    ((q.includes('link') || q.includes('página') || q.includes('pagina')) &&
      q.includes('motorista') &&
      (q.includes('cidade') || q.includes('cadastrar') || q.includes('recrut')));

  const hasDriverCityLandingAction =
    hasDriverCityLandingContext &&
    (
      /\b(liberar|libere|habilitar|habilite|ativar|ative)\b/.test(q) ||
      q.includes('criar landing') ||
      q.includes('cadastrar landing')
    );

  if (hasDriverCityLandingAction) {
    return {
      toolsToCall: ['territory_onboarding_status', 'driver_city_landings'],
    };
  }

  if (hasDriverCityLandingContext) {
    return { toolsToCall: ['driver_city_landings'] };
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
  const hasTerritoriesPlural =
    q.includes('territórios') || q.includes('territorios');

  const asksWithoutManager =
    q.includes('gestor') &&
    (
      q.includes('sem gestor') ||
      q.includes('sem um gestor') ||
      q.includes('nenhum gestor') ||
      q.includes('não tem gestor') ||
      q.includes('nao tem gestor') ||
      q.includes('não têm gestor') ||
      q.includes('nao têm gestor')
    );

  if (hasTerritoriesPlural && asksWithoutManager) {
    return { toolsToCall: ['territory_portfolio_summary'] };
  }

  if (
    (q.includes('portfólio') || q.includes('portfolio')) && q.includes('territór') ||
    q.includes('quantos territórios') || q.includes('quantos territorios') ||
    hasTerritoriesPlural && (q.includes('por status') || q.includes('panorama') || q.includes('resumo'))
  ) {
    return { toolsToCall: ['territory_portfolio_summary'] };
  }

  // ── Territory manager coverage ───────────────────────────────────────
  const hasManagerCoverageCityUf =
    /(?:\/\s*[A-Za-z]{2}\b|[-–]\s+[A-Za-z]{2}\b|\(\s*[A-Za-z]{2}\s*\))/.test(question);

  const hasCoverageGovernanceIntent =
    hasManagerCoverageCityUf &&
    (q.includes('cobertura') || q.includes('cobertura territorial')) &&
    (
      q.includes('homolog') ||
      q.includes('revis') ||
      q.includes('completa') ||
      q.includes('complete') ||
      q.includes('reabr')
    );

  if (hasCoverageGovernanceIntent) {
    return { toolsToCall: ['territory_manager_coverage'] };
  }

  const hasManagerCoverageIntent =
    hasManagerCoverageCityUf &&
    (
      q.includes('gestor') ||
      q.includes('gestora') ||
      q.includes('gestores') ||
      q.includes('gestão') ||
      q.includes('gestao')
    ) &&
    (
      q.includes('tem gestor') ||
      q.includes('tem um gestor') ||
      q.includes('há gestor') ||
      q.includes('ha gestor') ||
      q.includes('existe gestor') ||
      q.includes('quem são') ||
      q.includes('quem sao') ||
      q.includes('quantos') ||
      q.includes('espaço') ||
      q.includes('espaco') ||
      q.includes('falt') ||
      q.includes('sem gestor') ||
      q.includes('cobertura') ||
      q.includes('como está') ||
      q.includes('como esta')
    );

  if (hasManagerCoverageIntent) {
    return { toolsToCall: ['territory_manager_coverage'] };
  }

  // ── City opening overview (consolidated view) ──────────────────────────
  // Routes when opening/activation intent is detected. City resolution (with or without /UF)
  // is handled by the service layer via resolveCityFromQuestion.
  {
    const hasCityUfPattern = /(?:\/\s*[A-Za-z]{2}\b|[-–]\s+[A-Za-z]{2}\b|\(\s*[A-Za-z]{2}\s*\))/.test(question);
    const hasOpeningIntent =
      (q.includes('como est') && (q.includes('para iniciar') || q.includes('para operar') || q.includes('para abrir') || q.includes('para ativar'))) ||
      (q.includes('pronta para operar') || q.includes('pronto para operar') || q.includes('pronta para ativar') || q.includes('pronto para ativar')) ||
      (q.includes('o que falta') && (q.includes('abrir') || q.includes('operar') || q.includes('iniciar') || q.includes('ativar'))) ||
      (q.includes('podemos ativar') || q.includes('podemos abrir') || q.includes('podemos iniciar') || q.includes('podemos operar')) ||
      ((q.includes('quais pendências') || q.includes('quais pendencias')) && (q.includes('iniciar') || q.includes('operar') || q.includes('abrir') || q.includes('ativar'))) ||
      ((q.includes('visão operacional') || q.includes('visao operacional')) && hasCityUfPattern) ||
      (q.includes('abertura') && (q.includes('cidade') || hasCityUfPattern)) ||
      (q.includes('precisamos') && (q.includes('para iniciar') || q.includes('para operar') || q.includes('para abrir')));

    if (hasOpeningIntent) {
      return { toolsToCall: ['city_opening_overview'] };
    }
  }

  // Territory conceptual knowledge — explanatory questions use RAG
  const isTerritoryConceptualQuestion =
    !/(?:\/\s*[A-Za-z]{2}\b|[-–]\s+[A-Za-z]{2}\b|\(\s*[A-Za-z]{2}\s*\))/.test(question) &&
    (q.includes('território') || q.includes('territorio') || q.includes('territórios') || q.includes('territorios')) &&
    (q.includes('qual é a diferença') || q.includes('qual e a diferença') || q.includes('qual a diferença') || q.includes('qual a diferenca') ||
     q.includes('explique') || q.includes('me explica') || q.includes('como funciona') || q.includes('o que significa') ||
     q.includes('segundo o conhecimento interno'));

  if (isTerritoryConceptualQuestion) {
    return { toolsToCall: ['knowledge_answer'] };
  }

  // ── Territorial onboarding ────────────────────────────────────────────
  const hasExplicitCityUf =
    /(?:\/\s*[A-Za-z]{2}\b|[-–]\s+[A-Za-z]{2}\b|\(\s*[A-Za-z]{2}\s*\))/.test(question);

  const hasTerritoryContext =
    hasExplicitCityUf ||
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

  // ── Named driver detail (BEFORE ratings — catches "motorista <Name>") ────
  {
    const namedDriverMatch = question.match(/(?:do|da) motorista\s+([A-Z][a-záàâãéèêíïóôõúç]+(?:\s+[A-Za-záàâãéèêíïóôõúç]+)*)/i);
    if (namedDriverMatch && namedDriverMatch[1].length >= 3) {
      return { toolsToCall: ['person_lookup'] };
    }
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

  // ── Seal history (must be before excellence_seal_summary) ──────────────
  if (
    (q.includes('histórico') || q.includes('historico')) && q.includes('selo')
  ) {
    return { toolsToCall: ['seal_history'] };
  }

  // ── Excellence seal summary ───────────────────────────────────────────
  if (
    q.includes('selo excelência') || q.includes('selo excelencia') ||
    q.includes('excellence seal') ||
    (q.includes('selo') && (q.includes('motorista') || q.includes('quantos') || q.includes('ativo')))
  ) {
    return { toolsToCall: ['excellence_seal_summary'] };
  }

  // ── Operations overview ────────────────────────────────────────────────
  if (
    q.includes('visão geral') || q.includes('visao geral') ||
    q.includes('panorama operacional') ||
    (q.includes('quantos motoristas') && !q.includes('avaliação') && !q.includes('nota') && !q.includes('ativo') && !q.includes('pendente') && !q.includes('suspenso')) ||
    q.includes('quantos gestores') || q.includes('quantos admins') ||
    q.includes('homologações pet') || q.includes('homologacoes pet')
  ) {
    return { toolsToCall: ['operations_overview'] };
  }

  // ── Person lookup / driver detail by name ───────────────────────────────
  // Only fires when a proper name (capitalized word after "motorista") is detected
  if (
    q.includes('quem é') || q.includes('quem e') ||
    q.includes('mostre o motorista') || q.includes('buscar motorista') ||
    q.includes('encontre') || q.includes('procure') ||
    (q.includes('motorista') && q.includes('nome'))
  ) {
    return { toolsToCall: ['person_lookup'] };
  }

  // Named driver detail: "média/compliance/selo DO MOTORISTA <Name>"
  if (
    (q.includes('do motorista ') || q.includes('da motorista ')) &&
    (q.includes('média') || q.includes('media') || q.includes('compliance') || q.includes('selo') || q.includes('detalhe') || q.includes('situação') || q.includes('situacao'))
  ) {
    return { toolsToCall: ['person_lookup'] };
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
