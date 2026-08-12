import type { KaviarAiToolName } from './kaviar-ai.types';
import type { KaviarAiToolDefinition } from './kaviar-ai.registry';

/**
 * Decisão do modelo sobre quais ferramentas utilizar.
 */
export interface KaviarAiModelDecision {
  /** Ferramentas que o modelo decidiu invocar. */
  toolsToCall: KaviarAiToolName[];
}

/**
 * Contexto fornecido ao provider para tomada de decisão.
 *
 * NUNCA deve conter: DATABASE_URL, JWT_SECRET, senhas, tokens,
 * credenciais, chaves privadas ou dados sensíveis de infraestrutura.
 */
export interface KaviarAiModelContext {
  /** Pergunta original do usuário */
  question: string;
  /** Ferramentas disponíveis (nome + descrição + schema) */
  availableTools: ReadonlyArray<
    Pick<KaviarAiToolDefinition, 'name' | 'description' | 'argSchema'>
  >;
}

/**
 * Interface abstrata para futuro provedor de modelo de linguagem.
 *
 * Responsabilidades:
 * - Receber pergunta + ferramentas disponíveis + contexto mínimo;
 * - Retornar decisão estruturada de quais ferramentas invocar;
 * - NÃO executar ferramentas (isso é responsabilidade do router);
 * - NÃO receber credenciais de banco, tokens ou dados sensíveis.
 *
 * Nenhum SDK externo é acoplado a esta interface.
 * Implementações futuras (OpenAI, Anthropic, Bedrock, etc.)
 * devem satisfazer este contrato.
 */
export interface KaviarAiModelProvider {
  /**
   * Solicita ao modelo uma decisão sobre quais ferramentas utilizar
   * para responder à pergunta do usuário.
   *
   * @throws se o provider não estiver disponível/configurado.
   */
  decide(context: KaviarAiModelContext): Promise<KaviarAiModelDecision>;
}
