import api from '../api';

const BASE_PATH = '/api/admin/accounting';

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

// ── Legal Entities ──────────────────────────────────────────────────────────

export const listLegalEntities = async (params = {}) => {
  return performGet(
    `${BASE_PATH}/entities`,
    params,
    'Não foi possível carregar empresas.'
  );
};

export const getLegalEntity = async (id) => {
  return performGet(
    `${BASE_PATH}/entities/${encodeURIComponent(id)}`,
    {},
    'Não foi possível carregar a empresa.'
  );
};

export const createLegalEntity = async (data) => {
  return performPost(
    `${BASE_PATH}/entities`,
    data,
    'Não foi possível criar a empresa.'
  );
};

export const updateLegalEntity = async (id, data) => {
  return performPatch(
    `${BASE_PATH}/entities/${encodeURIComponent(id)}`,
    data,
    'Não foi possível atualizar a empresa.'
  );
};

// ── Accounting Firms ────────────────────────────────────────────────────────

export const listAccountingFirms = async (params = {}) => {
  return performGet(
    `${BASE_PATH}/firms`,
    params,
    'Não foi possível carregar escritórios.'
  );
};

export const getAccountingFirm = async (id) => {
  return performGet(
    `${BASE_PATH}/firms/${encodeURIComponent(id)}`,
    {},
    'Não foi possível carregar o escritório.'
  );
};

export const createAccountingFirm = async (data) => {
  return performPost(
    `${BASE_PATH}/firms`,
    data,
    'Não foi possível criar o escritório.'
  );
};

export const updateAccountingFirm = async (id, data) => {
  return performPatch(
    `${BASE_PATH}/firms/${encodeURIComponent(id)}`,
    data,
    'Não foi possível atualizar o escritório.'
  );
};

// ── Accountants ─────────────────────────────────────────────────────────────

export const listAccountants = async (params = {}) => {
  return performGet(
    `${BASE_PATH}/accountants`,
    params,
    'Não foi possível carregar contadores.'
  );
};

export const getAccountant = async (id) => {
  return performGet(
    `${BASE_PATH}/accountants/${encodeURIComponent(id)}`,
    {},
    'Não foi possível carregar o contador.'
  );
};

export const createAccountant = async (data) => {
  return performPost(
    `${BASE_PATH}/accountants`,
    data,
    'Não foi possível criar o contador.'
  );
};

export const updateAccountant = async (id, data) => {
  return performPatch(
    `${BASE_PATH}/accountants/${encodeURIComponent(id)}`,
    data,
    'Não foi possível atualizar o contador.'
  );
};

// ── Accountant Invites ───────────────────────────────────────────────────────

export const inviteAccountant = async (id) => {
  const { data } = await api.post(`${BASE_PATH}/accountants/${encodeURIComponent(id)}/invite`);
  return data;
};

export const reinviteAccountant = async (id) => {
  const { data } = await api.post(`${BASE_PATH}/accountants/${encodeURIComponent(id)}/reinvite`);
  return data;
};

export const revokeAccountantInvite = async (id) => {
  const { data } = await api.post(`${BASE_PATH}/accountants/${encodeURIComponent(id)}/revoke-invite`);
  return data;
};

// ── Accountant Links ────────────────────────────────────────────────────────

export const listAccountantLinks = async (params = {}) => {
  return performGet(
    `${BASE_PATH}/links`,
    params,
    'Não foi possível carregar vínculos.'
  );
};

export const getAccountantLink = async (id) => {
  return performGet(
    `${BASE_PATH}/links/${encodeURIComponent(id)}`,
    {},
    'Não foi possível carregar o vínculo.'
  );
};

export const createAccountantLink = async (data) => {
  return performPost(
    `${BASE_PATH}/links`,
    data,
    'Não foi possível criar o vínculo.'
  );
};

export const updateAccountantLink = async (id, data) => {
  return performPatch(
    `${BASE_PATH}/links/${encodeURIComponent(id)}`,
    data,
    'Não foi possível atualizar o vínculo.'
  );
};
