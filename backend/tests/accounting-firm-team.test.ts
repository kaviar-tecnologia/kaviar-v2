/**
 * Tests: Accounting Firm Team (Equipe do Escritório)
 * 
 * Validates:
 * - Existing users remain valid (backward compat)
 * - Team members without CRC can be created
 * - is_responsible_accountant can be set
 * - job_title and department are persisted
 * - Multiple users per firm
 * - Each user can have different scope
 * - Edit of new fields works
 * - Suspension/revocation continues working
 */

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

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => prismaMock),
}));

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
vi.mock('../src/services/accounting/accounting-audit', () => ({
  writeAccountingAuditTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/middlewares/accounting-rate-limit', () => ({
  inviteRateLimit: (_req: any, _res: any, next: any) => next(),
  reinviteRateLimit: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../src/services/accounting/accounting-invites.service', () => ({
  generateInviteToken: vi.fn().mockResolvedValue({ token: 'tok', hash: 'hash', expiresAt: new Date() }),
}));
vi.mock('../src/services/accounting/accounting-email.service', () => ({
  sendInviteEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../src/services/accounting/accounting-auth.service', () => ({}));

const { adminAccountingRoutes } = await import('../src/routes/admin-accounting');

const app = express();
app.use(express.json());
app.use('/api/admin/accounting', adminAccountingRoutes);

const FIRM_ID = '00000000-0000-0000-0000-000000000001';
const ACCT_ID = '00000000-0000-0000-0000-000000000002';
const ACCT_ID_2 = '00000000-0000-0000-0000-000000000003';

const baseFirm = { id: FIRM_ID, razao_social: 'Contabilidade Silva', document_number: '11222333000144', is_active: true };

const baseAccountant = {
  id: ACCT_ID,
  accounting_firm_id: FIRM_ID,
  nome_completo: 'João da Silva',
  email: 'joao@contabil.com',
  cpf: '12345678901',
  crc: 'CRC-RJ-100',
  crc_uf: 'RJ',
  job_title: null,
  department: null,
  is_responsible_accountant: false,
  status: 'ACTIVE',
  is_active: true,
  mfa_enabled: false,
  password_hash: 'hash',
  invited_at: new Date(),
  activated_at: new Date(),
  last_login_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  firm: baseFirm,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.accounting_firms.findUnique.mockResolvedValue(baseFirm);
});

// ══════════════════════════════════════════════════════════════════════════
// Existing user continues valid
// ══════════════════════════════════════════════════════════════════════════

describe('Backward compatibility', () => {
  it('existing accountant without new fields is returned with defaults', async () => {
    prismaMock.accountants.findMany.mockResolvedValue([baseAccountant]);
    prismaMock.accountants.count.mockResolvedValue(1);

    const res = await request(app).get('/api/admin/accounting/accountants');
    expect(res.status).toBe(200);
    expect(res.body.data[0].job_title).toBeNull();
    expect(res.body.data[0].department).toBeNull();
    expect(res.body.data[0].is_responsible_accountant).toBe(false);
  });

  it('existing accountant detail returns new fields with defaults', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(baseAccountant);

    const res = await request(app).get(`/api/admin/accounting/accountants/${ACCT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.job_title).toBeNull();
    expect(res.body.data.department).toBeNull();
    expect(res.body.data.is_responsible_accountant).toBe(false);
    // CRC still present
    expect(res.body.data.crc).toBe('CRC-RJ-100');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Create team member without CRC
// ══════════════════════════════════════════════════════════════════════════

describe('Create team member', () => {
  it('can create team member without CPF', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(null);
    prismaMock.accountants.create.mockImplementation(async ({ data }) => ({
      ...baseAccountant,
      ...data,
      id: ACCT_ID_2,
      firm: baseFirm,
    }));

    const res = await request(app)
      .post('/api/admin/accounting/accountants')
      .send({
        accounting_firm_id: FIRM_ID,
        nome_completo: 'Maria Financeiro',
        email: 'maria.financeiro@contabil.com',
        job_title: 'Financeiro',
        department: 'Financeiro',
      });

    expect(res.status).toBe(201);
    const createCall = prismaMock.accountants.create.mock.calls[0][0];
    expect(createCall.data.cpf).toBeNull();
  });

  it('can create member without CRC (auxiliar)', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(null); // no duplicate
    prismaMock.accountants.create.mockResolvedValue({
      ...baseAccountant,
      id: ACCT_ID_2,
      nome_completo: 'Maria Fiscal',
      email: 'maria@contabil.com',
      cpf: '98765432100',
      crc: null,
      crc_uf: null,
      job_title: 'Analista Fiscal',
      department: 'Fiscal',
      is_responsible_accountant: false,
      status: 'INVITED',
      is_active: false,
    });

    const res = await request(app)
      .post('/api/admin/accounting/accountants')
      .send({
        accounting_firm_id: FIRM_ID,
        nome_completo: 'Maria Fiscal',
        email: 'maria@contabil.com',
        cpf: '98765432100',
        job_title: 'Analista Fiscal',
        department: 'Fiscal',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.job_title).toBe('Analista Fiscal');
    expect(res.body.data.department).toBe('Fiscal');
    expect(res.body.data.crc).toBeNull();
    expect(res.body.data.is_responsible_accountant).toBe(false);
  });

  it('can mark as responsible accountant', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(null);
    prismaMock.accountants.create.mockResolvedValue({
      ...baseAccountant,
      crc: 'CRC-SP-200',
      crc_uf: 'SP',
      job_title: 'Contador',
      is_responsible_accountant: true,
    });

    const res = await request(app)
      .post('/api/admin/accounting/accountants')
      .send({
        accounting_firm_id: FIRM_ID,
        nome_completo: 'João da Silva',
        email: 'joao2@contabil.com',
        cpf: '11122233344',
        crc: 'CRC-SP-200',
        crc_uf: 'SP',
        job_title: 'Contador',
        is_responsible_accountant: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.is_responsible_accountant).toBe(true);
  });

  it('job_title and department are persisted in create call', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(null);
    prismaMock.accountants.create.mockImplementation(async ({ data }) => ({
      ...baseAccountant,
      ...data,
      id: ACCT_ID_2,
      firm: baseFirm,
    }));

    await request(app)
      .post('/api/admin/accounting/accountants')
      .send({
        accounting_firm_id: FIRM_ID,
        nome_completo: 'Carlos DP',
        email: 'carlos@contabil.com',
        cpf: '55566677788',
        job_title: 'Auxiliar de DP',
        department: 'Departamento Pessoal',
      });

    const createCall = prismaMock.accountants.create.mock.calls[0][0];
    expect(createCall.data.job_title).toBe('Auxiliar de DP');
    expect(createCall.data.department).toBe('Departamento Pessoal');
    expect(createCall.data.is_responsible_accountant).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Edit new fields
// ══════════════════════════════════════════════════════════════════════════

describe('Edit team member', () => {
  it('can update job_title and department', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(baseAccountant);
    prismaMock.accountants.update.mockResolvedValue({
      ...baseAccountant,
      job_title: 'Gerente Contábil',
      department: 'Contabilidade',
    });

    const res = await request(app)
      .patch(`/api/admin/accounting/accountants/${ACCT_ID}`)
      .send({ job_title: 'Gerente Contábil', department: 'Contabilidade' });

    expect(res.status).toBe(200);
    expect(res.body.data.job_title).toBe('Gerente Contábil');
    expect(res.body.data.department).toBe('Contabilidade');
  });

  it('can toggle is_responsible_accountant', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(baseAccountant);
    prismaMock.accountants.update.mockResolvedValue({
      ...baseAccountant,
      is_responsible_accountant: true,
    });

    const res = await request(app)
      .patch(`/api/admin/accounting/accountants/${ACCT_ID}`)
      .send({ is_responsible_accountant: true });

    expect(res.status).toBe(200);
    expect(res.body.data.is_responsible_accountant).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Multiple users per firm
// ══════════════════════════════════════════════════════════════════════════

describe('Multiple users per firm', () => {
  it('two users from same firm appear in listing', async () => {
    const user2 = {
      ...baseAccountant,
      id: ACCT_ID_2,
      nome_completo: 'Maria Fiscal',
      email: 'maria@contabil.com',
      cpf: '98765432100',
      job_title: 'Analista Fiscal',
      department: 'Fiscal',
    };

    prismaMock.accountants.findMany.mockResolvedValue([baseAccountant, user2]);
    prismaMock.accountants.count.mockResolvedValue(2);

    const res = await request(app).get('/api/admin/accounting/accountants');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].accounting_firm_id).toBe(FIRM_ID);
    expect(res.body.data[1].accounting_firm_id).toBe(FIRM_ID);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suspension continues working
// ══════════════════════════════════════════════════════════════════════════

describe('Status management unchanged', () => {
  it('suspension still works with new fields present', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue({
      ...baseAccountant,
      job_title: 'Analista',
      department: 'Fiscal',
    });
    prismaMock.accountants.update.mockResolvedValue({
      ...baseAccountant,
      job_title: 'Analista',
      department: 'Fiscal',
      status: 'SUSPENDED',
      is_active: false,
    });

    const res = await request(app)
      .patch(`/api/admin/accounting/accountants/${ACCT_ID}`)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUSPENDED');
    expect(res.body.data.is_active).toBe(false);
    // New fields preserved
    expect(res.body.data.job_title).toBe('Analista');
    expect(res.body.data.department).toBe('Fiscal');
  });
});
