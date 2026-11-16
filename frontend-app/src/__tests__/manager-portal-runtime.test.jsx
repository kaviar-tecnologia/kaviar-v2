/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ManagerHome from '../pages/admin/ManagerHome';
import MyContractPage from '../pages/admin/MyContractPage';
import { managerPortalRequest } from '../services/managerPortalApi';

let root;
let container;

const response = (status, data) => ({
  status, ok: status >= 200 && status < 300,
  json: async () => data,
});

async function render(element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter>{element}</MemoryRouter>);
    await new Promise(resolve => setTimeout(resolve, 30));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}

describe('manager portal session and error states', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.setItem('kaviar_admin_token', 'synthetic-first');
    localStorage.setItem('kaviar_admin_data', JSON.stringify({ name: 'Gestora', role: 'TERRITORIAL_MANAGER' }));
  });
  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    root = null;
    container = null;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('uses the current token on each request and reports 401 without clearing another session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await managerPortalRequest('/test');
    localStorage.setItem('kaviar_admin_token', 'synthetic-second');
    fetchMock.mockResolvedValueOnce(response(401, {}));
    await expect(managerPortalRequest('/test')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-first');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer synthetic-second');
    expect(localStorage.getItem('kaviar_admin_token')).toBe('synthetic-second');
  });

  it('does not present an old account response after the session changes', async () => {
    let finish;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const pending = managerPortalRequest('/test');
    localStorage.setItem('kaviar_admin_token', 'other-session');
    finish(response(200, { success: true, data: { private: true } }));
    await expect(pending).rejects.toMatchObject({ status: 401, code: 'AUTH_SESSION_CHANGED' });
  });

  it('shows expired session rather than a nonexistent profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, { success: false })));
    await render(<MyContractPage />);
    expect(container.textContent).toContain('Sessão inválida ou expirada');
    expect(container.textContent).toContain('Entrar novamente');
    expect(container.textContent).not.toContain('Nenhum perfil contratual foi encontrado');
  });

  it('only reports an absent profile after a successful null response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { success: true, data: null })));
    await render(<MyContractPage />);
    expect(container.textContent).toContain('Nenhum perfil contratual foi encontrado');
  });

  it('distinguishes dashboard failures from missing territory and referral', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url.includes('/my-operator-profile/territory-info')) return response(503, { success: false, error: 'Consulta territorial indisponível.' });
      if (url.includes('/operator/referrals')) return response(503, { success: false, error: 'Consulta de indicação indisponível.' });
      if (url.includes('/my-territories')) return response(200, { success: true, data: [] });
      if (url.includes('/finance/team')) return response(200, { success: true, data: [] });
      return response(200, { success: true, data: {}, metrics: {} });
    }));
    await render(<ManagerHome />);
    expect(container.textContent).toContain('Território: consulta indisponível');
    expect(container.textContent).toContain('Consulta de indicação indisponível.');
    expect(container.textContent).not.toContain('Território não vinculado');
    expect(container.textContent).not.toContain('Código de indicação não encontrado');
  });

  it('displays the assigned territory and an existing referral code', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url.includes('/my-operator-profile/territory-info')) return response(200, { success: true, data: { territory_id: 'a', territory_name: 'Realengo' } });
      if (url.includes('/operator/referrals')) return response(200, { success: true, data: { has_code: true, referral_code: 'TERRTEST', stats: { total: 0, pending: 0, qualified: 0 } } });
      if (url.includes('/my-territories') || url.includes('/neighborhoods') || url.includes('/finance/team')) return response(200, { success: true, data: [] });
      return response(200, { success: true, data: {}, metrics: {} });
    }));
    await render(<ManagerHome />);
    expect(container.textContent).toContain('Realengo');
    expect(container.textContent).toContain('TERRTEST');
    expect(container.textContent).not.toContain('Código de indicação não encontrado');
  });
});
