import api from '../api';

const BASE_PATH = '/api/admin/ar/places';

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.append(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : '';
};

const toError = (error, fallbackMessage) => {
  const message =
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage;
  const result = new Error(message);
  result.status = error?.response?.status;
  throw result;
};

export async function listArPlaces(params = {}) {
  try {
    const response = await api.get(`${BASE_PATH}${buildQueryString(params)}`);
    return response.data;
  } catch (error) {
    toError(error, 'Erro ao listar locais AR.');
  }
}

export async function getArPlaceById(id) {
  try {
    const response = await api.get(`${BASE_PATH}/${encodeURIComponent(id)}`);
    return response.data;
  } catch (error) {
    toError(error, 'Erro ao carregar local AR.');
  }
}

export async function createArPlace(payload) {
  try {
    const response = await api.post(BASE_PATH, payload);
    return response.data;
  } catch (error) {
    toError(error, 'Erro ao criar local AR.');
  }
}

export async function updateArPlace(id, payload) {
  try {
    const response = await api.patch(`${BASE_PATH}/${encodeURIComponent(id)}`, payload);
    return response.data;
  } catch (error) {
    toError(error, 'Erro ao atualizar local AR.');
  }
}

export async function getArPlaceChangeRequest(id) {
  try {
    const response = await api.get(`${BASE_PATH}/${encodeURIComponent(id)}/change-request`);
    return response.data;
  } catch (error) {
    toError(error, 'Erro ao carregar alteração pendente.');
  }
}

export async function approveArPlaceChangeRequest(id, requestId) {
  try {
    const response = await api.post(
      `${BASE_PATH}/${encodeURIComponent(id)}/change-request/${encodeURIComponent(requestId)}/approve`,
    );
    return response.data;
  } catch (error) {
    toError(error, 'Erro ao aprovar alteração pendente.');
  }
}

export async function rejectArPlaceChangeRequest(id, requestId, payload = {}) {
  try {
    const response = await api.post(
      `${BASE_PATH}/${encodeURIComponent(id)}/change-request/${encodeURIComponent(requestId)}/reject`,
      payload,
    );
    return response.data;
  } catch (error) {
    toError(error, 'Erro ao rejeitar alteração pendente.');
  }
}
