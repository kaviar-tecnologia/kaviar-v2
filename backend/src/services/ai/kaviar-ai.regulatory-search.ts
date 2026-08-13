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

Foque SOMENTE em fontes oficiais:
- Prefeitura
- Câmara Municipal
- Diário Oficial do município
- Secretaria municipal de transportes
- DETRAN estadual
- Governo estadual
- gov.br

Retorne um JSON com:
- summary: resumo curto (1-2 frases)
- requirements: lista SOMENTE de exigências confirmadamente vigentes
- officialSources: lista de {title, url, orgao} das fontes oficiais encontradas
- unconfirmedItems: itens com dúvida de vigência, conflito legislativo ou sem confirmação oficial
- recommendedNextSteps: próximos passos recomendados
- confidence: "CONFIRMED" se houver fonte oficial suficiente E todas as exigências estiverem confirmadamente vigentes, "NEEDS_HUMAN_REVIEW" caso contrário

Se NÃO encontrar legislação específica vigente, retorne confidence: "NEEDS_HUMAN_REVIEW".
Se houver qualquer dúvida sobre vigência de norma, retorne confidence: "NEEDS_HUMAN_REVIEW".
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
    timeout: 90_000,
    maxRetries: 1,
  });

  const model = process.env.KAVIAR_AI_MODEL || 'gpt-5.4-mini';

  const userInput = `Pesquise as exigências regulatórias para operação de transporte por aplicativo na cidade de ${normalizedCity}/${normalizedUf}, Brasil.

Contexto: A KAVIAR é uma plataforma de mobilidade urbana comunitária que opera com motoristas cadastrados usando aplicativo. Preciso saber se a cidade exige credenciamento, alvará, taxa municipal, seguro específico ou qualquer regulamentação para empresas de tecnologia de transporte (ETCs / OTTCs).`;

  const response = await client.responses.create({
    model,
    instructions: REGULATORY_INSTRUCTIONS,
    input: userInput,
    tools: [{ type: 'web_search' as any }],
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
  });

  if (response.status === 'failed') {
    throw new Error('[regulatory-search] Modelo falhou ao gerar resposta.');
  }

  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason ?? 'unknown';
    throw new Error(
      `[regulatory-search] Resposta incompleta do modelo: ${reason}.`
    );
  }

  const outputText = response.output_text;
  if (!outputText) {
    throw new Error('[regulatory-search] Resposta vazia do modelo.');
  }

  let parsed: RegulatorySearchResult;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error('[regulatory-search] Resposta do modelo não é JSON válido.');
  }

  // Validação básica runtime
  if (!parsed.confidence || !['CONFIRMED', 'NEEDS_HUMAN_REVIEW'].includes(parsed.confidence)) {
    parsed.confidence = 'NEEDS_HUMAN_REVIEW';
  }

  // Filtrar somente fontes oficiais (*.gov.br, *.leg.br, *.jus.br)
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

  // Se não restar nenhuma fonte oficial, forçar NEEDS_HUMAN_REVIEW
  if (!parsed.officialSources || parsed.officialSources.length === 0) {
    parsed.confidence = 'NEEDS_HUMAN_REVIEW';
  }

  return parsed;
}
