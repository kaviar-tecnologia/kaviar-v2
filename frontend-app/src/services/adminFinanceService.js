import api from '../api';

const FINANCE_BASE_PATH = '/api/admin/finance';

const duplicateCodePatterns = [
  'code já existe',
  'code ja existe',
  'código já existe',
  'codigo ja existe',
  'duplicat',
  'already exists',
  'unique constraint',
];
const versionConflictPatterns = [
  'expected_updated_at divergente',
  'expected_updated_at mismatch',
  'versão desatualizada',
  'versao desatualizada',
  'conflito de atualização',
  'conflito de atualizacao',
  'concurrency',
  'stale update',
];
const structuralConflictPatterns = [
  'campo estrutural bloqueado',
  'campo estrutural',
  'já foi usada',
  'ja foi usada',
  'já foi utilizado',
  'ja foi utilizado',
  'conta utilizada',
  'cannot change structural',
];
const structuralPermissionPatterns = [
  'campo estrutural exige super_admin',
  'campo estrutural requer super_admin',
  'campo sem permissão para finance',
  'campo sem permissao para finance',
  'requires super_admin',
  'forbidden structural field',
];
const deactivationConflictPatterns = [
  'transações não finais',
  'transacoes nao finais',
  'transações pendentes',
  'transacoes pendentes',
  'pending transactions',
  'cannot deactivate',
];

const buildQueryString = (params = {}) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : '';
};

const getErrorMessage = (error, fallbackMessage) => {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage
  );
};

const buildHttpError = (error, fallbackMessage) => {
  const rawMessage = getErrorMessage(error, fallbackMessage);
  const httpError = new Error(rawMessage);
  httpError.status = error?.response?.status;
  httpError.rawMessage = rawMessage;
  return httpError;
};

const includesKnownPattern = (message, patterns) => {
  const normalizedMessage = String(message || '').toLowerCase();
  return patterns.some((pattern) => normalizedMessage.includes(pattern));
};

export const getFinanceAccountErrorPresentation = (error, options = {}) => {
  const { operation = 'save' } = options;
  const status = error?.status;
  const rawMessage = error?.rawMessage || error?.message || '';

  if (status === 400) {
    return {
      status,
      message: 'Revise os campos informados.',
      showReload: false,
    };
  }

  if (status === 401) {
    return {
      status,
      message: 'Sua sessão precisa ser validada novamente.',
      showReload: false,
    };
  }

  if (status === 403) {
    return {
      status,
      message: includesKnownPattern(rawMessage, structuralPermissionPatterns)
        ? 'Esta alteração exige acesso SUPER_ADMIN.'
        : 'Você não tem permissão para realizar esta alteração.',
      showReload: false,
    };
  }

  if (status === 404) {
    return {
      status,
      message: 'A conta não foi encontrada ou foi removida.',
      showReload: true,
      reloadLabel: 'Recarregar dados',
    };
  }

  if (status === 409) {
    if (includesKnownPattern(rawMessage, duplicateCodePatterns)) {
      return {
        status,
        message: 'Já existe uma conta com esse código.',
        showReload: false,
      };
    }

    if (includesKnownPattern(rawMessage, versionConflictPatterns)) {
      return {
        status,
        message: 'Os dados foram alterados por outra pessoa.',
        showReload: true,
        reloadLabel: 'Recarregar dados',
        kind: 'version_conflict',
      };
    }

    if (includesKnownPattern(rawMessage, structuralConflictPatterns)) {
      return {
        status,
        message: 'Esta conta já foi utilizada e não permite alterar este campo estrutural.',
        showReload: true,
        reloadLabel: 'Recarregar dados',
        kind: 'structural_conflict',
      };
    }

    if (includesKnownPattern(rawMessage, deactivationConflictPatterns)) {
      return {
        status,
        message: 'Não é possível desativar a conta enquanto houver transações pendentes.',
        showReload: true,
        reloadLabel: 'Recarregar dados',
        kind: 'deactivation_conflict',
      };
    }

    return {
      status,
      message: 'Houve um conflito ao salvar a conta financeira.',
      showReload: true,
      reloadLabel: 'Recarregar dados',
    };
  }

  return {
    status,
    message: operation === 'toggle'
      ? 'Não foi possível atualizar a conta financeira.'
      : 'Não foi possível salvar a conta financeira.',
    showReload: false,
  };
};

