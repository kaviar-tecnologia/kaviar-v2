import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    admins: { findUnique: vi.fn() },
    legal_entities: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    accountant_entity_links: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  // Default: $transaction passes the mock itself as tx
  prismaMock.$transaction.mockImplementation((fn: Function) => fn(prismaMock));
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

const baseEntity = {
  id: 'entity-1',
  razao_social: 'KAVIAR Mobilidade LTDA',
  nome_fantasia: 'KAVIAR',
  cnpj: '12345678000199',
  entity_type: 'MATRIZ',
  parent_entity_id: null,
  uf: 'RJ',
  municipio: 'Rio de Janeiro',
  endereco: 'Rua Teste, 123',
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  parent: null,
  _count: { children: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'super@test.local', role: 'SUPER_ADMIN' };
  prismaMock.legal_entities.findMany.mockResolvedValue([baseEntity]);
  prismaMock.legal_entities.count.mockResolvedValue(1);
  prismaMock.legal_entities.findUnique.mockResolvedValue(baseEntity);
  prismaMock.legal_entities.create.mockResolvedValue(baseEntity);
  prismaMock.legal_entities.update.mockResolvedValue(baseEntity);
});

describe('GET /api/admin/accounting/entities', () => {
  it('should list entities with pagination', async () => {
    const res = await request(app).get('/api/admin/accounting/entities').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].cnpj).toBe('12345678000199');
    expect(res.body.pagination).toEqual({ page: 1, limit: 25, total: 1, totalPages: 1 });
  });

  it('should filter by entity_type', async () => {
    await request(app).get('/api/admin/accounting/entities?entity_type=FILIAL').expect(200);
    expect(prismaMock.legal_entities.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entity_type: 'FILIAL' }) }),
    );
  });

  it('should reject unauthenticated', async () => {
    authState.admin = null;
    const res = await request(app).get('/api/admin/accounting/entities').expect(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject non-super-admin', async () => {
    authState.admin = { id: 'a2', email: 'finance@test.local', role: 'FINANCE' };
    const res = await request(app).get('/api/admin/accounting/entities').expect(403);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/admin/accounting/entities/:id', () => {
  it('should return entity by id', async () => {
    prismaMock.legal_entities.findUnique.mockResolvedValue({ ...baseEntity, _count: { children: 2, accountant_links: 0 } });
    const res = await request(app).get('/api/admin/accounting/entities/entity-1').expect(200);
    expect(res.body.data.id).toBe('entity-1');
    expect(res.body.data.entity_type).toBe('MATRIZ');
  });

  it('should 404 if not found', async () => {
    prismaMock.legal_entities.findUnique.mockResolvedValue(null);
    await request(app).get('/api/admin/accounting/entities/missing').expect(404);
  });
});

describe('POST /api/admin/accounting/entities', () => {
  it('should create a new MATRIZ entity', async () => {
    prismaMock.legal_entities.findUnique.mockResolvedValue(null); // no duplicate CNPJ
    prismaMock.legal_entities.create.mockResolvedValue(baseEntity);
    const res = await request(app)
      .post('/api/admin/accounting/entities')
      .send({
        razao_social: 'KAVIAR Mobilidade LTDA',
        cnpj: '12345678000199',
        entity_type: 'MATRIZ',
      })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('entity-1');
  });

  it('should reject invalid CNPJ', async () => {
    const res = await request(app)
      .post('/api/admin/accounting/entities')
      .send({ razao_social: 'Test', cnpj: '123', entity_type: 'MATRIZ' })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject FILIAL without parent', async () => {
    prismaMock.legal_entities.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/admin/accounting/entities')
      .send({ razao_social: 'Filial', cnpj: '98765432000111', entity_type: 'FILIAL' })
      .expect(400);
    expect(res.body.error).toContain('Filial deve ter parent_entity_id');
  });
});

describe('PATCH /api/admin/accounting/entities/:id', () => {
  it('should update an entity', async () => {
    prismaMock.legal_entities.findUnique.mockResolvedValue(baseEntity);
    prismaMock.legal_entities.update.mockResolvedValue({ ...baseEntity, razao_social: 'New Name' });
    const res = await request(app)
      .patch('/api/admin/accounting/entities/entity-1')
      .send({ razao_social: 'New Name' })
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('should 404 if entity not found', async () => {
    prismaMock.legal_entities.findUnique.mockResolvedValue(null);
    await request(app)
      .patch('/api/admin/accounting/entities/missing')
      .send({ razao_social: 'Test' })
      .expect(404);
  });
});
