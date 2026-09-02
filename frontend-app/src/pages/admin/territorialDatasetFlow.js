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

/**
 * True somente para SUPER_ADMIN. Reutiliza a fonte OFICIAL de RBAC do Admin:
 * `localStorage['kaviar_admin_data']` (gravado no login com data.data.user, que
 * inclui `role`) — a MESMA fonte usada por ProtectedAdminRoute e demais páginas.
 * Fail-closed: qualquer ausência/erro → false. NÃO confia apenas na presença de
 * token; o backend (requireSuperAdmin) permanece a barreira definitiva.
 */
export function isSuperAdmin(getItem = (k) => localStorage.getItem(k)) {
  try {
    const raw = getItem('kaviar_admin_data') || '{}';
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
 * Gating do BOTÃO PRINCIPAL "Aplicar dataset" (abre o modal). UX fail-closed:
 * o botão só fica habilitado quando já existe uma PRÉVIA VÁLIDA carregada para a
 * MESMA version (preview.versionId === dataset.id) e canProceed === true.
 * Não substitui canConfirmApply — que continua sendo a segunda barreira
 * independente (checkbox + revalidação no momento do confirm).
 */
export function canOpenApply({ superAdmin, dataset, preview, inFlight }) {
  if (!superAdmin) return false;
  if (inFlight) return false;
  if (!dataset || dataset.status !== DATASET_STATUS.PREVIEWED) return false;
  if (dataset.applied_at) return false;
  if (!preview) return false;
  if (preview.versionId !== dataset.id) return false;
  if (preview.canProceed !== true) return false;
  return true;
}

/**
 * Gating do apply: só habilita "Confirmar aplicação" quando TODAS as condições
 * são verdadeiras. Fail-closed por padrão.
 *
 * EXIGE também uma PREVIEW VÁLIDA carregada para a MESMA dataset version:
 *  - `preview` presente;
 *  - `preview.versionId === dataset.id` (não vale prévia de outra version);
 *  - `preview.canProceed === true`.
 * Assim, recarregar a página com um dataset PREVIEWED (preview=null) NÃO habilita
 * apply — o usuário precisa clicar em "Gerar prévia" novamente. A prévia NÃO é
 * persistida no client.
 */
export function canConfirmApply({ superAdmin, dataset, preview, confirmChecked, inFlight }) {
  if (!superAdmin) return false;
  if (inFlight) return false;                 // proteção contra double-click / loading
  if (!dataset || dataset.status !== DATASET_STATUS.PREVIEWED) return false;
  if (dataset.applied_at) return false;       // já aplicado
  if (confirmChecked !== true) return false;  // checkbox obrigatório
  // Exige preview válida da MESMA version (fail-closed).
  if (!preview) return false;
  if (preview.versionId !== dataset.id) return false;
  if (preview.canProceed !== true) return false;
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

/**
 * Executa uma request e retorna sempre um objeto (nunca lança):
 *  - erro de rede/abort → { ok:false, code:'NETWORK_ERROR'|'ABORTED', message }
 *  - JSON inválido/resposta inesperada → { ok:false, code:'INVALID_RESPONSE', message }
 *  - HTTP !ok ou success:false → normalizeError
 *  - sucesso → { ok:true, data }  (via `pick`)
 * Fail-closed: qualquer coisa fora do caminho feliz vira ok:false.
 */
async function safeRequest(fetchImpl, url, options, pick) {
  let res;
  try {
    res = await fetchImpl(url, options);
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
    return { ok: false, code: aborted ? 'ABORTED' : 'NETWORK_ERROR', message: String(e?.message || e || 'Falha de rede') };
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    return { ok: false, code: 'INVALID_RESPONSE', message: `Resposta inválida do servidor (HTTP ${res?.status ?? '?'})` };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, code: 'INVALID_RESPONSE', message: 'Resposta inesperada do servidor' };
  }
  if (!res.ok || !data.success) return { ok: false, ...normalizeError(data, res.status) };
  return { ok: true, data: pick ? pick(data) : data };
}

/** GET datasets do território. Nunca lança. */
export async function fetchDatasets(territoryId, token, fetchImpl = fetch) {
  const r = await safeRequest(fetchImpl, `${base(territoryId)}/datasets`, { headers: headers(token) }, (d) => d.data || []);
  return r.ok ? { ok: true, datasets: r.data } : r;
}

/** POST acquire. Não faz retry. Nunca lança. */
export async function acquireDataset(territoryId, token, fetchImpl = fetch) {
  return safeRequest(fetchImpl, `${base(territoryId)}/acquire`, { method: 'POST', headers: headers(token), body: '{}' }, (d) => d.data);
}

/** POST preview. Não faz retry. Nunca lança. */
export async function previewDataset(territoryId, versionId, token, fetchImpl = fetch) {
  return safeRequest(fetchImpl, `${base(territoryId)}/datasets/${versionId}/preview`, { method: 'POST', headers: headers(token), body: '{}' }, (d) => d.data);
}

/** POST reject. Não faz retry. Nunca lança. */
export async function rejectDataset(territoryId, versionId, token, reason, fetchImpl = fetch) {
  return safeRequest(fetchImpl, `${base(territoryId)}/datasets/${versionId}/reject`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(reason ? { reason } : {}),
  }, (d) => d.data);
}

/**
 * POST apply — endpoint OFICIAL com confirm=true OBRIGATÓRIO.
 * A UI só deve chamar após canConfirmApply(...) === true.
 * `confirm` deve ser exatamente true (guarda extra fail-closed no client).
 * Nunca lança.
 */
export async function applyDataset(territoryId, versionId, token, confirm, fetchImpl = fetch) {
  if (confirm !== true) return { ok: false, code: 'CONFIRM_REQUIRED', message: 'Confirmação explícita obrigatória' };
  return safeRequest(fetchImpl, `${base(territoryId)}/datasets/${versionId}/apply`, {
    method: 'POST', headers: headers(token), body: JSON.stringify({ confirm: true }),
  }, (d) => d.data);
}
