/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerritoryDetailPage from '../pages/admin/TerritoryDetailPage';

vi.mock('../components/admin/MotoPassengerCompliance', () => ({ default: () => null }));
vi.mock('../components/admin/TerritorialDatasetSection', () => ({ default: () => null }));

describe('territorial regulatory notes', () => {
  let root;
  let container;
  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('loads the existing value and saves the edited value on blur', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.setItem('kaviar_admin_token', 'synthetic');
    localStorage.setItem('kaviar_admin_data', JSON.stringify({ role: 'SUPER_ADMIN' }));
    let territory = { id: 'a', name: 'Território A', level: 'region', status: 'active', regulatory_notes: 'Valor anterior' };
    const fetchMock = vi.fn(async (_url, options) => {
      if (options?.method === 'PATCH') territory = { ...territory, ...JSON.parse(options.body) };
      return { json: async () => ({ success: true, data: territory }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/territories/a']}>
        <Routes><Route path="/territories/:id" element={<TerritoryDetailPage />} /></Routes>
      </MemoryRouter>);
    });
    const field = container.querySelector('textarea');
    expect(field?.value).toBe('Valor anterior');
    await act(async () => { Simulate.change(field, { target: { value: 'Valor atualizado' } }); });
    await act(async () => { Simulate.blur(field); });
    const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toEqual({ regulatory_notes: 'Valor atualizado' });
    expect(field.value).toBe('Valor atualizado');
  });
});
