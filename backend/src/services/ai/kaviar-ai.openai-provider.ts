import OpenAI from 'openai';
import type {
  KaviarAiModelProvider,
  KaviarAiModelContext,
  KaviarAiModelDecision,
  KaviarAiDraftingComposer,
  KaviarAiDraftingContext,
} from './kaviar-ai.provider';

/**
 * Configuração do provider OpenAI.
 */
export interface OpenAiProviderConfig {
  /** Modelo a utilizar. Padrão: gpt-5.4-mini */
  model?: string;
  /** Limite de tokens de saída. Padrão: 256 (suficiente para decisão estruturada) */
  maxOutputTokens?: number;
  /** Esforço de raciocínio: 'low' | 'medium' | 'high'. Padrão: 'low' */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Timeout em milissegundos. Padrão: 15000 (15s) */
  timeoutMs?: number;
  /** Máximo de retries automáticos. Padrão: 1 */
  maxRetries?: number;
}

const DEFAULT_MODEL = 'gpt-5.4-mini';
const DEFAULT_MAX_OUTPUT_TOKENS = 256;
const DEFAULT_REASONING_EFFORT = 'low' as const;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;

/**
 * System instructions — instrui o modelo a SOMENTE decidir quais ferramentas usar.
 *
 * O modelo NÃO executa SQL, NÃO formata valores, NÃO inventa ações.
 * Apenas retorna um JSON com toolsToCall.
 */
const INSTRUCTIONS = `Você é o roteador interno da KAVIAR IA.

Sua ÚNICA responsabilidade é decidir quais ferramentas devem ser chamadas para responder à pergunta do usuário.

Regras:
- Retorne SOMENTE um JSON com o campo "toolsToCall" contendo os nomes das ferramentas a executar.
- Use APENAS ferramentas listadas em "available_tools". Nunca invente nomes.
- Se nenhuma ferramenta for adequada, retorne "toolsToCall": [].
- Não execute SQL. Não formate valores. Não invente dados.
- Nunca inclua explicações, comentários ou texto fora do JSON.`;

/**
 * JSON Schema para structured output — força resposta validável.
 */
const DECISION_JSON_SCHEMA = {
  name: 'kaviar_ai_decision',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      toolsToCall: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'Nomes das ferramentas a executar. Usar apenas nomes presentes em available_tools.',
      },
    },
    required: ['toolsToCall'] as const,
    additionalProperties: false,
  },
};

/**
 * Implementação do KaviarAiModelProvider usando a Responses API do OpenAI SDK.
 *
 * Responsável APENAS pela decisão de roteamento.
 * Nunca recebe DATABASE_URL, JWT, senhas, tokens ou credenciais.
 * Nunca executa ferramentas diretamente.
 *
 * Limites de segurança:
 * - Uma decisão por pergunta (sem loops);
 * - Sem web search, file search, computer use ou code interpreter;
 * - Timeout curto (15s);
 * - No máximo 1 retry automático;
 * - Saída limitada a 256 tokens.
 */
export class OpenAiProvider implements KaviarAiModelProvider, KaviarAiDraftingComposer {
  private client: OpenAI;
  private model: string;
  private maxOutputTokens: number;
  private reasoningEffort: 'low' | 'medium' | 'high';

