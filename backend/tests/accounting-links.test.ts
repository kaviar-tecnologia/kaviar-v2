import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    admins: { findUnique: vi.fn() },
    accountants: { findUnique: vi.fn() },
    legal_entities: { findUnique: vi.fn() },
    accountant_entity_links: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    prismaMock,
    authState: {
      admin: { id: 'admin-1', email: 'super@test.local', role: 'SUPER_ADMIN' } as any,
    },
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    if (!authState.admin) return _res.status(401).json({ success: false, error: 'Não autenticado' });
    req.admin = authState.admin;
    next();
  },
  requireSuperAdmin: (req: any, res: any, next: any) => {
    if (!req.admin || req.admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    next();
  },
  requireRole: (roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.admin || !roles.includes(req.admin.role)) return res.status(403).json({ success: false, error: 'Acesso negado' });
    next();
  },
}));
vi.mock('../src/utils/audit', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

const { adminAccountingRoutes } = await import('../src/routes/admin-accounting');

const app = express();
app.use(express.json());
app.use('/api/admin/accounting', adminAccountingRoutes);

const ACCT_ID = '00000000-0000-0000-0000-000000000001';
const ENTITY_ID = '00000000-0000-0000-0000-000000000002';
const LINK_ID = '00000000-0000-0000-0000-000000000003';
const ADMIN_ID = 'admin-1';

const baseLink = {
  id: LINK_ID,
  accountant_id: ACCT_ID,
  legal_entity_id: ENTITY_ID,
  scope: 'FISCAL',
  can_view: true,
  can_upload: false,
  can_download: true,
  can_request_correction: false,
  can_mark_processed: false,
  can_close_period: false,
  inherits_children: false,
  starts_at: new Date('2026-01-01T00:00:00.000Z'),
  ends_at: null,
  status: 'ACTIVE',
  created_by_admin_id: ADMIN_ID,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  accountant: { id: ACCT_ID, nome_completo: 'João da Silva' },
  legal_entity: { id: ENTITY_ID, razao_social: 'KAVIAR LTDA', cnpj: '12345678000199', entity_type: 'MATRIZ' },
  created_by_admin: { id: ADMIN_ID, name: 'Super Admin', role: 'SUPER_ADMIN' },
};

const baseAccountant = { id: ACCT_ID, nome_completo: 'João', is_active: true };
const baseEntity = { id: ENTITY_ID, razao_social: 'KAVIAR', is_active: true };

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'super@test.local', role: 'SUPER_ADMIN' };
  prismaMock.accountant_entity_links.findMany.mockResolvedValue([baseLink]);
  prismaMock.accountant_entity_links.count.mockResolvedValue(1);
  prismaMock.accountant_entity_links.findUnique.mockResolvedValue(baseLink);
  prismaMock.accountant_entity_links.findFirst.mockResolvedValue(null);
  prismaMock.accountant_entity_links.create.mockResolvedValue(baseLink);
  prismaMock.accountant_entity_links.update.mockResolvedValue(baseLink);
  prismaMock.accountants.findUnique.mockResolvedValue(baseAccountant);
  prismaMock.legal_entities.findUnique.mockResolvedValue(baseEntity);
});

describe('GET /api/admin/accounting/links', () => {
  it('should list links with pagination', async () => {
    const res = await request(app).get('/api/admin/accounting/links').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].scope).toBe('FISCAL');
    expect(res.body.data[0].accountant.nome_completo).toBe('João da Silva');
    expect(res.body.data[0].legal_entity.razao_social).toBe('KAVIAR LTDA');
    expect(res.body.pagination.total).toBe(1);
  });

  it('should filter by accountant_id', async () => {
    await request(app).get(`/api/admin/accounting/links?accountant_id=${ACCT_ID}`).expect(200);
    expect(prismaMock.accountant_entity_links.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountant_id: ACCT_ID }) }),
    );
  });

  it('should filter by scope', async () => {
    await request(app).get('/api/admin/accounting/links?scope=CONTABIL').expect(200);
    expect(prismaMock.accountant_entity_links.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ scope: 'CONTABIL' }) }),
    );
  });
});

describe('GET /api/admin/accounting/links/:id', () => {
  it('should return link by id', async () => {
    const res = await request(app).get(`/api/admin/accounting/links/${LINK_ID}`).expect(200);
    expect(res.body.data.id).toBe(LINK_ID);
    expect(res.body.data.can_view).toBe(true);
  });

  it('should 404 if not found', async () => {
    prismaMock.accountant_entity_links.findUnique.mockResolvedValue(null);
    await request(app).get('/api/admin/accounting/links/missing').expect(404);
  });
});

describe('POST /api/admin/accounting/links', () => {
  it('should create a new link', async () => {
    const res = await request(app)
      .post('/api/admin/accounting/links')
      .send({
        accountant_id: ACCT_ID,
        legal_entity_id: ENTITY_ID,
        scope: 'FISCAL',
        starts_at: '2026-01-01T00:00:00.000Z',
      })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('should reject duplicate active link', async () => {
    prismaMock.accountant_entity_links.findFirst.mockResolvedValue(baseLink);
    const res = await request(app)
      .post('/api/admin/accounting/links')
      .send({
        accountant_id: ACCT_ID,
        legal_entity_id: ENTITY_ID,
        scope: 'FISCAL',
        starts_at: '2026-01-01T00:00:00.000Z',
      })
      .expect(400);
    expect(res.body.error).toContain('Já existe um vínculo ativo');
  });

  it('should reject invalid scope', async () => {
    const res = await request(app)
      .post('/api/admin/accounting/links')
      .send({
        accountant_id: ACCT_ID,
        legal_entity_id: ENTITY_ID,
        scope: 'INVALID',
        starts_at: '2026-01-01T00:00:00.000Z',
      })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject if accountant not found', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/admin/accounting/links')
      .send({
        accountant_id: '00000000-0000-0000-0000-000000000099',
        legal_entity_id: ENTITY_ID,
        scope: 'CONTABIL',
        starts_at: '2026-01-01T00:00:00.000Z',
      })
      .expect(400);
    expect(res.body.error).toContain('Contador não encontrado');
  });
});

describe('PATCH /api/admin/accounting/links/:id', () => {
  it('should update a link', async () => {
    prismaMock.accountant_entity_links.findUnique.mockResolvedValue(baseLink);
    prismaMock.accountant_entity_links.update.mockResolvedValue({ ...baseLink, can_upload: true });
    const res = await request(app)
      .patch(`/api/admin/accounting/links/${LINK_ID}`)
      .send({ can_upload: true })
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('should update status to REVOKED', async () => {
    prismaMock.accountant_entity_links.findUnique.mockResolvedValue(baseLink);
    prismaMock.accountant_entity_links.update.mockResolvedValue({ ...baseLink, status: 'REVOKED' });
    const res = await request(app)
      .patch(`/api/admin/accounting/links/${LINK_ID}`)
      .send({ status: 'REVOKED' })
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('should 404 if link not found', async () => {
    prismaMock.accountant_entity_links.findUnique.mockResolvedValue(null);
    await request(app)
      .patch('/api/admin/accounting/links/missing')
      .send({ can_upload: true })
      .expect(404);
  });
});
