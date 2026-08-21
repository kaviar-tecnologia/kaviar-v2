import api from '../api';

const AI_BASE_PATH = '/api/admin/ai';

/**
 * Envia uma pergunta para a KAVIAR IA.
 * Somente leitura — não cria, altera ou exclui dados.
 *
 * @param {string} question - Pergunta do administrador (max 1000 chars)
 * @param {{ role: string, content: string }[]} [history] - Histórico recente (max 6 mensagens)
 * @returns {Promise<{ answer: string, toolsUsed: string[], developmentProposal: object|null }>}
 */
export async function askKaviarAi(question, history) {
  const body = { question };
  if (Array.isArray(history) && history.length > 0) {
    body.history = history;
  }
  const response = await api.post(`${AI_BASE_PATH}/chat`, body, { timeout: 45000 });

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
 * Lista development jobs ativos (AWAITING_SCOPE, AWAITING_CONFIRMATION, QUEUED, RUNNING).
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
 * O backend valida que o job está em AWAITING_CONFIRMATION e transiciona para QUEUED.
 * Não requer body — autenticação e RBAC são suficientes.
 *
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function confirmDevJob(id) {
  const response = await api.post(`${AI_BASE_PATH}/dev-jobs/${id}/confirm`);
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
