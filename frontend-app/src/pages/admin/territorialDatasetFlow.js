/**
 * Lógica PURA e testável do fluxo de dataset territorial (Fase 4 — UI Super Admin).
 * Fluxo: ACQUIRE → DRAFT → PREVIEW → PREVIEWED → APPLY → APPLIED.
 *
 * Sem React, sem DOM: apenas decisões de estado + chamadas HTTP aos endpoints
 * OFICIAIS já existentes. Fail-closed: nunca assume sucesso otimista; sempre
 * usa o estado retornado pelo backend.
 */
import { API_BASE_URL } from '../../config/api';

/** Estados possíveis de uma dataset version (espelha o backend, sem APPLYING transitório visível). */
export const DATASET_STATUS = {
  DRAFT: 'DRAFT',
  PREVIEWED: 'PREVIEWED',
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED',
};

/** True somente para SUPER_ADMIN. Reutiliza o mecanismo RBAC existente (localStorage). */
export function isSuperAdmin(getItem = (k) => localStorage.getItem(k)) {
  try {
    const raw = getItem('kaviar_admin_user') || '{}';
    return JSON.parse(raw).role === 'SUPER_ADMIN';
  } catch {
    return false;
  }
}

/** A version "mais recente" (maior created_at) de uma lista de datasets. */
export function latestDataset(datasets) {
  if (!Array.isArray(datasets) || datasets.length === 0) return null;
  return [...datasets].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
}

/**
 * Decide quais ações a UI oferece, dado o papel e a version atual.
 * NUNCA habilita apply sem SUPER_ADMIN. NUNCA oferece re-apply de APPLIED.
 * Retorna flags booleanas (a UI apenas renderiza/gateia com base nelas).
 */
export function availableActions({ superAdmin, dataset }) {
  const none = { canAcquire: false, canPreview: false, canApply: false, canReject: false };
  if (!superAdmin) return none; // RBAC: sem SUPER_ADMIN, nenhuma ação operacional
  const status = dataset?.status ?? null;
  if (!dataset) return { ...none, canAcquire: true };
  switch (status) {
    case DATASET_STATUS.DRAFT:
      return { canAcquire: false, canPreview: true, canApply: false, canReject: true };
    case DATASET_STATUS.PREVIEWED:
      return { canAcquire: false, canPreview: true, canApply: true, canReject: true };
    case DATASET_STATUS.APPLIED:
      // Terminal: sem novo apply, sem reject, sem re-acquire pela mesma seção.
      return { canAcquire: false, canPreview: false, canApply: false, canReject: false };
    case DATASET_STATUS.REJECTED:
      // Rejeitada: permite adquirir novamente (nova version).
      return { canAcquire: true, canPreview: false, canApply: false, canReject: false };
    default:
      return none;
  }
}

/**
 * Gating do apply: só habilita o botão "Confirmar aplicação" quando TODAS as
 * condições são verdadeiras. Fail-closed por padrão.
 */
export function canConfirmApply({ superAdmin, dataset, confirmChecked, inFlight }) {
  if (!superAdmin) return false;
  if (inFlight) return false;                 // proteção contra double-click / loading
  if (!dataset || dataset.status !== DATASET_STATUS.PREVIEWED) return false;
  if (dataset.applied_at) return false;       // já aplicado
  if (confirmChecked !== true) return false;  // checkbox obrigatório
  return true;
}

/** checksum abreviado para exibição (não expõe o valor completo desnecessariamente). */
export function shortChecksum(checksum) {
  if (!checksum || typeof checksum !== 'string') return '—';
  return checksum.length <= 12 ? checksum : `${checksum.slice(0, 8)}…${checksum.slice(-4)}`;
}

/** Normaliza a resposta de erro do backend em {code, message} (nunca inventa sucesso). */
export function normalizeError(payload, httpStatus) {
  const code = payload?.code || payload?.error || `HTTP_${httpStatus ?? 'ERR'}`;
  const message = payload?.error || payload?.reason || payload?.message || 'Erro inesperado';
  return { code, message, conflicts: payload?.conflicts ?? null };
}

// ─── API client (endpoints OFICIAIS; nunca /confirm legado) ──────────────────

function headers(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function base(territoryId) {
  return `${API_BASE_URL}/api/admin/territories/${territoryId}/prepare-city`;
}

/** GET datasets do território. Retorna {ok, datasets} | {ok:false, error}. */
export async function fetchDatasets(territoryId, token, fetchImpl = fetch) {
  const res = await fetchImpl(`${base(territoryId)}/datasets`, { headers: headers(token) });
  const data = await res.json();
  if (!res.ok || !data.success) return { ok: false, ...normalizeError(data, res.status) };
  return { ok: true, datasets: data.data || [] };
}

/** POST acquire. Não faz retry. */
export async function acquireDataset(territoryId, token, fetchImpl = fetch) {
  const res = await fetchImpl(`${base(territoryId)}/acquire`, { method: 'POST', headers: headers(token), body: '{}' });
  const data = await res.json();
  if (!res.ok || !data.success) return { ok: false, ...normalizeError(data, res.status) };
  return { ok: true, data: data.data };
}

/** POST preview. Não faz retry. */
export async function previewDataset(territoryId, versionId, token, fetchImpl = fetch) {
  const res = await fetchImpl(`${base(territoryId)}/datasets/${versionId}/preview`, { method: 'POST', headers: headers(token), body: '{}' });
  const data = await res.json();
  if (!res.ok || !data.success) return { ok: false, ...normalizeError(data, res.status) };
  return { ok: true, data: data.data };
}

/** POST reject. Não faz retry. */
export async function rejectDataset(territoryId, versionId, token, reason, fetchImpl = fetch) {
  const res = await fetchImpl(`${base(territoryId)}/datasets/${versionId}/reject`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(reason ? { reason } : {}),
  });
  const data = await res.json();
  if (!res.ok || !data.success) return { ok: false, ...normalizeError(data, res.status) };
  return { ok: true, data: data.data };
}

/**
 * POST apply — endpoint OFICIAL com confirm=true OBRIGATÓRIO.
 * A UI só deve chamar esta função após canConfirmApply(...) === true.
 * `confirm` deve ser exatamente true (guarda extra fail-closed no client).
 */
export async function applyDataset(territoryId, versionId, token, confirm, fetchImpl = fetch) {
  if (confirm !== true) return { ok: false, code: 'CONFIRM_REQUIRED', message: 'Confirmação explícita obrigatória' };
  const res = await fetchImpl(`${base(territoryId)}/datasets/${versionId}/apply`, {
    method: 'POST', headers: headers(token), body: JSON.stringify({ confirm: true }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) return { ok: false, ...normalizeError(data, res.status) };
  return { ok: true, data: data.data };
}
