import OpenAI from 'openai';

export interface RegulatorySource {
  title: string;
  url: string;
  orgao: string;
}

export interface RegulatorySearchResult {
  summary: string;
  requirements: string[];
  officialSources: RegulatorySource[];
  unconfirmedItems: string[];
  recommendedNextSteps: string[];
  confidence: 'CONFIRMED' | 'NEEDS_HUMAN_REVIEW';
}

const REGULATORY_INSTRUCTIONS = `Você é um pesquisador regulatório da KAVIAR, plataforma de mobilidade urbana comunitária do Rio de Janeiro.

Sua tarefa: pesquisar as exigências regulatórias VIGENTES para operação de transporte por aplicativo (tipo Uber/99) na cidade informada.

REGRAS DE VIGÊNCIA TEMPORAL:
- Antes de afirmar que uma exigência está em vigor, verifique se a norma NÃO foi revogada, alterada ou substituída por legislação posterior.
- Pesquise alterações, revogações e legislação superveniente relevante.
- Se uma lei foi modificada ou revogada (total ou parcialmente), NÃO apresente a redação antiga como obrigação atual.
- Se houver conflito entre normas, mudança legislativa recente ou dúvida sobre vigência, coloque o item em unconfirmedItems com explicação clara.
- Exemplo: DPVAT foi substituído por SPVAT (LC 207/2024) e depois o SPVAT foi revogado (LC 211/2024). Não afirme que DPVAT é exigência atual sem verificar o regime vigente.

REGRAS DE RECONCILIAÇÃO NORMATIVA (OBRIGATÓRIAS):
1. Ao encontrar conflito entre uma norma antiga e uma fonte oficial atual do órgão competente (ex: página operacional, orientação da autarquia, decreto regulamentador posterior), identifique EXPLICITAMENTE o conflito, citando a fonte antiga e a fonte mais recente que gera ou resolve o conflito.
2. Dentro da mesma execução de pesquisa, busque ativamente alterações, revogações, regulamentações e atos normativos posteriores relacionados à norma original.
3. Priorize a situação jurídica e operacional ATUALMENTE VIGENTE, desde que sustentada por fonte oficial do órgão competente.
4. NUNCA apresente requisito de norma histórica como vigente (em "requirements") sem confirmação em fonte oficial atual ou em norma cuja vigência tenha sido expressamente reconciliada com atos posteriores.
5. Requisitos conflitantes ou cuja vigência não foi confirmada por fonte atual DEVEM ir para "unconfirmedItems" — NUNCA na lista "requirements".
6. Use "NEEDS_HUMAN_REVIEW" quando o conflito entre norma antiga e orientação atual não puder ser reconciliado com segurança.
7. No campo unconfirmedItems, informe claramente: (a) qual fonte antiga contém a exigência, (b) qual fonte oficial mais recente gera ou resolve o conflito, e (c) por que a vigência não pode ser confirmada.
8. Não considere apenas a data da fonte. Observe hierarquia normativa (lei > decreto > portaria > orientação), alterações expressas, revogações e competência do órgão emissor. Uma página operacional atual do órgão competente NÃO revoga uma lei por si só, mas DEVE gerar conflito e IMPEDIR que a exigência antiga seja tratada como vigente sem confirmação adicional.
9. Preferir fontes primárias oficiais: legislação municipal consolidada, atos alteradores, Diário Oficial e orientação do órgão municipal competente (autarquia, secretaria).
10. NÃO invente revogação, alteração ou conclusão jurídica. Se não encontrar ato posterior expresso que resolva o conflito, mantenha o item em unconfirmedItems.

Foque SOMENTE em fontes oficiais:
- Prefeitura
- Câmara Municipal
- Diário Oficial do município
- Secretaria municipal de transportes
- Autarquia municipal de transporte (ex: EMDEC, SPTrans, SMTR)
- DETRAN estadual
- Governo estadual
- gov.br

Retorne um JSON com:
- summary: resumo curto (1-2 frases)
- requirements: lista SOMENTE de exigências confirmadamente vigentes, sustentadas por fonte oficial atual e sem conflito normativo pendente
- officialSources: lista de {title, url, orgao} das fontes oficiais encontradas
- unconfirmedItems: itens com dúvida de vigência, conflito legislativo ou sem confirmação oficial. Cada item deve explicar o conflito (norma antiga vs. fonte atual) quando aplicável.
- recommendedNextSteps: próximos passos recomendados
- confidence: "CONFIRMED" se houver fonte oficial suficiente E todas as exigências estiverem confirmadamente vigentes E não houver conflito normativo pendente, "NEEDS_HUMAN_REVIEW" caso contrário

Se NÃO encontrar legislação específica vigente, retorne confidence: "NEEDS_HUMAN_REVIEW".
Se houver qualquer dúvida sobre vigência de norma, retorne confidence: "NEEDS_HUMAN_REVIEW".
Se houver conflito entre norma antiga e orientação oficial atual do órgão competente e o conflito NÃO puder ser reconciliado com segurança (isto é, não houver ato posterior oficial, competente e de hierarquia adequada que resolva expressamente a divergência), retorne confidence: "NEEDS_HUMAN_REVIEW". Se um ato posterior competente resolver expressamente o conflito e todas as exigências vigentes estiverem confirmadas, confidence pode ser "CONFIRMED".
Nunca afirme que uma cidade está liberada ou que uma exigência está em vigor sem fonte oficial atual.`;

