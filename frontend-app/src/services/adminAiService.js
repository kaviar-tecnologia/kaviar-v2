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
    developmentProposal: response.data.developmentProposal || null,
  };
}

// ── Development Jobs API ─────────────────────────────────────────────────────

/**
 * Lista development jobs ativos.
 * @returns {Promise<Array>}
 */
export async function listDevJobs() {
  const response = await api.get(`${AI_BASE_PATH}/dev-jobs`);
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Erro ao listar dev jobs.');
  }
  return response.data.data;
}

/**
 * Busca detalhes de um development job.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getDevJob(id) {
  const response = await api.get(`${AI_BASE_PATH}/dev-jobs/${id}`);
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Erro ao buscar dev job.');
  }
  return response.data.data;
}

/**
 * Confirma execução de um development job em AWAITING_CONFIRMATION.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function confirmDevJob(id) {
  const response = await api.post(`${AI_BASE_PATH}/dev-jobs/${id}/confirm`, {
    confirmation: 'CONFIRMAR_EXECUCAO',
  });
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Erro ao confirmar dev job.');
  }
  return response.data.data;
}

/**
 * Confirma execução de um job de desenvolvimento.
 *
 * @param {string} jobId
 */
export async function confirmDevelopmentJob(jobId) {
  const response = await api.post(`${AI_BASE_PATH}/dev-jobs/${jobId}/confirm`);

  if (!response.data?.success) {
    const msg = response.data?.error || 'Erro ao confirmar job de desenvolvimento.';
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  return response.data.data;
}

/**
 * Mapeia nomes técnicos de tools para nomes amigáveis.
 */
const TOOL_FRIENDLY_NAMES = {
  rides_summary_today: 'Corridas de hoje',
  drivers_documents_pending: 'Documentos de motoristas',
  finance_due_obligations: 'Obrigações financeiras',
  territory_onboarding_status: 'Status territorial',
  territory_manager_coverage: 'Cobertura de gestores',
  territory_activation_readiness: 'Prontidão de ativação',
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
