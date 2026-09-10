/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ArPlacesPage from '../pages/admin/ArPlacesPage';

vi.mock('@mui/icons-material', () => ({
  Add: () => null,
  Edit: () => null,
  Refresh: () => null,
}));

vi.mock('@mui/material', () => {
  const cleanProps = (props) => {
    const { sx, fullWidth, size, item, container, spacing, xs, md, maxWidth, minRows, startIcon, ...rest } = props;
    return rest;
  };
  const wrap = (Tag = 'div') => ({ children, ...props }) => React.createElement(Tag, cleanProps(props), children);
  const Button = ({ children, onClick, disabled, ...props }) =>
    React.createElement('button', { ...cleanProps(props), disabled, onClick }, children);
  const TextField = ({ label, value = '', onChange, select, multiline, minRows, children, ...props }) => {
    const domProps = cleanProps(props);
    if (select) {
      return React.createElement(
        'label',
        null,
        label,
        React.createElement('select', { ...domProps, 'aria-label': label, value, onChange }, children),
      );
    }
    if (multiline) {
      return React.createElement(
        'label',
        null,
        label,
        React.createElement('textarea', { ...domProps, rows: minRows || 3, 'aria-label': label, value, onChange }),
      );
    }
    return React.createElement(
      'label',
      null,
      label,
      React.createElement('input', { ...domProps, 'aria-label': label, value, onChange }),
    );
  };
  const MenuItem = ({ value, children }) => React.createElement('option', { value }, children);
  const Dialog = ({ open, children }) => (open ? React.createElement('div', null, children) : null);
  const Chip = ({ label }) => React.createElement('span', null, label);

  return {
    Alert: wrap(),
    Box: wrap(),
    Button,
    Card: wrap(),
    CardContent: wrap(),
    Chip,
    Dialog,
    DialogActions: wrap(),
    DialogContent: wrap(),
    DialogTitle: wrap('h2'),
    Grid: wrap(),
    MenuItem,
    Table: wrap('table'),
    TableBody: wrap('tbody'),
    TableCell: wrap('td'),
    TableHead: wrap('thead'),
    TableRow: wrap('tr'),
    TextField,
    Typography: wrap('p'),
  };
});

const { listArPlaces, createArPlace, getArPlaceById, updateArPlace, getArPlaceChangeRequest, approveArPlaceChangeRequest, rejectArPlaceChangeRequest, apiGet } = vi.hoisted(() => ({
  listArPlaces: vi.fn(),
  createArPlace: vi.fn(),
  getArPlaceById: vi.fn(),
  updateArPlace: vi.fn(),
  getArPlaceChangeRequest: vi.fn(),
  approveArPlaceChangeRequest: vi.fn(),
  rejectArPlaceChangeRequest: vi.fn(),
  apiGet: vi.fn(),
}));

vi.mock('../services/adminArPlacesService', () => ({
  listArPlaces,
  createArPlace,
  getArPlaceById,
  updateArPlace,
  getArPlaceChangeRequest,
  approveArPlaceChangeRequest,
  rejectArPlaceChangeRequest,
}));

vi.mock('../api', () => ({
  default: {
    get: apiGet,
  },
}));

function setRole(role) {
  localStorage.setItem('kaviar_admin_data', JSON.stringify({ role }));
}

function renderPage() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ArPlacesPage />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function inputByLabel(container, label) {
  const controls = container.querySelectorAll(`[aria-label="${label}"]`);
  return controls[controls.length - 1] || null;
}