const RESULT_SCHEMA = {
  name: 'regulatory_search_result',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string' as const },
      requirements: { type: 'array' as const, items: { type: 'string' as const } },
      officialSources: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            title: { type: 'string' as const },
            url: { type: 'string' as const },
            orgao: { type: 'string' as const },
          },
          required: ['title', 'url', 'orgao'] as const,
          additionalProperties: false,
        },
      },
      unconfirmedItems: { type: 'array' as const, items: { type: 'string' as const } },
      recommendedNextSteps: { type: 'array' as const, items: { type: 'string' as const } },
      confidence: { type: 'string' as const, enum: ['CONFIRMED', 'NEEDS_HUMAN_REVIEW'] },
    },
    required: ['summary', 'requirements', 'officialSources', 'unconfirmedItems', 'recommendedNextSteps', 'confidence'] as const,
    additionalProperties: false,
  },
};

/**
 * Pesquisa regulatória isolada usando Responses API + web_search.
 * Chamada SEPARADA do roteador principal — somente para fluxo territorial.
 * Não recebe credenciais, JWT, DATABASE_URL ou dados sensíveis.
 */
export async function searchRegulatoryRequirements(
  city: string,
  uf: string
): Promise<RegulatorySearchResult> {
  const result = await startRegulatorySearch(city, uf);
  // Legacy sync path — kept for compatibility but now uses background internally
  const retrieved = await retrieveRegulatorySearch(result.responseId);
  if (retrieved.status !== 'completed' || !retrieved.result) {
    const err: any = new Error(`[regulatory-search] Pesquisa não concluída: ${retrieved.status}`);
    err.regulatoryCode = 'PROVIDER_ERROR';
    throw err;
  }
  return retrieved.result;
}

export interface RegulatorySearchStartResult {
  responseId: string;
  status: string;
}

export interface RegulatorySearchRetrieveResult {
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'incomplete' | 'cancelled';
  result: RegulatorySearchResult | null;
}

/**
 * Inicia pesquisa regulatória em background via OpenAI Responses API.
 * Retorna responseId para polling.
 */