  constructor(config?: OpenAiProviderConfig) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        '[kaviar-ai-openai] OPENAI_API_KEY não configurada. ' +
          'Defina a variável de ambiente ou use KAVIAR_AI_ROUTER_MODE=rules.'
      );
    }

    this.client = new OpenAI({
      apiKey,
      timeout: config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: config?.maxRetries ?? DEFAULT_MAX_RETRIES,
    });
    this.model = config?.model ?? process.env.KAVIAR_AI_MODEL ?? DEFAULT_MODEL;
    this.maxOutputTokens = config?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.reasoningEffort = config?.reasoningEffort ?? DEFAULT_REASONING_EFFORT;
  }

  async decide(context: KaviarAiModelContext): Promise<KaviarAiModelDecision> {
    const toolsList = context.availableTools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');

    const userInput = `Pergunta do usuário: "${context.question}"

Ferramentas disponíveis (available_tools):
${toolsList}

Decida quais ferramentas devem ser chamadas.`;

    const response = await this.client.responses.create({
      model: this.model,
      instructions: INSTRUCTIONS,
      input: userInput,
      text: {
        format: {
          type: 'json_schema',
          ...DECISION_JSON_SCHEMA,
        },
      },
      reasoning: {
        effort: this.reasoningEffort,
      },
      max_output_tokens: this.maxOutputTokens,
      store: false,
    });

    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason ?? 'unknown';
      throw new Error(
        `[kaviar-ai-openai] Resposta incompleta do modelo (reason: ${reason}). Decisão inválida.`
      );
    }

    if (response.status === 'failed') {
      throw new Error(
        '[kaviar-ai-openai] O modelo falhou ao gerar resposta. Decisão inválida.'
      );
    }

    const outputText = response.output_text;

    if (!outputText) {
      throw new Error(
        '[kaviar-ai-openai] Resposta vazia do modelo. Nenhuma decisão disponível.'
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error(
        '[kaviar-ai-openai] Resposta do modelo não é JSON válido. Decisão inválida.'
      );
    }

    // A validação runtime completa é feita pelo router (validateModelDecision).
    // Aqui retornamos o parsed diretamente — o router garante fail-closed.
    return parsed as KaviarAiModelDecision;
  }

  // ── Drafting Composer ───────────────────────────────────────────────────

  async compose(context: KaviarAiDraftingContext): Promise<string> {
    const instructions = `Você é o redator interno da KAVIAR — plataforma brasileira de mobilidade comunitária.

Sua ÚNICA responsabilidade é redigir o texto solicitado pelo usuário usando os dados factuais fornecidos.

Regras:
- Redija o texto no formato solicitado (ofício, e-mail, comunicado, carta, notificação, relatório).
- A data atual é ${context.currentDate}. Use-a quando o documento exigir data; não coloque [COMPLETAR] para data.
- Aproveite todas as informações explicitamente presentes no pedido do usuário (município, órgão, destinatário, assunto, nome, etc.).
- Use dados factuais do contexto fornecido (CNPJ, razão social, endereço, etc.) quando disponíveis.
- Nunca invente dados ausentes: município, autoridade, cargo, signatário, número de ofício, protocolo ou qualquer outro dado não fornecido.
- Não escolha signatário automaticamente a partir do QSA/governança. Signatário ausente deve ser [COMPLETAR].
- [COMPLETAR] deve aparecer SOMENTE para informação necessária que realmente não esteja disponível nem no pedido nem no contexto factual.
- Formate em Markdown bem formado: use ## para títulos, **negrito** para ênfase. Evite cabeçalhos malformados como *OFÍCIO...**.
- O texto é um RASCUNHO para revisão humana. Finalize com: "---\\nRascunho gerado pela KAVIAR IA. Revisar antes de uso."
- Não envie e-mail, não crie registro, não altere banco, não execute NENHUMA ação.
- Não inclua dados sensíveis (CPF, senha, token, credencial).
- Responda em português brasileiro formal.`;

    const userInput = `Pedido do usuário: "${context.question}"

Tipo de documento: ${context.documentType}

Data atual: ${context.currentDate}

Dados factuais disponíveis:
${context.factualContext || '(nenhum dado factual adicional disponível)'}

Redija o texto solicitado.`;

    const response = await this.client.responses.create({
      model: this.model,
      instructions,
      input: userInput,
      reasoning: {
        effort: 'medium',
      },
      max_output_tokens: 2048,
      store: false,
    });

    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason ?? 'unknown';
      throw new Error(
        `[kaviar-ai-openai] Composição incompleta (reason: ${reason}).`
      );
    }

    if (response.status === 'failed') {
      throw new Error(
        '[kaviar-ai-openai] O modelo falhou ao gerar a composição.'
      );
    }

    const outputText = response.output_text;

    if (!outputText) {
      throw new Error(
        '[kaviar-ai-openai] Resposta vazia do modelo. Nenhuma composição disponível.'
      );
    }

    return outputText;
  }
}

/**
 * Cria o provider OpenAI se a configuração estiver disponível.
 * Retorna undefined se OPENAI_API_KEY não estiver definida.
 *
 * Não lança erro — a falha controlada é responsabilidade do router
 * quando o modo é 'model' mas o provider é undefined.
 */
export function createOpenAiProviderIfConfigured(
  config?: OpenAiProviderConfig
): OpenAiProvider | undefined {
  if (!process.env.OPENAI_API_KEY) {
    return undefined;
  }
  return new OpenAiProvider(config);
}
