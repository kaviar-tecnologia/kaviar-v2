import { describe, it, expect } from 'vitest';
import {
  DATASET_STATUS, isSuperAdmin, latestDataset, availableActions, canConfirmApply, canOpenApply,
  shortChecksum, normalizeError, fetchDatasets, acquireDataset, previewDataset,
  rejectDataset, applyDataset,
} from '../pages/admin/territorialDatasetFlow';

const SA = { superAdmin: true };
const draft = { id: 'v1', status: 'DRAFT', applied_at: null };
const previewed = { id: 'v1', status: 'PREVIEWED', applied_at: null };
const applied = { id: 'v1', status: 'APPLIED', applied_at: '2026-09-02T04:52:51Z' };
const rejected = { id: 'v1', status: 'REJECTED', applied_at: null };

describe('RBAC isSuperAdmin (fonte oficial: kaviar_admin_data)', () => {
  // getItem simula o localStorage real: só kaviar_admin_data carrega role.
  const store = (data) => (k) => (k === 'kaviar_admin_data' ? JSON.stringify(data) : null);

  it('true para SUPER_ADMIN em kaviar_admin_data', () => {
    expect(isSuperAdmin(store({ id: 'a1', role: 'SUPER_ADMIN', name: 'X' }))).toBe(true);
  });
  it('false para outros papéis', () => {
    expect(isSuperAdmin(store({ role: 'FINANCE' }))).toBe(false);
    expect(isSuperAdmin(store({ role: 'TERRITORIAL_MANAGER' }))).toBe(false);
  });
  it('REGRESSÃO: sessão real onde kaviar_admin_user NÃO tem role, mas kaviar_admin_data tem → true', () => {
    // reproduz o bug reportado: kaviar_admin_user sem role; a fonte correta é kaviar_admin_data.
    const getItem = (k) => {
      if (k === 'kaviar_admin_user') return JSON.stringify({ id: 'a1' }); // sem role
      if (k === 'kaviar_admin_data') return JSON.stringify({ id: 'a1', role: 'SUPER_ADMIN' });
      return null;
    };
    expect(isSuperAdmin(getItem)).toBe(true);
  });
  it('fail-closed: sem kaviar_admin_data → false', () => {
    expect(isSuperAdmin(() => null)).toBe(false);
  });
  it('fail-closed: JSON inválido → false', () => {
    expect(isSuperAdmin(() => 'lixo{')).toBe(false);
  });
  it('não confia em kaviar_admin_user (fonte errada) para conceder acesso', () => {
    // Mesmo que kaviar_admin_user tivesse role, a função lê kaviar_admin_data.
    const getItem = (k) => (k === 'kaviar_admin_user' ? JSON.stringify({ role: 'SUPER_ADMIN' }) : null);
    expect(isSuperAdmin(getItem)).toBe(false); // kaviar_admin_data ausente → false
  });
});

describe('latestDataset', () => {
  it('retorna a mais recente por created_at', () => {
    const a = { id: 'a', created_at: '2026-01-01' };
    const b = { id: 'b', created_at: '2026-05-01' };
    expect(latestDataset([a, b]).id).toBe('b');
  });
  it('null quando vazio', () => { expect(latestDataset([])).toBeNull(); expect(latestDataset(undefined)).toBeNull(); });
});

describe('availableActions (state machine)', () => {
  it('não SUPER_ADMIN → nenhuma ação, mesmo em PREVIEWED', () => {
    expect(availableActions({ superAdmin: false, dataset: previewed }))
      .toEqual({ canAcquire: false, canPreview: false, canApply: false, canReject: false });
  });
  it('sem dataset → só acquire', () => {
    expect(availableActions({ ...SA, dataset: null })).toEqual({ canAcquire: true, canPreview: false, canApply: false, canReject: false });
  });
  it('DRAFT → preview + reject (sem apply)', () => {
    const a = availableActions({ ...SA, dataset: draft });
    expect(a).toEqual({ canAcquire: false, canPreview: true, canApply: false, canReject: true });
  });
  it('PREVIEWED → apply + reject + preview', () => {
    const a = availableActions({ ...SA, dataset: previewed });
    expect(a.canApply).toBe(true); expect(a.canReject).toBe(true); expect(a.canPreview).toBe(true);
  });
  it('APPLIED → nenhuma ação (sem novo apply)', () => {
    expect(availableActions({ ...SA, dataset: applied }))
      .toEqual({ canAcquire: false, canPreview: false, canApply: false, canReject: false });
  });
  it('REJECTED → permite adquirir de novo', () => {
    expect(availableActions({ ...SA, dataset: rejected }).canAcquire).toBe(true);
  });
});

