import api from '../api';

const AI_BASE_PATH = '/api/admin/ai';

/**
 * Envia uma pergunta para a KAVIAR IA.
 * Somente leitura — não cria, altera ou exclui dados.
 *
 * @param {string} question - Pergunta do administrador (max 1000 chars)
 * @returns {Promise<{ answer: string, toolsUsed: string[] }>}
 */
export async function askKaviarAi(question) {
  const response = await api.post(`${AI_BASE_PATH}/chat`, { question });

  if (!response.data?.success) {
    const msg = response.data?.error || 'Erro desconhecido da KAVIAR IA.';
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  return {
    answer: response.data.answer,
    toolsUsed: response.data.toolsUsed || [],
  };
}

/**
 * Mapeia nomes técnicos de tools para nomes amigáveis.
 */
const TOOL_FRIENDLY_NAMES = {
  rides_summary_today: 'Corridas de hoje',
  drivers_documents_pending: 'Documentos de motoristas',
  finance_due_obligations: 'Obrigações financeiras',
};

/**
 * Converte array de toolsUsed para nomes amigáveis.
 * @param {string[]} tools
 * @returns {string[]}
 */
export function getToolFriendlyNames(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => TOOL_FRIENDLY_NAMES[t] || t);
}
