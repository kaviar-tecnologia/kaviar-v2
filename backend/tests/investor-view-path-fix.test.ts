/**
 * Test: investorView middleware path matching fix.
 * Validates that blockedPaths are correctly compared using req.baseUrl + req.path.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import investorView from '../src/middlewares/investorView';

function buildApp(role: string) {
  const app = express();
  app.use(express.json());

  // Simulate authenticateAdmin setting req.admin before investorView
  app.use((req: any, _res, next) => {
    req.admin = { id: 'user-1', email: 'test@test.local', name: 'Test', role };
    next();
  });

  // Mount on /api just like the real app
  app.use('/api', investorView);

  // Dummy handlers to confirm passthrough
  app.get('/api/admin/dashboard', (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/drivers/approve', (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/payments', (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/exports/csv', (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/documents/download/123', (_req, res) => res.json({ ok: true }));
  app.get('/api/passengers/documents/abc', (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/drivers', (_req, res) => res.json({ ok: true }));
  app.post('/api/admin/drivers', (_req, res) => res.json({ ok: true }));
  app.patch('/api/admin/drivers/123', (_req, res) => res.json({ ok: true }));
  app.delete('/api/admin/drivers/123', (_req, res) => res.json({ ok: true }));

  return app;
}

describe('investorView — ANGEL_VIEWER blocked paths (GET)', () => {
  const app = buildApp('ANGEL_VIEWER');

  it('403 on GET /api/admin/drivers/approve', async () => {
    const res = await request(app).get('/api/admin/drivers/approve');
    expect(res.status).toBe(403);
  });

  it('403 on GET /api/admin/payments', async () => {
    const res = await request(app).get('/api/admin/payments');
    expect(res.status).toBe(403);
  });

  it('403 on GET /api/admin/exports/csv (startsWith match)', async () => {
    const res = await request(app).get('/api/admin/exports/csv');
    expect(res.status).toBe(403);
  });

  it('403 on GET /api/admin/documents/download/123', async () => {
    const res = await request(app).get('/api/admin/documents/download/123');
    expect(res.status).toBe(403);
  });

  it('403 on GET /api/passengers/documents/abc (PII)', async () => {
    const res = await request(app).get('/api/passengers/documents/abc');
    expect(res.status).toBe(403);
  });
});

describe('investorView — INVESTOR_VIEW blocked paths (GET)', () => {
  const app = buildApp('INVESTOR_VIEW');

  it('403 on GET /api/admin/payments', async () => {
    const res = await request(app).get('/api/admin/payments');
    expect(res.status).toBe(403);
  });

  it('403 on GET /api/admin/exports/csv', async () => {
    const res = await request(app).get('/api/admin/exports/csv');
    expect(res.status).toBe(403);
  });
});

describe('investorView — ANGEL_VIEWER allowed GET paths', () => {
  const app = buildApp('ANGEL_VIEWER');

  it('passes through GET /api/admin/dashboard', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('passes through GET /api/admin/drivers (list, not blocked)', async () => {
    const res = await request(app).get('/api/admin/drivers');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('investorView — ANGEL_VIEWER POST/PATCH/DELETE blocked', () => {
  const app = buildApp('ANGEL_VIEWER');

  it('403 on POST', async () => {
    const res = await request(app).post('/api/admin/drivers');
    expect(res.status).toBe(403);
  });

  it('403 on PATCH', async () => {
    const res = await request(app).patch('/api/admin/drivers/123');
    expect(res.status).toBe(403);
  });

  it('403 on DELETE', async () => {
    const res = await request(app).delete('/api/admin/drivers/123');
    expect(res.status).toBe(403);
  });
});

describe('investorView — operational role not affected', () => {
  const app = buildApp('SUPER_ADMIN');

  it('SUPER_ADMIN passes GET blocked path', async () => {
    const res = await request(app).get('/api/admin/payments');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('SUPER_ADMIN passes POST', async () => {
    const res = await request(app).post('/api/admin/drivers');
    expect(res.status).toBe(200);
  });

  const opApp = buildApp('TERRITORIAL_OPERATOR');

  it('TERRITORIAL_OPERATOR passes GET blocked path', async () => {
    const res = await request(opApp).get('/api/admin/payments');
    expect(res.status).toBe(200);
  });

  it('TERRITORIAL_OPERATOR passes POST', async () => {
    const res = await request(opApp).post('/api/admin/drivers');
    expect(res.status).toBe(200);
  });
});
