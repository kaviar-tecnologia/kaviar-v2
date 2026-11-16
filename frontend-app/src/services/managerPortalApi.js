import { API_BASE_URL } from '../config/api';

export class ManagerPortalError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function managerPortalRequest(path, options = {}) {
  const token = localStorage.getItem('kaviar_admin_token');
  if (!token) {
    throw new ManagerPortalError('Sessão ausente. Entre novamente.', 401, 'AUTH_TOKEN_MISSING');
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ManagerPortalError('Não foi possível conectar ao servidor. Tente novamente.', 0);
  }
  if (localStorage.getItem('kaviar_admin_token') !== token) {
    throw new ManagerPortalError('A sessão foi alterada. Atualize a página para continuar.', 401, 'AUTH_SESSION_CHANGED');
  }
  if (response.status === 401) {
    throw new ManagerPortalError('Sessão inválida ou expirada. Entre novamente.', 401);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ManagerPortalError('Resposta inválida do servidor. Tente novamente.', response.status);
  }
  if (localStorage.getItem('kaviar_admin_token') !== token) {
    throw new ManagerPortalError('A sessão foi alterada. Atualize a página para continuar.', 401, 'AUTH_SESSION_CHANGED');
  }
  if (!response.ok || data.success === false) {
    throw new ManagerPortalError(data.error || 'Não foi possível concluir a consulta.', response.status, data.code);
  }
  return data;
}