function setControlValue(container, label, value) {
  const control = inputByLabel(container, label);
  act(() => {
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('ArPlacesPage runtime behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    listArPlaces.mockReset();
    createArPlace.mockReset();
    getArPlaceById.mockReset();
    updateArPlace.mockReset();
    getArPlaceChangeRequest.mockReset();
    approveArPlaceChangeRequest.mockReset();
    rejectArPlaceChangeRequest.mockReset();
    apiGet.mockReset();
    listArPlaces.mockResolvedValue({ data: [] });
    createArPlace.mockResolvedValue({ success: true });
    updateArPlace.mockResolvedValue({ success: true });
    getArPlaceChangeRequest.mockResolvedValue({ data: null });
    approveArPlaceChangeRequest.mockResolvedValue({ success: true });
    rejectArPlaceChangeRequest.mockResolvedValue({ success: true });
    apiGet.mockResolvedValue({ data: { data: [{ id: 't-1', name: 'Rio' }] } });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('SUPER_ADMIN vê criar/editar e transição permitida para DRAFT', async () => {
    setRole('SUPER_ADMIN');
    listArPlaces.mockResolvedValue({
      data: [{ id: 'p-1', name: 'Hotel X', place_id: 'hotel-x', type: 'HOTEL', city: 'Rio', state: 'RJ', status: 'DRAFT', territory: null }],
    });
    getArPlaceById.mockResolvedValue({
      data: {
        id: 'p-1',
        name: 'Hotel X',
        place_id: 'hotel-x',
        type: 'HOTEL',
        city: 'Rio',
        state: 'RJ',
        phone: '+5521999999999',
        whatsapp: null,
        website_url: 'https://hotel.example.com/',
        instagram_url: 'https://www.instagram.com/hotelx/',
        latitude: -22.9,
        longitude: -43.2,
        status: 'DRAFT',
        territory_id: null,
        contents: [],
      },
    });

    const { container, unmount } = renderPage();
    await flush();

    expect(container.textContent).toContain('KAVIAR AR · Locais AR');
    expect(container.textContent).toContain('Novo local');
    expect(container.textContent).toContain('Editar');

    const editBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Editar');
    act(() => editBtn.click());
    await flush();

    expect(container.textContent).toContain('Enviar para análise');
    expect(container.textContent).not.toContain('Aprovar');
    expect(container.textContent).not.toContain('Rejeitar');
    unmount();
  });

  it('TERRITORIAL_MANAGER abre criação e não vê APPROVE/REJECT', async () => {
    setRole('TERRITORIAL_MANAGER');
    listArPlaces.mockResolvedValue({
      data: [{ id: 'p-1', name: 'Hotel X', place_id: 'hotel-x', type: 'HOTEL', city: 'Rio', state: 'RJ', status: 'DRAFT', territory: null }],
    });
    getArPlaceById.mockResolvedValue({
      data: {
        id: 'p-1',
        name: 'Hotel X',
        place_id: 'hotel-x',
        type: 'HOTEL',
        city: 'Rio',
        state: 'RJ',
        phone: '+5521999999999',
        whatsapp: null,
        website_url: 'https://hotel.example.com/',
        instagram_url: 'https://www.instagram.com/hotelx/',
        latitude: -22.9,
        longitude: -43.2,
        status: 'DRAFT',
        territory_id: null,
        contents: [],
      },
    });

    const { container, unmount } = renderPage();
    await flush();

    const newBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Novo local');
    act(() => newBtn.click());
    await flush();
    expect(container.textContent).toContain('Novo Local AR');

    const editBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Editar');
    act(() => editBtn.click());
    await flush();
    expect(container.textContent).toContain('Enviar para análise');
    expect(container.textContent).not.toContain('Aprovar');
    expect(container.textContent).not.toContain('Rejeitar');
    unmount();
  });

  it('TERRITORIAL_OPERATOR não vê controles de escrita', async () => {
    setRole('TERRITORIAL_OPERATOR');
    listArPlaces.mockResolvedValue({
      data: [{ id: 'p-1', name: 'Hotel X', place_id: 'hotel-x', type: 'HOTEL', city: 'Rio', state: 'RJ', status: 'DRAFT', territory: null }],
    });

    const { container, unmount } = renderPage();
    await flush();

    expect(container.textContent).toContain('KAVIAR AR · Locais AR');
    expect(container.textContent).not.toContain('Novo local');
    expect(container.textContent).not.toContain('Editar');
    expect(container.textContent).not.toContain('Salvar');
    unmount();
  });

  it('criação envia payload com dados básicos e conteúdo pt-BR', async () => {
    setRole('SUPER_ADMIN');
    const { container, unmount } = renderPage();
    await flush();

    const newBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Novo local');
    act(() => newBtn.click());
    await flush();

    const createBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Criar');
    await act(async () => {
      createBtn.click();
    });

    expect(createArPlace).toHaveBeenCalledTimes(1);
    const createPayload = createArPlace.mock.calls[0][0];
    expect(createPayload).toMatchObject({
      type: 'HOTEL',
      content: { locale: 'pt-BR' },
    });
    expect(createPayload).toHaveProperty('place_id');
    expect(createPayload).toHaveProperty('name');
    expect(createPayload).toHaveProperty('city');
    expect(createPayload).toHaveProperty('state');
    expect(createPayload).toHaveProperty('phone', null);
    expect(createPayload).toHaveProperty('whatsapp', null);
    expect(createPayload).toHaveProperty('website_url', null);
    expect(createPayload).toHaveProperty('instagram_url', null);
    expect(createPayload).toHaveProperty('latitude');
    expect(createPayload).toHaveProperty('longitude');
    expect(createPayload.status).toBeUndefined();
    unmount();
  });

  it('formulário carrega contatos atuais ao editar', async () => {
    setRole('SUPER_ADMIN');
    listArPlaces.mockResolvedValue({
      data: [{ id: 'p-1', name: 'Hotel X', place_id: 'hotel-x', type: 'HOTEL', city: 'Rio', state: 'RJ', status: 'DRAFT', territory: null }],
    });
    getArPlaceById.mockResolvedValue({
      data: {
        id: 'p-1',
        name: 'Hotel X',
        place_id: 'hotel-x',
        type: 'HOTEL',
        city: 'Rio',
        state: 'RJ',
        address: 'Rua A',
        phone: '+552133334444',
        whatsapp: '+5521999999999',
        website_url: 'https://hotel.example.com/',
        instagram_url: 'https://www.instagram.com/hotelx/',
        latitude: -22.9,
        longitude: -43.2,
        status: 'DRAFT',
        territory_id: null,
        contents: [],
      },
    });

    const { container, unmount } = renderPage();
    await flush();

    const editBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Editar');
    act(() => editBtn.click());
    await flush();

    expect(inputByLabel(container, 'Telefone')?.value).toBe('+552133334444');
    expect(inputByLabel(container, 'WhatsApp')?.value).toBe('+5521999999999');
    expect(inputByLabel(container, 'Site')?.value).toBe('https://hotel.example.com/');
    expect(inputByLabel(container, 'Instagram')?.value).toBe('https://www.instagram.com/hotelx/');
    unmount();
  });

  it('edição chama update correspondente', async () => {
    setRole('SUPER_ADMIN');
    listArPlaces.mockResolvedValue({
      data: [{ id: 'p-1', name: 'Hotel X', place_id: 'hotel-x', type: 'HOTEL', city: 'Rio', state: 'RJ', status: 'DRAFT', territory: null }],
    });
    getArPlaceById.mockResolvedValue({
      data: { id: 'p-1', name: 'Hotel X', place_id: 'hotel-x', type: 'HOTEL', city: 'Rio', state: 'RJ', latitude: -22.9, longitude: -43.2, status: 'DRAFT', territory_id: null, contents: [] },
    });

    const { container, unmount } = renderPage();
    await flush();

    const editBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Editar');
    act(() => editBtn.click());
    await flush();

    const saveBtn = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Salvar');
    await act(async () => {
      saveBtn.click();
    });

    expect(updateArPlace).toHaveBeenCalledTimes(1);
    const [id, updatePayload] = updateArPlace.mock.calls[0];
    expect(id).toBe('p-1');
    expect(updatePayload).toMatchObject({
      place_id: 'hotel-x',
      status: 'DRAFT',
      content: { locale: 'pt-BR' },
    });
    unmount();
  });
});
