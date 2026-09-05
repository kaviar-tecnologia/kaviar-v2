/**
 * Tests — Portal do Contador: Meu Perfil (GET /me e PATCH /me).
 *
 * Cobre:
 *  - GET /me autenticado retorna o próprio perfil;
 *  - sem autenticação → 401;
 *  - PATCH /me atualiza nome (permitido);
 *  - PATCH /me atualiza job_title/department (permitidos);
 *  - PATCH /me ignora role/status/permissões/vínculo/escritório/email (whitelist);
 *  - PATCH /me usa SEMPRE o id do JWT (accountant_id no corpo é ignorado);
 *  - nome vazio → 400; corpo sem campos editáveis → 400;
 *  - audit trail é escrito no update.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SELF_ID = 'acct-self';
const OTHER_ID = 'acct-other';

const { prismaMock, authState, auditSpy } = vi.hoisted(() => {
  const prismaMock: any = {
    accountants: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
  };
  return {
    prismaMock,
    authState: { authenticated: true },
    auditSpy: vi.fn(async () => {}),
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('../src/middlewares/accountant-auth', () => ({
  authenticateAccountant: (req: any, res: any, next: any) => {
    if (!authState.authenticated) return res.status(401).json({ success: false, error: 'Token ausente' });
    req.accountant = { id: SELF_ID, email: 'self@test.com', sessionId: 'sess-1' };
    next();
  },
}));

vi.mock('../src/services/accounting/accounting-auth.service', () => ({
  // Router importa authService (namespace) e AccountingAuthError.
  forgotPassword: vi.fn(async () => null),
  resetPassword: vi.fn(async () => {}),
  activate: vi.fn(async () => {}),
  login: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
  AccountingAuthError: class AccountingAuthError extends Error {
    statusCode: number; code: string;
    constructor(message: string, statusCode = 400, code = 'ERR') { super(message); this.statusCode = statusCode; this.code = code; }
  },
}));

vi.mock('../src/services/accounting/accounting-email.service', () => ({
  sendPasswordResetEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../src/services/accounting/accounting-audit', () => ({
  writeAccountingAuditTx: auditSpy,
}));

vi.mock('../src/middlewares/accounting-rate-limit', () => ({
  forgotPasswordRateLimit: (_req: any, _res: any, next: any) => next(),
}));

const { accountantAuthRoutes } = await import('../src/routes/accountant-auth');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/accountant/auth', accountantAuthRoutes);
  return app;
}

function fullAccountant(overrides: any = {}) {
  return {
    id: SELF_ID,
    email: 'self@test.com',
    nome_completo: 'João Contador',
    cpf: '12345678900',
    crc: 'RJ-123',
    crc_uf: 'RJ',
    job_title: 'Analista',
    department: 'Fiscal',
    is_responsible_accountant: false,
    status: 'ACTIVE',
    mfa_enabled: false,
    last_login_at: new Date('2026-09-01T10:00:00Z'),
    firm: { id: 'firm-1', razao_social: 'Escritório X', nome_fantasia: 'X', crc: 'RJ-9', crc_uf: 'RJ', telefone: '21999' },
    entity_links: [
      {
        id: 'link-1', scope: 'FINANCEIRO', is_primary: true,
        can_view: true, can_upload: false, can_download: true,
        can_request_correction: false, can_mark_processed: false, can_close_period: false,
        legal_entity: { id: 'le-1', razao_social: 'Empresa Y', nome_fantasia: 'Y', cnpj: '11222333000144' },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.authenticated = true;
  prismaMock.accountants.update.mockImplementation(async ({ where, data }: any) => fullAccountant({ id: where.id, ...data }));
});

describe('GET /api/accountant/auth/me', () => {
  it('autenticado retorna o próprio perfil (sem campos internos)', async () => {
    prismaMock.accountants.findUnique.mockResolvedValue(fullAccountant());
    const res = await request(makeApp()).get('/api/accountant/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(SELF_ID);
    expect(res.body.data.email).toBe('self@test.com');
    expect(res.body.data.firm.razao_social).toBe('Escritório X');
    expect(res.body.data.entity_links[0].can_close_period).toBe(false);
    // Nunca expõe password_hash / campos internos
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|token_hash|refresh_token/);
  });

  it('sem autenticação → 401', async () => {
    authState.authenticated = false;
    const res = await request(makeApp()).get('/api/accountant/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/accountant/auth/me — whitelist', () => {
  it('atualiza nome (permitido) + escreve audit trail', async () => {
    const res = await request(makeApp()).patch('/api/accountant/auth/me').send({ nome_completo: 'João Silva' });
    expect(res.status).toBe(200);
    expect(res.body.data.nome_completo).toBe('João Silva');
    const updateArg = prismaMock.accountants.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: SELF_ID });
    expect(updateArg.data).toEqual({ nome_completo: 'João Silva' });
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0][1].action).toBe('ACCOUNTANT_PROFILE_UPDATED');
  });

  it('atualiza job_title e department (permitidos)', async () => {
    const res = await request(makeApp()).patch('/api/accountant/auth/me').send({ job_title: 'Gerente', department: 'Contábil' });
    expect(res.status).toBe(200);
    const updateArg = prismaMock.accountants.update.mock.calls[0][0];
    expect(updateArg.data).toEqual({ job_title: 'Gerente', department: 'Contábil' });
  });

  it('ignora role/status/permissões/vínculo/escritório/email (whitelist)', async () => {
    const res = await request(makeApp()).patch('/api/accountant/auth/me').send({
      nome_completo: 'Novo Nome',
      role: 'ADMIN',
      status: 'SUSPENDED',
      is_responsible_accountant: true,
      can_close_period: true,
      accounting_firm_id: 'outro-escritorio',
      email: 'hacker@evil.com',
      entity_links: [{ id: 'x' }],
      password_hash: 'x',
    });
    expect(res.status).toBe(200);
    const updateArg = prismaMock.accountants.update.mock.calls[0][0];
    // Apenas o campo whitelisted foi para o update
    expect(updateArg.data).toEqual({ nome_completo: 'Novo Nome' });
    expect(updateArg.data).not.toHaveProperty('role');
    expect(updateArg.data).not.toHaveProperty('status');
    expect(updateArg.data).not.toHaveProperty('email');
    expect(updateArg.data).not.toHaveProperty('accounting_firm_id');
    expect(updateArg.data).not.toHaveProperty('can_close_period');
    expect(updateArg.data).not.toHaveProperty('password_hash');
  });

  it('usa SEMPRE o id do JWT — accountant_id/id no corpo é ignorado', async () => {
    const res = await request(makeApp()).patch('/api/accountant/auth/me').send({
      id: OTHER_ID, accountant_id: OTHER_ID, nome_completo: 'Tentando editar outro',
    });
    expect(res.status).toBe(200);
    const updateArg = prismaMock.accountants.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: SELF_ID });
    expect(updateArg.where.id).not.toBe(OTHER_ID);
  });

  it('nome vazio → 400 e não grava', async () => {
    const res = await request(makeApp()).patch('/api/accountant/auth/me').send({ nome_completo: '   ' });
    expect(res.status).toBe(400);
    expect(prismaMock.accountants.update).not.toHaveBeenCalled();
  });

  it('sem campos editáveis → 400', async () => {
    const res = await request(makeApp()).patch('/api/accountant/auth/me').send({ role: 'ADMIN', email: 'x@y.com' });
    expect(res.status).toBe(400);
    expect(prismaMock.accountants.update).not.toHaveBeenCalled();
  });

  it('sem autenticação → 401', async () => {
    authState.authenticated = false;
    const res = await request(makeApp()).patch('/api/accountant/auth/me').send({ nome_completo: 'X' });
    expect(res.status).toBe(401);
    expect(prismaMock.accountants.update).not.toHaveBeenCalled();
  });

  it('permite limpar job_title/department (null)', async () => {
    const res = await request(makeApp()).patch('/api/accountant/auth/me').send({ job_title: '', department: '' });
    expect(res.status).toBe(200);
    const updateArg = prismaMock.accountants.update.mock.calls[0][0];
    expect(updateArg.data).toEqual({ job_title: null, department: null });
  });
});