export async function startRegulatorySearch(
  city: string,
  uf: string
): Promise<RegulatorySearchStartResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('[regulatory-search] OPENAI_API_KEY não configurada.');
  }

  const normalizedCity = city.trim();
  const normalizedUf = uf.trim().toUpperCase();

  if (!normalizedCity || !normalizedUf || normalizedUf.length !== 2) {
    throw new Error('[regulatory-search] Cidade ou UF inválida.');
  }

  const client = new OpenAI({
    apiKey,
    timeout: 50_000,
    maxRetries: 0,
  });

  const model = process.env.KAVIAR_AI_MODEL || 'gpt-5.4-mini';

  const userInput = `Pesquise as exigências regulatórias para operação de transporte por aplicativo na cidade de ${normalizedCity}/${normalizedUf}, Brasil.

Contexto: A KAVIAR é uma plataforma de mobilidade urbana comunitária que opera com motoristas cadastrados usando aplicativo. Preciso saber se a cidade exige credenciamento, alvará, taxa municipal, seguro específico ou qualquer regulamentação para empresas de tecnologia de transporte (ETCs / OTTCs).`;

  const response = await client.responses.create({
    model,
    instructions: REGULATORY_INSTRUCTIONS,
    input: userInput,
    tools: [{ type: 'web_search' as const, search_context_size: 'low' as const }],
    text: {
      format: {
        type: 'json_schema',
        ...RESULT_SCHEMA,
      },
    },
    reasoning: {
      effort: 'low',
    },
    max_output_tokens: 4096,
    store: false,
    background: true,
  } as any);

  return {
    responseId: response.id,
    status: response.status || 'queued',
  };
}

/**
 * Consulta o status de uma pesquisa regulatória em background.
 */
