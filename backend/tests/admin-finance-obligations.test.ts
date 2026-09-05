/**
 * Tests — Admin Finance Obligations (Contas a Pagar / Portal do Contador).
 *
 * Cobre os requisitos:
 *  1. obrigação SENT_TO_COMPANY aparece em Contas a Pagar
 *  2. obrigação DRAFT não aparece para a empresa
 *  3. valor e vencimento exibidos corretamente
 *  4. origem Portal do Contador identificada
 *  5. status traduzido corretamente para a interface
 *  6. SUPER_ADMIN acessa
 *  7. FINANCE acessa
 *  8. perfil não autorizado bloqueado
 *  9. estado vazio funciona
 * 10. (frontend) seções de gratificação/repasses intactas — cobertas por não alterar seus endpoints
 *
 * + Isolamento por legal_entity (KAVIAR) e downloads seguros (presigned URL).
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KAVIAR_ID = '884907ff-5b04-4dfa-8613-a23216c5fa25';
const OTHER_ID = '00000000-0000-0000-0000-0000000000ff';

// ── Hoisted state/mocks ─────────────────────────────────────────────────

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    accounting_payment_obligations: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  return {
    prismaMock,
    authState: {
      // Controla o comportamento dos middlewares mockados.
      role: 'SUPER_ADMIN' as string | null,
    },
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

// Mock dos middlewares de auth: authenticateAdmin injeta req.admin; allowFinanceAccess
// aplica a MESMA regra de papéis do middleware real (SUPER_ADMIN, EXECUTIVE_ADMIN, FINANCE).
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, res: any, next: any) => {
    if (!authState.role) return res.status(401).json({ success: false, error: 'Token ausente' });
    req.admin = { id: 'admin-1', role: authState.role };
    next();
  },
  allowFinanceAccess: (req: any, res: any, next: any) => {
    const allowed = ['SUPER_ADMIN', 'EXECUTIVE_ADMIN', 'FINANCE'];
    if (!allowed.includes(req.admin?.role)) {
      return res.status(403).json({ success: false, error: 'Acesso negado. Permissão insuficiente.' });
    }
    next();
  },
}));

vi.mock('../src/services/accounting/accounting-document-storage.service', () => ({
  generatePresignedGetUrl: vi.fn(async () => ({ downloadUrl: 'https://s3.example.com/secure-file', expiresInSeconds: 3600 })),
}));

const { adminFinanceObligationsRoutes, serializeForAdmin, statusLabel } = await import('../src/routes/admin-finance-obligations');

// ── App ─────────────────────────────────────────────────────────────────

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/finance/obligations', adminFinanceObligationsRoutes);
  return app;
}

// ── Fixtures ────────────────────────────────────────────────────────────

function ob(overrides: any = {}) {
  return {
    id: overrides.id || 'ob-1',
    legal_entity_id: KAVIAR_ID,
    obligation_type: 'HONORARIOS',
    status: 'SENT_TO_COMPANY',
    action_owner: 'COMPANY',
    description: 'Honorários Contábeis',
    beneficiary: 'LOCAL CONTÁBIL LTDA',
    reference_number: null,
    competence_month: 9,
    competence_year: 2026,
    amount_cents: 100000,
    issued_at: new Date('2026-09-01T12:00:00Z'),
    due_date: new Date('2026-09-10T12:00:00Z'),
    boleto_storage_key: null,
    boleto_filename: null,
    proof_storage_key: null,
    proof_filename: null,
    invoice_pdf_storage_key: null,
    invoice_pdf_filename: null,
    invoice_xml_storage_key: null,
    invoice_xml_filename: null,
    invoice_number: null,
    invoice_series: null,
    sent_at: new Date('2026-09-02T12:00:00Z'),
    viewed_at: null,
    scheduled_at: null,
    paid_at: null,
    proof_uploaded_at: null,
    verified_at: null,
    reconciled_at: null,
    rejection_reason: null,
    created_at: new Date('2026-09-01T12:00:00Z'),
    updated_at: new Date('2026-09-02T12:00:00Z'),
    created_by_accountant: { nome_completo: 'Contador Teste' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.role = 'SUPER_ADMIN';
});

// ── Unit: serializer / traduções ────────────────────────────────────────

describe('serializeForAdmin', () => {
  it('(3) exibe valor e vencimento corretamente', () => {
    const s = serializeForAdmin(ob());
    expect(s.amount_display).toBe('R$ 1000,00');
    expect(s.due_date).toBe('2026-09-10');
    expect(s.competence_display).toBe('09/2026');
  });

  it('(4) identifica origem Portal do Contador', () => {
    const s = serializeForAdmin(ob());
    expect(s.origin).toBe('PORTAL_CONTADOR');
    expect(s.origin_label).toBe('Portal do Contador');
  });

  it('(5) traduz status para a interface', () => {
    expect(statusLabel('SENT_TO_COMPANY')).toBe('Aguardando pagamento');
    expect(statusLabel('VIEWED')).toBe('Aguardando pagamento');
    expect(statusLabel('SCHEDULED')).toBe('Pagamento agendado');
    expect(statusLabel('PAID')).toBe('Pago');
    expect(statusLabel('PROOF_UPLOADED')).toBe('Comprovante enviado');
    expect(statusLabel('VERIFIED')).toBe('Verificado');
    expect(statusLabel('RECONCILED')).toBe('Conciliado');
    expect(statusLabel('REJECTED')).toBe('Comprovante rejeitado');
  });

  it('nunca expõe storage keys, tokens ou hashes', () => {
    const s: any = serializeForAdmin(ob({ boleto_storage_key: 'secret/key.pdf', boleto_filename: 'b.pdf' }));
    expect(s.boleto_storage_key).toBeUndefined();
    expect(s.has_boleto).toBe(true);
    expect(s.boleto_filename).toBe('b.pdf');
    expect(JSON.stringify(s)).not.toContain('secret/key.pdf');
  });

  it('marca corretamente existência de NF (has_invoice)', () => {
    expect(serializeForAdmin(ob({ invoice_number: '123' })).has_invoice).toBe(true);
    expect(serializeForAdmin(ob({ invoice_pdf_storage_key: 'k' })).has_invoice).toBe(true);
    expect(serializeForAdmin(ob()).has_invoice).toBe(false);
  });
});

// ── Integração via supertest ────────────────────────────────────────────

describe('GET /api/admin/finance/obligations', () => {
  it('(1) obrigação SENT_TO_COMPANY aparece na lista', async () => {
    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([ob({ status: 'SENT_TO_COMPANY' })]);
    const res = await request(makeApp()).get('/api/admin/finance/obligations');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('SENT_TO_COMPANY');
    expect(res.body.data[0].status_label).toBe('Aguardando pagamento');
  });

  it('(2) DRAFT não é consultado (filtro exclui DRAFT no where)', async () => {
    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([]);
    await request(makeApp()).get('/api/admin/finance/obligations');
    const call = prismaMock.accounting_payment_obligations.findMany.mock.calls[0][0];
    expect(call.where.legal_entity_id).toBe(KAVIAR_ID);
    expect(call.where.status.in).not.toContain('DRAFT');
    expect(call.where.status.in).toContain('SENT_TO_COMPANY');
  });

  it('(2b) filtro status=DRAFT é ignorado (não vaza DRAFT)', async () => {
    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([]);
    await request(makeApp()).get('/api/admin/finance/obligations?status=DRAFT');
    const call = prismaMock.accounting_payment_obligations.findMany.mock.calls[0][0];
    expect(call.where.status.in).not.toContain('DRAFT');
    // cai no conjunto completo de visíveis
    expect(call.where.status.in).toContain('SENT_TO_COMPANY');
  });

  it('(6) SUPER_ADMIN acessa', async () => {
    authState.role = 'SUPER_ADMIN';
    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([]);
    const res = await request(makeApp()).get('/api/admin/finance/obligations');
    expect(res.status).toBe(200);
  });

  it('(7) FINANCE acessa', async () => {
    authState.role = 'FINANCE';
    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([]);
    const res = await request(makeApp()).get('/api/admin/finance/obligations');
    expect(res.status).toBe(200);
  });

  it('(8) perfil não autorizado é bloqueado (403)', async () => {
    authState.role = 'OPERATOR';
    const res = await request(makeApp()).get('/api/admin/finance/obligations');
    expect(res.status).toBe(403);
  });

  it('(8b) sem autenticação é bloqueado (401)', async () => {
    authState.role = null;
    const res = await request(makeApp()).get('/api/admin/finance/obligations');
    expect(res.status).toBe(401);
  });

  it('(9) estado vazio retorna lista vazia', async () => {
    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([]);
    const res = await request(makeApp()).get('/api/admin/finance/obligations');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('filtra sempre pela legal_entity KAVIAR', async () => {
    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([]);
    await request(makeApp()).get('/api/admin/finance/obligations');
    const call = prismaMock.accounting_payment_obligations.findMany.mock.calls[0][0];
    expect(call.where.legal_entity_id).toBe(KAVIAR_ID);
  });
});

describe('GET /api/admin/finance/obligations/summary', () => {
  it('calcula cards de resumo', async () => {
    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([
      { status: 'SENT_TO_COMPANY', due_date: new Date(Date.now() + 3 * 86400000), amount_cents: 100000 },
      { status: 'SENT_TO_COMPANY', due_date: new Date(Date.now() - 5 * 86400000), amount_cents: 50000 },
      { status: 'PAID', due_date: new Date(), amount_cents: 20000 },
    ]);
    const res = await request(makeApp()).get('/api/admin/finance/obligations/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.pending).toBe(2);
    expect(res.body.data.overdue).toBe(1);
    expect(res.body.data.due_soon).toBe(1);
    expect(res.body.data.paid).toBe(1);
    expect(res.body.data.total_pending_cents).toBe(150000);
    expect(res.body.data.total_pending_display).toBe('R$ 1500,00');
  });
});

describe('GET /api/admin/finance/obligations/:id/download-boleto', () => {
  it('retorna presigned URL segura quando há boleto', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      ob({ boleto_storage_key: 'accounting-boletos/ob-1/x.pdf', boleto_filename: 'boleto.pdf' })
    );
    const res = await request(makeApp()).get('/api/admin/finance/obligations/ob-1/download-boleto');
    expect(res.status).toBe(200);
    expect(res.body.data.download_url).toBe('https://s3.example.com/secure-file');
    expect(res.body.data.filename).toBe('boleto.pdf');
    // Nunca vaza a storage key
    expect(JSON.stringify(res.body)).not.toContain('accounting-boletos');
  });

  it('404 quando não há boleto', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(ob({ boleto_storage_key: null }));
    const res = await request(makeApp()).get('/api/admin/finance/obligations/ob-1/download-boleto');
    expect(res.status).toBe(404);
  });

  it('isolamento: obrigação de outra legal_entity retorna 404', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      ob({ legal_entity_id: OTHER_ID, boleto_storage_key: 'k', boleto_filename: 'b.pdf' })
    );
    const res = await request(makeApp()).get('/api/admin/finance/obligations/ob-1/download-boleto');
    expect(res.status).toBe(404);
  });

  it('não permite baixar de obrigação DRAFT (não visível)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(
      ob({ status: 'DRAFT', boleto_storage_key: 'k', boleto_filename: 'b.pdf' })
    );
    const res = await request(makeApp()).get('/api/admin/finance/obligations/ob-1/download-boleto');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/finance/obligations/:id (detalhe)', () => {
  it('DRAFT não é acessível pela empresa (404)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(ob({ status: 'DRAFT' }));
    const res = await request(makeApp()).get('/api/admin/finance/obligations/ob-1');
    expect(res.status).toBe(404);
  });

  it('SENT_TO_COMPANY é acessível', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(ob({ status: 'SENT_TO_COMPANY' }));
    const res = await request(makeApp()).get('/api/admin/finance/obligations/ob-1');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SENT_TO_COMPANY');
  });
});