describe('canOpenApply (gating do BOTÃO PRINCIPAL "Aplicar dataset")', () => {
  const validPreview = { versionId: 'v1', canProceed: true };
  const okArgs = { superAdmin: true, dataset: previewed, preview: validPreview, inFlight: false };
  it('PREVIEWED + preview válida da mesma version → habilitado (sem exigir checkbox aqui)', () => {
    expect(canOpenApply(okArgs)).toBe(true);
  });
  it('PREVIEWED + preview null → DESABILITADO', () => {
    expect(canOpenApply({ ...okArgs, preview: null })).toBe(false);
  });
  it('PREVIEWED + preview de OUTRA version → DESABILITADO', () => {
    expect(canOpenApply({ ...okArgs, preview: { versionId: 'OUTRA', canProceed: true } })).toBe(false);
  });
  it('PREVIEWED + canProceed=false → DESABILITADO', () => {
    expect(canOpenApply({ ...okArgs, preview: { versionId: 'v1', canProceed: false } })).toBe(false);
  });
  it('não SUPER_ADMIN / inFlight / não-PREVIEWED / já aplicado → DESABILITADO', () => {
    expect(canOpenApply({ ...okArgs, superAdmin: false })).toBe(false);
    expect(canOpenApply({ ...okArgs, inFlight: true })).toBe(false);
    expect(canOpenApply({ ...okArgs, dataset: draft })).toBe(false);
    expect(canOpenApply({ ...okArgs, dataset: { ...previewed, applied_at: '2026-09-02' } })).toBe(false);
  });
});

describe('canConfirmApply (gating do apply — exige preview válida da mesma version)', () => {
  const validPreview = { versionId: 'v1', canProceed: true };
  const okArgs = { superAdmin: true, dataset: previewed, preview: validPreview, confirmChecked: true, inFlight: false };
  it('true somente com todas as condições (incl. preview válida da mesma version)', () => {
    expect(canConfirmApply(okArgs)).toBe(true);
  });
  it('PREVIEWED + preview null => desabilitado', () => {
    expect(canConfirmApply({ ...okArgs, preview: null })).toBe(false);
  });
  it('PREVIEWED + preview de OUTRA version => desabilitado', () => {
    expect(canConfirmApply({ ...okArgs, preview: { versionId: 'OUTRA', canProceed: true } })).toBe(false);
  });
  it('PREVIEWED + canProceed=false => desabilitado', () => {
    expect(canConfirmApply({ ...okArgs, preview: { versionId: 'v1', canProceed: false } })).toBe(false);
  });
  it('false sem checkbox (confirmação obrigatória)', () => {
    expect(canConfirmApply({ ...okArgs, confirmChecked: false })).toBe(false);
  });
  it('false se não SUPER_ADMIN', () => {
    expect(canConfirmApply({ ...okArgs, superAdmin: false })).toBe(false);
  });
  it('false se em voo (protege double-click/loading)', () => {
    expect(canConfirmApply({ ...okArgs, inFlight: true })).toBe(false);
  });
  it('false se status não é PREVIEWED', () => {
    expect(canConfirmApply({ ...okArgs, dataset: draft })).toBe(false);
    expect(canConfirmApply({ ...okArgs, dataset: applied })).toBe(false);
  });
  it('false se já aplicado (applied_at set)', () => {
    expect(canConfirmApply({ ...okArgs, dataset: { ...previewed, applied_at: '2026-09-02' } })).toBe(false);
  });
});

describe('shortChecksum', () => {
  it('abrevia', () => { expect(shortChecksum('c87ba5e0675415641104f6709211eacf699fde24')).toBe('c87ba5e0…de24'); });
  it('trata vazio', () => { expect(shortChecksum(null)).toBe('—'); });
});

describe('normalizeError (fail-closed, sem otimismo)', () => {
  it('usa code + error do backend', () => {
    const e = normalizeError({ success: false, error: 'Dataset não pertence', code: 'DATASET_TERRITORY_MISMATCH', conflicts: [{ name: 'X', reason: 'y' }] }, 403);
    expect(e.code).toBe('DATASET_TERRITORY_MISMATCH');
    expect(e.message).toContain('não pertence');
    expect(e.conflicts).toHaveLength(1);
  });
  it('fallback para HTTP status', () => {
    expect(normalizeError({}, 500).code).toBe('HTTP_500');
  });
});

// ─── API client com fetch mockado ────────────────────────────────────────────

function mockFetch(status, jsonBody) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => jsonBody });
}