export async function retrieveRegulatorySearch(
  responseId: string
): Promise<RegulatorySearchRetrieveResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('[regulatory-search] OPENAI_API_KEY não configurada.');
  }

  const client = new OpenAI({
    apiKey,
    timeout: 15_000,
    maxRetries: 0,
  });

  const response = await client.responses.retrieve(responseId);

  const status = response.status as RegulatorySearchRetrieveResult['status'];

  if (status === 'queued' || status === 'in_progress') {
    return { status, result: null };
  }

  if (status === 'failed') {
    const providerError = (response as any).error;
    const providerCode =
      typeof providerError?.code === 'string'
        ? providerError.code
        : 'unknown';
    const providerMessage =
      typeof providerError?.message === 'string'
        ? providerError.message.slice(0, 500)
        : 'sem mensagem do provedor';

    console.error(
      `[REGULATORY_SEARCH_PROVIDER_FAILED] responseId=${responseId} code=${providerCode} message=${providerMessage}`
    );

    const err: any = new Error(
      `[regulatory-search] Modelo falhou ao gerar resposta. code=${providerCode}`
    );
    err.regulatoryCode = 'PROVIDER_ERROR';
    throw err;
  }

  if (status === 'incomplete') {
    const reason = (response as any).incomplete_details?.reason ?? 'unknown';
    const err: any = new Error(`[regulatory-search] Resposta incompleta do modelo: ${reason}.`);
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  if (status === 'cancelled') {
    const err: any = new Error('[regulatory-search] Pesquisa cancelada.');
    err.regulatoryCode = 'PROVIDER_ERROR';
    throw err;
  }

  // completed
  const outputText = (response as any).output_text;
  if (!outputText) {
    const err: any = new Error('[regulatory-search] Resposta vazia do modelo.');
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  let rawParsed: unknown;
  try {
    rawParsed = JSON.parse(outputText);
  } catch {
    const err: any = new Error('[regulatory-search] Resposta do modelo não é JSON válido.');
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  let parsed: RegulatorySearchResult = validateRegulatoryResult(rawParsed);

  // Validação básica runtime
  if (!parsed.confidence || !['CONFIRMED', 'NEEDS_HUMAN_REVIEW'].includes(parsed.confidence)) {
    parsed.confidence = 'NEEDS_HUMAN_REVIEW';
  }

  // Filtrar somente fontes oficiais
  const GOV_DOMAINS = ['.gov.br', '.leg.br', '.jus.br'];
  if (Array.isArray(parsed.officialSources)) {
    parsed.officialSources = parsed.officialSources.filter((s) => {
      try {
        const url = new URL(s.url);
        return GOV_DOMAINS.some(d => url.hostname.endsWith(d));
      } catch {
        return false;
      }
    });
  }

  if (!parsed.officialSources || parsed.officialSources.length === 0) {
    parsed.confidence = 'NEEDS_HUMAN_REVIEW';
  }

  if (Array.isArray(parsed.unconfirmedItems) && parsed.unconfirmedItems.length > 0) {
    parsed.confidence = 'NEEDS_HUMAN_REVIEW';
  }

  return { status: 'completed', result: parsed };
}

// ── Error classification ──────────────────────────────────────────────────────

export interface RegulatorySearchErrorClassification {
  httpStatus: number;
  code: string;
  publicMessage: string;
}

export function classifyRegulatorySearchError(error: unknown): RegulatorySearchErrorClassification {
  const err = error as any;
  const name = err?.name || '';
  const status = err?.status;
  const code = err?.code || '';
  const message = ((err?.message || '') as string).toLowerCase();
  const regulatoryCode = err?.regulatoryCode;

  // Timeout
  if (name === 'APIConnectionTimeoutError' || code === 'ETIMEDOUT' || code === 'ECONNABORTED' || message.includes('timed out') || message.includes('timeout')) {
    return { httpStatus: 504, code: 'REGULATORY_SEARCH_TIMEOUT', publicMessage: 'A pesquisa regulatória demorou mais que o esperado. Tente novamente.' };
  }

  // Rate limit
  if (status === 429) {
    return { httpStatus: 429, code: 'REGULATORY_SEARCH_RATE_LIMITED', publicMessage: 'Limite de requisições atingido. Aguarde alguns minutos e tente novamente.' };
  }

  // Invalid response (incomplete, empty, malformed JSON)
  if (regulatoryCode === 'INVALID_RESPONSE') {
    return { httpStatus: 502, code: 'REGULATORY_SEARCH_INVALID_RESPONSE', publicMessage: 'A pesquisa regulatória recebeu uma resposta inválida. Tente novamente.' };
  }

  // Provider error (model failed, upstream 5xx)
  if (regulatoryCode === 'PROVIDER_ERROR' || status >= 500 || name === 'APIError') {
    return { httpStatus: 502, code: 'REGULATORY_SEARCH_PROVIDER_ERROR', publicMessage: 'O provedor da pesquisa regulatória retornou um erro. Tente novamente.' };
  }

  // Fallback
  return { httpStatus: 500, code: 'REGULATORY_SEARCH_INTERNAL_ERROR', publicMessage: 'Não foi possível realizar a pesquisa regulatória.' };
}

// ── Runtime validation of parsed response ─────────────────────────────────────

export function validateRegulatoryResult(parsed: unknown): RegulatorySearchResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const err: any = new Error('[regulatory-search] Resultado não é um objeto válido.');
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.summary !== 'string') {
    const err: any = new Error('[regulatory-search] Campo summary ausente ou inválido.');
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  if (!Array.isArray(obj.requirements) || !obj.requirements.every((r: unknown) => typeof r === 'string')) {
    const err: any = new Error('[regulatory-search] Campo requirements inválido.');
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  if (!Array.isArray(obj.officialSources)) {
    const err: any = new Error('[regulatory-search] Campo officialSources inválido.');
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  for (const src of obj.officialSources as any[]) {
    if (!src || typeof src.title !== 'string' || typeof src.url !== 'string' || typeof src.orgao !== 'string') {
      const err: any = new Error('[regulatory-search] Fonte oficial com formato inválido.');
      err.regulatoryCode = 'INVALID_RESPONSE';
      throw err;
    }
  }

  if (!Array.isArray(obj.unconfirmedItems) || !obj.unconfirmedItems.every((i: unknown) => typeof i === 'string')) {
    const err: any = new Error('[regulatory-search] Campo unconfirmedItems inválido.');
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  if (!Array.isArray(obj.recommendedNextSteps) || !obj.recommendedNextSteps.every((s: unknown) => typeof s === 'string')) {
    const err: any = new Error('[regulatory-search] Campo recommendedNextSteps inválido.');
    err.regulatoryCode = 'INVALID_RESPONSE';
    throw err;
  }

  return obj as unknown as RegulatorySearchResult;
}
