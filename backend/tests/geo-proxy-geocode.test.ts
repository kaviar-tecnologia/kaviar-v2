import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('GOOGLE_PLACES_KEY', 'test-google-key');

vi.mock('../src/middlewares/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

const { default: geoProxyRoutes } = await import('../src/routes/geo-proxy');

const app = express();
app.use('/api/geo-proxy', geoProxyRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geo proxy forward geocoding', () => {
  it('converte endereço em latitude e longitude sem expor a chave ao frontend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            formatted_address: 'Estrada das Furnas, 3001 - Itanhangá, Rio de Janeiro - RJ, Brasil',
            place_id: 'google-place-123',
            geometry: {
              location: {
                lat: -22.9818024,
                lng: -43.2942632,
              },
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .get('/api/geo-proxy/geocode')
      .query({ address: 'Estr. das Furnas, 3001, Itanhangá, Rio de Janeiro, RJ, Brasil' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        latitude: -22.9818024,
        longitude: -43.2942632,
        formatted_address: 'Estrada das Furnas, 3001 - Itanhangá, Rio de Janeiro - RJ, Brasil',
        place_id: 'google-place-123',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain('maps.googleapis.com/maps/api/geocode/json');
    expect(requestedUrl).toContain('language=pt-BR');
    expect(requestedUrl).toContain('region=br');
    expect(requestedUrl).toContain('key=test-google-key');
  });

  it('retorna 404 quando o endereço não é encontrado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
      }),
    );

    const res = await request(app)
      .get('/api/geo-proxy/geocode')
      .query({ address: 'Endereço inexistente 12345' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Endereço não encontrado' });
  });

  it('rejeita endereço vazio sem consultar o provedor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app).get('/api/geo-proxy/geocode').query({ address: '  ' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
