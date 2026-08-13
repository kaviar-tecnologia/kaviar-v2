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

  // Garantia determinística: itens não confirmados impedem confidence CONFIRMED
  if (Array.isArray(parsed.unconfirmedItems) && parsed.unconfirmedItems.length > 0) {
    parsed.confidence = 'NEEDS_HUMAN_REVIEW';
  }

  return parsed;
}
