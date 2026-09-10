import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('CORS allowlist', () => {
  it('aceita origens locais de desenvolvimento', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const devOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ];

    try {
      for (const origin of devOrigins) {
        const res = await request(app).get('/').set('Origin', origin);
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
      }
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('aceita https://ar.kaviar.com.br', async () => {
    const res = await request(app).get('/').set('Origin', 'https://ar.kaviar.com.br');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://ar.kaviar.com.br');
  });

  it('continua rejeitando origem não autorizada', async () => {
    const res = await request(app).get('/').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: 'CORS origin not allowed',
    });
  });

  it('mantém origens existentes autorizadas', async () => {
    const allowedOrigins = [
      'https://app.kaviar.com.br',
      'https://kaviar.com.br',
      'https://www.kaviar.com.br',
      'https://d29p7cirgjqbxl.cloudfront.net',
    ];

    for (const origin of allowedOrigins) {
      const res = await request(app).get('/').set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('em production continua bloqueando origem local não autorizada', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const res = await request(app).get('/').set('Origin', 'http://localhost:5174');
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        success: false,
        error: 'CORS origin not allowed',
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