describe('API client — sucesso', () => {
  it('fetchDatasets retorna datasets', async () => {
    const r = await fetchDatasets('t1', 'tok', mockFetch(200, { success: true, data: [{ id: 'v1' }] }));
    expect(r.ok).toBe(true); expect(r.datasets).toHaveLength(1);
  });
  it('acquireDataset retorna DRAFT', async () => {
    const r = await acquireDataset('t1', 'tok', mockFetch(200, { success: true, data: { datasetVersionId: 'v1', status: 'DRAFT' } }));
    expect(r.ok).toBe(true); expect(r.data.status).toBe('DRAFT');
  });
  it('previewDataset retorna plan', async () => {
    const r = await previewDataset('t1', 'v1', 'tok', mockFetch(200, { success: true, data: { status: 'PREVIEWED', plan: { totals: { toCreate: 9 } } } }));
    expect(r.ok).toBe(true); expect(r.data.plan.totals.toCreate).toBe(9);
  });
  it('rejectDataset ok', async () => {
    const r = await rejectDataset('t1', 'v1', 'tok', 'motivo', mockFetch(200, { success: true, data: { status: 'REJECTED' } }));
    expect(r.ok).toBe(true); expect(r.data.status).toBe('REJECTED');
  });
  it('applyDataset com confirm=true ok', async () => {
    const r = await applyDataset('t1', 'v1', 'tok', true, mockFetch(200, { success: true, data: { status: 'APPLIED', counters: { created: 9 } } }));
    expect(r.ok).toBe(true); expect(r.data.counters.created).toBe(9);
  });
});

describe('API client — fail-closed', () => {
  it('applyDataset SEM confirm=true nunca chama o backend', async () => {
    let called = false;
    const spy = async () => { called = true; return { ok: true, status: 200, json: async () => ({ success: true }) }; };
    const r = await applyDataset('t1', 'v1', 'tok', false, spy);
    expect(r.ok).toBe(false); expect(r.code).toBe('CONFIRM_REQUIRED'); expect(called).toBe(false);
  });
  it('erro HTTP do backend → ok:false com code/message (sem sucesso otimista)', async () => {
    const r = await applyDataset('t1', 'v1', 'tok', true, mockFetch(409, { success: false, error: 'conflito', code: 'APPLY_CONFLICT' }));
    expect(r.ok).toBe(false); expect(r.code).toBe('APPLY_CONFLICT');
  });
  it('preview com erro 409 ambíguo → ok:false', async () => {
    const r = await previewDataset('t1', 'v1', 'tok', mockFetch(409, { success: false, error: 'ambiguo', code: 'DATASET_TERRITORY_AMBIGUOUS' }));
    expect(r.ok).toBe(false); expect(r.code).toBe('DATASET_TERRITORY_AMBIGUOUS');
  });
  it('acquire NO_VALID_FEATURES 422 → ok:false, sem retry (uma chamada)', async () => {
    let calls = 0;
    const spy = async () => { calls++; return { ok: false, status: 422, json: async () => ({ success: false, error: 'sem features', code: 'NO_VALID_FEATURES' }) }; };
    const r = await acquireDataset('t1', 'tok', spy);
    expect(r.ok).toBe(false); expect(r.code).toBe('NO_VALID_FEATURES'); expect(calls).toBe(1);
  });
});

describe('API client — erros de rede/JSON tratados (fail-closed, nunca lança)', () => {
  it('fetch REJEITA a Promise → ok:false NETWORK_ERROR (sem exceção)', async () => {
    const reject = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    const r = await fetchDatasets('t1', 'tok', reject);
    expect(r.ok).toBe(false); expect(r.code).toBe('NETWORK_ERROR');
    expect(r.message).toContain('ENOTFOUND');
  });
  it('AbortError → ok:false ABORTED', async () => {
    const abort = async () => { const e = new Error('The user aborted a request.'); e.name = 'AbortError'; throw e; };
    const r = await previewDataset('t1', 'v1', 'tok', abort);
    expect(r.ok).toBe(false); expect(r.code).toBe('ABORTED');
  });
  it('res.json() LANÇA → ok:false INVALID_RESPONSE', async () => {
    const badJson = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } });
    const r = await applyDataset('t1', 'v1', 'tok', true, badJson);
    expect(r.ok).toBe(false); expect(r.code).toBe('INVALID_RESPONSE');
  });
  it('resposta não-objeto → ok:false INVALID_RESPONSE', async () => {
    const weird = async () => ({ ok: true, status: 200, json: async () => 'string inesperada' });
    const r = await acquireDataset('t1', 'tok', weird);
    expect(r.ok).toBe(false); expect(r.code).toBe('INVALID_RESPONSE');
  });
  it('erro de rede NÃO dispara retry (uma única chamada)', async () => {
    let calls = 0;
    const spy = async () => { calls++; throw new Error('network down'); };
    const r = await applyDataset('t1', 'v1', 'tok', true, spy);
    expect(r.ok).toBe(false); expect(calls).toBe(1);
  });
});
