import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    admins: { findUnique: vi.fn() },
    accounting_firms: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    accountants: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
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

const baseFirm = {
  id: 'firm-1',
  razao_social: 'Contabilidade Silva LTDA',
  nome_fantasia: 'Contábil Silva',
  document_type: 'CNPJ',
  document_number: '11222333000144',
  crc: 'CRC-RJ-123456',
  crc_uf: 'RJ',
  email: 'contato@silva.com',
  telefone: '21999998888',
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  _count: { accountants: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'super@test.local', role: 'SUPER_ADMIN' };
  prismaMock.accounting_firms.findMany.mockResolvedValue([baseFirm]);
  prismaMock.accounting_firms.count.mockResolvedValue(1);
  prismaMock.accounting_firms.findUnique.mockResolvedValue(baseFirm);
  prismaMock.accounting_firms.create.mockResolvedValue(baseFirm);
  prismaMock.accounting_firms.update.mockResolvedValue(baseFirm);
});

describe('GET /api/admin/accounting/firms', () => {
  it('should list firms with pagination', async () => {
    const res = await request(app).get('/api/admin/accounting/firms').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].document_number).toBe('11222333000144');
    expect(res.body.pagination.total).toBe(1);
  });

  it('should filter by is_active', async () => {
    await request(app).get('/api/admin/accounting/firms?is_active=true').expect(200);
    expect(prismaMock.accounting_firms.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ is_active: true }) }),
    );
  });
});

describe('GET /api/admin/accounting/firms/:id', () => {
  it('should return firm by id', async () => {
    const res = await request(app).get('/api/admin/accounting/firms/firm-1').expect(200);
    expect(res.body.data.id).toBe('firm-1');
    expect(res.body.data.accountants_count).toBe(3);
  });

  it('should 404 if not found', async () => {
    prismaMock.accounting_firms.findUnique.mockResolvedValue(null);
    await request(app).get('/api/admin/accounting/firms/missing').expect(404);
  });
});

describe('POST /api/admin/accounting/firms', () => {
  it('should create a new firm', async () => {
    prismaMock.accounting_firms.findUnique.mockResolvedValue(null); // no duplicate
    prismaMock.accounting_firms.create.mockResolvedValue(baseFirm);
    const res = await request(app)
      .post('/api/admin/accounting/firms')
      .send({
        razao_social: 'Contabilidade Silva LTDA',
        document_type: 'CNPJ',
        document_number: '11222333000144',
        email: 'contato@silva.com',
      })
      .expect(201);
    expect(res.body.success).toBe(true);
  });

  it('should reject invalid document number', async () => {
    const res = await request(app)
      .post('/api/admin/accounting/firms')
      .send({
        razao_social: 'Test',
        document_type: 'CNPJ',
        document_number: '123',
        email: 'test@test.com',
      })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject missing email', async () => {
    const res = await request(app)
      .post('/api/admin/accounting/firms')
      .send({
        razao_social: 'Test',
        document_type: 'CNPJ',
        document_number: '11222333000144',
      })
      .expect(400);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/admin/accounting/firms/:id', () => {
  it('should update a firm', async () => {
    prismaMock.accounting_firms.findUnique.mockResolvedValue(baseFirm);
    prismaMock.accounting_firms.update.mockResolvedValue({ ...baseFirm, razao_social: 'Updated' });
    const res = await request(app)
      .patch('/api/admin/accounting/firms/firm-1')
      .send({ razao_social: 'Updated' })
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('should 404 if firm not found', async () => {
    prismaMock.accounting_firms.findUnique.mockResolvedValue(null);
    await request(app)
      .patch('/api/admin/accounting/firms/missing')
      .send({ razao_social: 'Test' })
      .expect(404);
  });
});