const performGet = async (path, params, fallbackMessage) => {
  try {
    const query = buildQueryString(params);
    const response = await api.get(`${path}${query}`);
    return response.data;
  } catch (error) {
    throw buildHttpError(error, fallbackMessage);
  }
};

const performPost = async (path, payload, fallbackMessage) => {
  try {
    const response = await api.post(path, payload);
    return response.data;
  } catch (error) {
    throw buildHttpError(error, fallbackMessage);
  }
};

const performPatch = async (path, payload, fallbackMessage) => {
  try {
    const response = await api.patch(path, payload);
    return response.data;
  } catch (error) {
    throw buildHttpError(error, fallbackMessage);
  }
};

export const listFinanceAccounts = async (params = {}) => {
  return performGet(
    `${FINANCE_BASE_PATH}/accounts`,
    params,
    'Não foi possível carregar contas financeiras.'
  );
};

export const listFinanceCategories = async (params = {}) => {
  return performGet(
    `${FINANCE_BASE_PATH}/categories`,
    params,
    'Não foi possível carregar categorias financeiras.'
  );
};

export const listFinanceCostCenters = async (params = {}) => {
  return performGet(
    `${FINANCE_BASE_PATH}/cost-centers`,
    params,
    'Não foi possível carregar centros de custo.'
  );
};

export const createFinanceAccount = async (payload) => {
  return performPost(
    `${FINANCE_BASE_PATH}/accounts`,
    payload,
    'Não foi possível criar a conta financeira.'
  );
};

export const updateFinanceAccount = async (id, payload) => {
  return performPatch(
    `${FINANCE_BASE_PATH}/accounts/${id}`,
    payload,
    'Não foi possível atualizar a conta financeira.'
  );
};

export const listFinanceRecognitionPolicies = async (params = {}) => {
  return performGet(
    `${FINANCE_BASE_PATH}/recognition-policies`,
    params,
    'Não foi possível carregar políticas de reconhecimento.'
  );
};

export const getFinanceRecognitionPolicyById = async (id) => {
  return performGet(
    `${FINANCE_BASE_PATH}/recognition-policies/${encodeURIComponent(id)}`,
    {},
    'Não foi possível carregar a política de reconhecimento.'
  );
};

export const createFinanceRecognitionPolicy = async (payload) => {
  return performPost(
    `${FINANCE_BASE_PATH}/recognition-policies`,
    payload,
    'Não foi possível criar a política de reconhecimento.'
  );
};

export const updateFinanceRecognitionPolicy = async (id, payload) => {
  return performPatch(
    `${FINANCE_BASE_PATH}/recognition-policies/${encodeURIComponent(id)}`,
    payload,
    'Não foi possível atualizar a política de reconhecimento.'
  );
};

export const listTerritories = async () => {
  return performGet(
    '/api/admin/territories',
    {},
    'Não foi possível carregar territórios.'
  );
};

// ── Financial Transactions CRUD ──────────────────────────────────────────────

export const listFinanceTransactions = async (params = {}) => {
  return performGet('/api/admin/finance/transactions', params, 'Erro ao listar lançamentos.');
};

export const getFinanceTransactionById = async (id) => {
  return performGet(`/api/admin/finance/transactions/${id}`, {}, 'Erro ao carregar lançamento.');
};

export const createFinanceTransaction = async (body) => {
  return performPost('/api/admin/finance/transactions', body, 'Erro ao criar lançamento.');
};

export const updateFinanceTransaction = async (id, body) => {
  return performPatch(`/api/admin/finance/transactions/${id}`, body, 'Erro ao atualizar lançamento.');
};

export const postFinanceTransaction = async (id, body) => {
  return performPost(`/api/admin/finance/transactions/${id}/post`, body, 'Erro ao liquidar lançamento.');
};

export const cancelFinanceTransaction = async (id, body) => {
  return performPost(`/api/admin/finance/transactions/${id}/cancel`, body, 'Erro ao cancelar lançamento.');
};
