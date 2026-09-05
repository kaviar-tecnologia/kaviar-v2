/**
 * Tests — Portal do Contador: guarda de transição para PROOF_UPLOADED.
 *
 * Garante que o endpoint POST /obligations/:id/transition:
 *  1. PAID → PROOF_UPLOADED SEM proof_storage_key retorna 400 (bloqueado);
 *  2. PAID → PROOF_UPLOADED COM proof_storage_key continua funcionando (200);
 *  3. demais transições permanecem inalteradas (ex.: SENT_TO_COMPANY exige boleto;
 *     VIEWED → SCHEDULED funciona; transição inválida segue 400).
 *
 * Reutiliza a máquina de estados existente (VALID_TRANSITIONS) — a guarda é apenas
 * uma regra de negócio adicional, não um novo lifecycle.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ENTITY_ID = '00000000-0000-0000-0000-000000000001';

// ── Hoisted mocks ───────────────────────────────────────────────────────

const { prismaMock, accessState } = vi.hoisted(() => {
  const prismaMock: any = {
    accounting_payment_obligations: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return {
    prismaMock,
    accessState: { allow: true },
  };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => prismaMock),
  accounting_obligation_status: {},
}));

vi.mock('../src/middlewares/accountant-auth', () => ({
  authenticateAccountant: (req: any, _res: any, next: any) => {
    req.accountant = { id: 'acct-1', email: 'contador@test.com' };
    next();
  },
}));

vi.mock('../src/services/accounting/accounting-documents.service', () => ({
  verifyEntityAccess: vi.fn(async () => ({ id: 'link-1' })),
  getAccessibleEntityIds: vi.fn(async () => [ENTITY_ID]),
}));

vi.mock('../src/services/accounting/accounting-access.service', () => ({
  requireAccountingAccess: vi.fn(async () => {
    if (!accessState.allow) {
      const err: any = new Error('AccessDenied');
      err.name = 'AccessDeniedError';
      throw err;
    }
  }),
  handleAccessError: vi.fn((err: any, res: any) => {
    if (err?.name === 'AccessDeniedError') {
      res.status(403).json({ success: false, error: 'Acesso negado' });
      return true;
    }
    return false;
  }),
  AccessDeniedError: class AccessDeniedError extends Error {},
  EntityNotFoundError: class EntityNotFoundError extends Error {},
  getAccessibleEntityIdsForScope: vi.fn(async () => [ENTITY_ID]),
}));

vi.mock('../src/services/accounting/accounting-obligation-tokens.service', () => ({
  generateObligationToken: vi.fn(async () => ({ token: 'tok-123', expiresAt: new Date('2099-01-01') })),
  auditObligation: vi.fn(async () => {}),
}));

vi.mock('../src/services/accounting/accounting-document-storage.service', () => ({
  generatePresignedGetUrl: vi.fn(async () => ({ downloadUrl: 'https://s3.example.com/file', expiresInSeconds: 3600 })),
  getFileExtension: vi.fn(() => '.pdf'),
  MAX_FILE_SIZE: 20 * 1024 * 1024,
}));

vi.mock('../src/services/email/email.service', () => ({
  emailService: { sendMail: vi.fn(async () => ({ ok: true })) },
}));

const { accountantObligationsRoutes } = await import('../src/routes/accountant-obligations');
const { authenticateAccountant } = await import('../src/middlewares/accountant-auth');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/accountant/portal', authenticateAccountant as any, accountantObligationsRoutes);
  return app;
}

function obligation(overrides: any = {}) {
  return {
    id: 'ob-1',
    legal_entity_id: ENTITY_ID,
    obligation_type: 'HONORARIOS',
    status: 'PAID',
    action_owner: 'COMPANY',
    description: 'Honorários Ago/2026',
    amount_cents: 40500,
    due_date: new Date('2026-08-20'),
    boleto_storage_key: 'accounting-boletos/ob-1/x.pdf',
    proof_storage_key: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  accessState.allow = true;
  // update devolve o objeto atualizado (com include no router)
  prismaMock.accounting_payment_obligations.update.mockImplementation(async ({ data }: any) => ({
    ...obligation(),
    ...data,
    legal_entity: { id: ENTITY_ID, razao_social: 'KAVIAR', cnpj: '67783601000199' },
    created_by_accountant: { nome_completo: 'Contador Teste' },
  }));
});

const url = '/api/accountant/portal/obligations/ob-1/transition';

describe('POST /obligations/:id/transition — guarda PROOF_UPLOADED', () => {
  it('(1) PAID → PROOF_UPLOADED SEM comprovante retorna 400 e NÃO grava', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      obligation({ status: 'PAID', proof_storage_key: null })
    );
    const res = await request(makeApp()).post(url).send({ status: 'PROOF_UPLOADED' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/comprovante/i);
    expect(prismaMock.accounting_payment_obligations.update).not.toHaveBeenCalled();
  });

  it('(2) PAID → PROOF_UPLOADED COM comprovante existente funciona (200)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      obligation({ status: 'PAID', proof_storage_key: 'accounting-proofs/ob-1/p.pdf', proof_filename: 'p.pdf' })
    );
    const res = await request(makeApp()).post(url).send({ status: 'PROOF_UPLOADED' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PROOF_UPLOADED');
    expect(prismaMock.accounting_payment_obligations.update).toHaveBeenCalledTimes(1);
  });
});

describe('POST /obligations/:id/transition — demais transições inalteradas', () => {
  it('(3a) SENT_TO_COMPANY continua exigindo boleto (400 sem boleto)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      obligation({ status: 'DRAFT', action_owner: 'ACCOUNTANT', boleto_storage_key: null })
    );
    const res = await request(makeApp()).post(url).send({ status: 'SENT_TO_COMPANY' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boleto/i);
    expect(prismaMock.accounting_payment_obligations.update).not.toHaveBeenCalled();
  });

  it('(3b) SENT_TO_COMPANY com boleto funciona (200)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      obligation({ status: 'DRAFT', action_owner: 'ACCOUNTANT', boleto_storage_key: 'k' })
    );
    const res = await request(makeApp()).post(url).send({ status: 'SENT_TO_COMPANY' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SENT_TO_COMPANY');
  });

  it('(3c) VIEWED → SCHEDULED funciona sem exigir comprovante (200)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      obligation({ status: 'VIEWED', action_owner: 'COMPANY', proof_storage_key: null })
    );
    const res = await request(makeApp()).post(url).send({ status: 'SCHEDULED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SCHEDULED');
  });

  it('(3d) VIEWED → PAID funciona sem exigir comprovante (200)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      obligation({ status: 'VIEWED', action_owner: 'COMPANY', proof_storage_key: null })
    );
    const res = await request(makeApp()).post(url).send({ status: 'PAID' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PAID');
  });

  it('(3e) transição inválida continua bloqueada (400)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      obligation({ status: 'DRAFT', action_owner: 'ACCOUNTANT' })
    );
    const res = await request(makeApp()).post(url).send({ status: 'PROOF_UPLOADED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Transição inválida/i);
    expect(prismaMock.accounting_payment_obligations.update).not.toHaveBeenCalled();
  });

  it('(3f) REJECTED → PROOF_UPLOADED também exige comprovante (400 sem arquivo)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      obligation({ status: 'REJECTED', action_owner: 'COMPANY', proof_storage_key: null })
    );
    const res = await request(makeApp()).post(url).send({ status: 'PROOF_UPLOADED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/comprovante/i);
    expect(prismaMock.accounting_payment_obligations.update).not.toHaveBeenCalled();
  });
});
