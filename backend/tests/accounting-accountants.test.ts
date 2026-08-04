import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    admins: { findUnique: vi.fn() },
    accounting_firms: { findUnique: vi.fn() },
    accountants: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
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

const FIRM_ID = '00000000-0000-0000-0000-000000000001';
const ACCT_ID = '00000000-0000-0000-0000-000000000002';

const baseFirm = {
  id: FIRM_ID,
  razao_social: 'Contabilidade Silva',
  document_number: '11222333000144',
  is_active: true,
};

const baseAccountant = {
  id: ACCT_ID,
  accounting_firm_id: FIRM_ID,
  nome_completo: 'João da Silva',
  email: 'joao@contabil.com',
  cpf: '12345678901',
  crc: 'CRC-RJ-100',
  crc_uf: 'RJ',
  status: 'INVITED',
  is_active: true,
  mfa_enabled: false,
  invited_at: new Date('2026-01-01T00:00:00.000Z'),
  activated_at: null,
  last_access_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  firm: baseFirm,
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'super@test.local', role: 'SUPER_ADMIN' };
  prismaMock.accountants.findMany.mockResolvedValue([baseAccountant]);
  prismaMock.accountants.count.mockResolvedValue(1);
  prismaMock.accountants.findUnique.mockResolvedValue(baseAccountant);
  prismaMock.accountants.create.mockResolvedValue(baseAccountant);
  prismaMock.accountants.update.mockResolvedValue(baseAccountant);
  prismaMock.accounting_firms.findUnique.mockResolvedValue(baseFirm);
});

describe('GET /api/admin/accounting/accountants', () => {
  it('should list accountants with pagination', async () => {
    const res = await request(app).get('/api/admin/accounting/accountants').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].nome_completo).toBe('João da Silva');
    expect(res.body.data[0].firm.razao_social).toBe('Contabilidade Silva');
    expect(res.body.pagination.total).toBe(1);
  });

  it('should filter by status', async () => {
    await request(app).get('/api/admin/accounting/accountants?status=ACTIVE').expect(200);
    expect(prismaMock.accountants.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
    );
  });

  it('should filter by firm', async () => {
    await request(app).get(`/api/admin/accounting/accountants?accounting_firm_id=${FIRM_ID}`).expect(200);
    expect(prismaMock.accountants.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accounting_firm_id: FIRM_ID }) }),
    );
  });
});

describe('GET /api/admin/accounting/accountants/:id', () => {
  it('should return accountant by id', async () => {
    const res = await request(app).get(`/api/admin/accounting/accountants/${ACCT_ID}`).expect(200);
    expect(res.body.data.id).toBe(ACCT_ID);
    expect(res.body.data.cpf).toBe('12345678901');
  });

  it('should 404 if not found', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(null);
    await request(app).get('/api/admin/accounting/accountants/missing').expect(404);
  });
});

describe('POST /api/admin/accounting/accountants', () => {
  it('should create a new accountant', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(null); // no duplicate email/cpf
    prismaMock.accounting_firms.findUnique.mockResolvedValue(baseFirm);
    prismaMock.accountants.create.mockResolvedValue(baseAccountant);
    const res = await request(app)
      .post('/api/admin/accounting/accountants')
      .send({
        accounting_firm_id: FIRM_ID,
        nome_completo: 'João da Silva',
        email: 'joao@contabil.com',
        cpf: '12345678901',
      })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('INVITED');
  });

  it('should reject invalid CPF', async () => {
    const res = await request(app)
      .post('/api/admin/accounting/accountants')
      .send({
        accounting_firm_id: FIRM_ID,
        nome_completo: 'Test',
        email: 'test@test.com',
        cpf: '123',
      })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject duplicate email', async () => {
    prismaMock.accountants.findUnique
      .mockResolvedValueOnce({ id: 'existing', email: 'joao@contabil.com' }) // email check
    prismaMock.accounting_firms.findUnique.mockResolvedValue(baseFirm);
    const res = await request(app)
      .post('/api/admin/accounting/accountants')
      .send({
        accounting_firm_id: FIRM_ID,
        nome_completo: 'Test',
        email: 'joao@contabil.com',
        cpf: '99988877766',
      })
      .expect(400);
    expect(res.body.error).toContain('E-mail já cadastrado');
  });
});

describe('PATCH /api/admin/accounting/accountants/:id', () => {
  it('should update an accountant', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(baseAccountant);
    prismaMock.accountants.update.mockResolvedValue({ ...baseAccountant, nome_completo: 'Updated' });
    const res = await request(app)
      .patch(`/api/admin/accounting/accountants/${ACCT_ID}`)
      .send({ nome_completo: 'Updated' })
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('should 404 if not found', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(null);
    await request(app)
      .patch('/api/admin/accounting/accountants/missing')
      .send({ nome_completo: 'Test' })
      .expect(404);
  });
});
