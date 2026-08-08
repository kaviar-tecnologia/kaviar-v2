/**
 * Tests for Portal do Contador — Scope & Permission Enforcement
 *
 * Validates that requireAccountingAccess correctly enforces:
 * - COMPLETO scope → access to all modules
 * - Specific scopes → only matching modules
 * - Permissions (can_view, can_upload, can_download, can_mark_processed, can_close_period)
 */

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const { prismaMock, authState, linkState } = vi.hoisted(() => {
  const prismaMock: any = {
    accountants: { findUnique: vi.fn() },
    accountant_sessions: { findFirst: vi.fn() },
    accountant_entity_links: { findFirst: vi.fn(), findMany: vi.fn() },
    legal_entities: { findUnique: vi.fn(), findMany: vi.fn() },
    accounting_company_documents: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    accounting_document_types: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    accounting_company_document_files: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    accounting_payment_obligations: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    accounting_competencies: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    accounting_competency_documents: { create: vi.fn() },
    accounting_certificates: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    accounting_powers_of_attorney: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    accounting_recurring_templates: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    accounting_automation_config: { findMany: vi.fn(), upsert: vi.fn() },
    accounting_automation_log: { findMany: vi.fn() },
    accounting_obligation_access_tokens: { findFirst: vi.fn() },
    accounting_obligation_audit: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prismaMock.$transaction.mockImplementation((fn: Function) => fn(prismaMock));

  return {
    prismaMock,
    authState: {
      accountant: { id: 'acct-1', email: 'contador@test.com', sessionId: 'sess-1' } as any,
    },
    linkState: {
      current: null as any,
    },
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => prismaMock),
  accounting_document_scan_status: {
    NOT_SCANNED: 'NOT_SCANNED',
    CLEAN: 'CLEAN',
    INFECTED: 'INFECTED',
  },
  accounting_obligation_status: {},
}));

vi.mock('../src/middlewares/accountant-auth', () => ({
  authenticateAccountant: (req: any, _res: any, next: any) => {
    if (!authState.accountant) return _res.status(401).json({ success: false, error: 'Não autenticado' });
    req.accountant = authState.accountant;
    next();
  },
}));

vi.mock('../src/services/accounting/accounting-documents.service', () => ({
  verifyEntityAccess: vi.fn(async () => linkState.current),
  getAccessibleEntityIds: vi.fn(async () => linkState.current ? ['00000000-0000-0000-0000-000000000001'] : []),
  getNextVersionNumber: vi.fn(async () => 1),
}));

vi.mock('../src/services/accounting/accounting-document-storage.service', () => ({
  validateFileMetadata: vi.fn(),
  generateStorageKey: vi.fn(() => 'test-key'),
  generatePresignedGetUrl: vi.fn(async () => ({ downloadUrl: 'https://s3.example.com/file', expiresInSeconds: 3600 })),
  getFileExtension: vi.fn(() => '.pdf'),
  MAX_VERSIONS_PER_DOCUMENT: 10,
  MAX_FILE_SIZE: 50 * 1024 * 1024,
  ALLOWED_MIME_TYPES: new Set(['application/pdf']),
  ALLOWED_EXTENSIONS: new Set(['.pdf']),
}));

vi.mock('../src/services/accounting/accounting-documents-validation', () => ({
  createCompanyDocumentSchema: { parse: vi.fn((d: any) => d) },
  updateCompanyDocumentSchema: { parse: vi.fn((d: any) => d) },
  listCompanyDocumentsQuerySchema: {
    parse: vi.fn((d: any) => ({ page: 1, limit: 20, ...d })),
    shape: { category: {} },
  },
  VALID_STATUS_TRANSITIONS: { DRAFT: ['SENT'] },
  paginationSchema: { extend: vi.fn(() => ({ parse: vi.fn((d: any) => ({ page: 1, limit: 20, ...d })) })) },
}));

vi.mock('../src/services/accounting/accounting-documents-serializers', () => ({
  serializeCompanyDocument: vi.fn((d: any) => d),
  serializeDocumentFile: vi.fn((d: any) => d),
  serializeDocumentType: vi.fn((d: any) => d),
}));

vi.mock('../src/services/accounting/accounting-obligation-tokens.service', () => ({
  generateObligationToken: vi.fn(async () => ({ token: 'tok-123', expiresAt: new Date('2099-01-01') })),
  auditObligation: vi.fn(async () => {}),
}));

vi.mock('../src/services/email/email.service', () => ({
  emailService: { sendMail: vi.fn(async () => ({ ok: true })) },
}));

vi.mock('../src/services/accounting/accounting-fiscal-health.service', () => ({
  computeFiscalHealth: vi.fn(async () => ({ overall: 'HEALTHY', score: 100, summary: {} })),
}));

vi.mock('../src/services/accounting/accounting-pendencias.service', () => ({
  computePendencias: vi.fn(async () => []),
  getPendenciasSummary: vi.fn(async () => ({ total: 0 })),
}));

vi.mock('../src/services/accounting/accounting-automation.service', () => ({
  runRecurringAutomation: vi.fn(async () => ({ created: 0 })),
}));

vi.mock('../src/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [{ has_rides: true, total_rides: '0', settled_rides: '0', total_revenue: '0', total_fees: '0', total_driver_earnings: '0', total: '0', cnpj: '67783601000199' }] })) },
}));

// ── Import routes ──────────────────────────────────────────────────────

const { accountantDocumentRoutes } = await import('../src/routes/accountant-documents');
const { accountantObligationsRoutes } = await import('../src/routes/accountant-obligations');
const { accountantCompetenciesRoutes } = await import('../src/routes/accountant-competencies');
const { accountantRepresentationRoutes } = await import('../src/routes/accountant-representation');
const { accountantRidesReportRoutes } = await import('../src/routes/accountant-rides-report');
const { accountantAutomationRoutes } = await import('../src/routes/accountant-automation');
const { authenticateAccountant } = await import('../src/middlewares/accountant-auth');

// ── Express app ────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/accountant/portal', authenticateAccountant as any, accountantDocumentRoutes);
app.use('/api/accountant/portal', authenticateAccountant as any, accountantObligationsRoutes);
app.use('/api/accountant/portal', authenticateAccountant as any, accountantCompetenciesRoutes);
app.use('/api/accountant/portal', authenticateAccountant as any, accountantRepresentationRoutes);
app.use('/api/accountant/portal', authenticateAccountant as any, accountantRidesReportRoutes);
app.use('/api/accountant/portal', authenticateAccountant as any, accountantAutomationRoutes);

// ── Helpers ────────────────────────────────────────────────────────────

function makeLink(overrides: Partial<{
  scope: string;
  can_view: boolean;
  can_upload: boolean;
  can_download: boolean;
  can_request_correction: boolean;
  can_mark_processed: boolean;
  can_close_period: boolean;
}> = {}) {
  return {
    id: 'link-1',
    accountant_id: 'acct-1',
    legal_entity_id: '00000000-0000-0000-0000-000000000001',
    scope: 'COMPLETO',
    can_view: true,
    can_upload: true,
    can_download: true,
    can_request_correction: true,
    can_mark_processed: true,
    can_close_period: true,
    inherits_children: false,
    is_primary: true,
    starts_at: new Date('2020-01-01'),
    ends_at: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

const BASE_URL = '/api/accountant/portal';
const ENTITY_ID = '00000000-0000-0000-0000-000000000001';

// ── Mock data ──────────────────────────────────────────────────────────

const mockDoc = {
  id: 'doc-1',
  legal_entity_id: ENTITY_ID,
  document_type_id: 'dt-1',
  status: 'DRAFT',
  document_type: { code: 'CND', name: 'CND', category: 'FISCAL', renewal_alert_days: 30 },
  legal_entity: { id: ENTITY_ID, razao_social: 'Test Corp', cnpj: '12345678000100' },
  files: [],
  _count: { files: 0 },
};

const mockObligation = {
  id: 'ob-1',
  legal_entity_id: ENTITY_ID,
  obligation_type: 'HONORARIOS',
  status: 'DRAFT',
  description: 'Honorários Jan/2026',
  amount_cents: 150000,
  due_date: new Date('2026-02-10'),
  action_owner: 'ACCOUNTANT',
  created_at: new Date(),
  updated_at: new Date(),
  legal_entity: { id: ENTITY_ID, razao_social: 'Test Corp', cnpj: '12345678000100' },
  created_by_accountant: { id: 'acct-1', nome_completo: 'João Silva' },
};

const mockCompetency = {
  id: 'comp-1',
  legal_entity_id: ENTITY_ID,
  month: 1,
  year: 2026,
  status: 'OPEN',
  action_owner: 'ACCOUNTANT',
  created_at: new Date(),
  updated_at: new Date(),
  legal_entity: { id: ENTITY_ID, razao_social: 'Test Corp', cnpj: '12345678000100' },
  responsible_accountant: { id: 'acct-1', nome_completo: 'João Silva' },
  _count: { documents: 0, obligations: 0 },
};

const mockCertificate = {
  id: 'cert-1',
  legal_entity_id: ENTITY_ID,
  certificate_type: 'E_CNPJ_A1',
  mode: 'METADATA_ONLY',
  status: 'ACTIVE',
  holder_name: 'Test Corp',
  expires_at: new Date('2027-01-01'),
  created_at: new Date(),
  updated_at: new Date(),
  legal_entity: { id: ENTITY_ID, razao_social: 'Test Corp', cnpj: '12345678000100' },
  responsible_accountant: { id: 'acct-1', nome_completo: 'João Silva' },
};

beforeEach(() => {
  vi.clearAllMocks();
  linkState.current = makeLink();
});

// ════════════════════════════════════════════════════════════════════════
// COMPLETO → should access all modules normally
// ════════════════════════════════════════════════════════════════════════

describe('COMPLETO scope → full access', () => {
  beforeEach(() => {
    linkState.current = makeLink({ scope: 'COMPLETO' });
  });

  it('can view a FISCAL document', async () => {
    prismaMock.accounting_company_documents.findUnique.mockResolvedValue(mockDoc);
    const res = await request(app).get(`${BASE_URL}/documents/doc-1`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('can view an obligation (FINANCEIRO module)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(mockObligation);
    const res = await request(app).get(`${BASE_URL}/obligations/ob-1`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('can view a competency (CONTABIL module)', async () => {
    prismaMock.accounting_competencies.findUnique.mockResolvedValue({
      ...mockCompetency,
      documents: [],
      obligations: [],
    });
    const res = await request(app).get(`${BASE_URL}/competencies/comp-1`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('can view a certificate (SOCIETARIO module)', async () => {
    prismaMock.accounting_certificates.findUnique.mockResolvedValue(mockCertificate);
    const res = await request(app).get(`${BASE_URL}/certificates/cert-1`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// FINANCEIRO scope → access financial, blocked from others
// ════════════════════════════════════════════════════════════════════════

describe('FINANCEIRO scope', () => {
  beforeEach(() => {
    linkState.current = makeLink({ scope: 'FINANCEIRO' });
  });

  it('can access an obligation (permitted)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(mockObligation);
    const res = await request(app).get(`${BASE_URL}/obligations/ob-1`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('receives 403 when trying to access a FISCAL document', async () => {
    prismaMock.accounting_company_documents.findUnique.mockResolvedValue(mockDoc); // category: FISCAL
    const res = await request(app).get(`${BASE_URL}/documents/doc-1`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/escopo/i);
  });

  it('receives 403 when trying to access a certificate (SOCIETARIO)', async () => {
    prismaMock.accounting_certificates.findUnique.mockResolvedValue(mockCertificate);
    const res = await request(app).get(`${BASE_URL}/certificates/cert-1`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('receives 403 when trying to access a competency (CONTABIL)', async () => {
    prismaMock.accounting_competencies.findUnique.mockResolvedValue({
      ...mockCompetency,
      documents: [],
      obligations: [],
    });
    const res = await request(app).get(`${BASE_URL}/competencies/comp-1`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// FISCAL scope → access fiscal documents, blocked from financial
// ════════════════════════════════════════════════════════════════════════

describe('FISCAL scope', () => {
  beforeEach(() => {
    linkState.current = makeLink({ scope: 'FISCAL' });
  });

  it('can access a FISCAL document (permitted)', async () => {
    prismaMock.accounting_company_documents.findUnique.mockResolvedValue(mockDoc); // category: FISCAL
    const res = await request(app).get(`${BASE_URL}/documents/doc-1`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('receives 403 when trying to access an obligation (FINANCEIRO)', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(mockObligation);
    const res = await request(app).get(`${BASE_URL}/obligations/ob-1`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('receives 403 when trying to access a SOCIETARIO document', async () => {
    const societarioDoc = {
      ...mockDoc,
      document_type: { ...mockDoc.document_type, category: 'SOCIETARIO' },
    };
    prismaMock.accounting_company_documents.findUnique.mockResolvedValue(societarioDoc);
    const res = await request(app).get(`${BASE_URL}/documents/doc-1`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('receives 403 when trying to create a competency (CONTABIL)', async () => {
    const res = await request(app)
      .post(`${BASE_URL}/competencies`)
      .send({ legal_entity_id: ENTITY_ID, month: 1, year: 2026 });
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Permission enforcement: can_view, can_upload, can_download
// ════════════════════════════════════════════════════════════════════════

describe('Permission: can_view=false → read blocked', () => {
  beforeEach(() => {
    linkState.current = makeLink({ scope: 'COMPLETO', can_view: false });
  });

  it('blocks viewing a document', async () => {
    prismaMock.accounting_company_documents.findUnique.mockResolvedValue(mockDoc);
    const res = await request(app).get(`${BASE_URL}/documents/doc-1`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permissão/i);
  });

  it('blocks viewing an obligation', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(mockObligation);
    const res = await request(app).get(`${BASE_URL}/obligations/ob-1`);
    expect(res.status).toBe(403);
  });

  it('blocks viewing a certificate', async () => {
    prismaMock.accounting_certificates.findUnique.mockResolvedValue(mockCertificate);
    const res = await request(app).get(`${BASE_URL}/certificates/cert-1`);
    expect(res.status).toBe(403);
  });
});

describe('Permission: can_upload=false → upload/create blocked', () => {
  beforeEach(() => {
    linkState.current = makeLink({ scope: 'COMPLETO', can_upload: false });
  });

  it('blocks creating a document', async () => {
    prismaMock.accounting_document_types.findUnique.mockResolvedValue({
      id: 'dt-1', is_active: true, category: 'FISCAL',
    });
    const res = await request(app)
      .post(`${BASE_URL}/documents`)
      .send({ legal_entity_id: ENTITY_ID, document_type_id: 'dt-1' });
    expect(res.status).toBe(403);
  });

  it('blocks creating an obligation', async () => {
    const res = await request(app)
      .post(`${BASE_URL}/obligations`)
      .send({
        legal_entity_id: ENTITY_ID,
        obligation_type: 'HONORARIOS',
        description: 'Honorários mensais',
        amount_cents: 10000,
        due_date: '2026-03-01',
      });
    expect(res.status).toBe(403);
  });

  it('blocks creating a certificate', async () => {
    const res = await request(app)
      .post(`${BASE_URL}/certificates`)
      .send({
        legal_entity_id: ENTITY_ID,
        certificate_type: 'E_CNPJ_A1',
        holder_name: 'Test Corp LTDA',
        expires_at: '2027-01-01T00:00:00.000Z',
      });
    expect(res.status).toBe(403);
  });
});

describe('Permission: can_download=false → download blocked', () => {
  beforeEach(() => {
    linkState.current = makeLink({ scope: 'COMPLETO', can_download: false });
  });

  it('blocks downloading a document file', async () => {
    prismaMock.accounting_company_document_files.findFirst.mockResolvedValue({
      id: 'file-1',
      document_id: 'doc-1',
      storage_key: 'key',
      original_filename: 'test.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024,
      scan_status: 'NOT_SCANNED',
      document: {
        id: 'doc-1',
        legal_entity_id: ENTITY_ID,
        document_type: { category: 'FISCAL' },
      },
    });
    const res = await request(app).get(`${BASE_URL}/documents/doc-1/files/file-1/download`);
    expect(res.status).toBe(403);
  });

  it('blocks downloading obligation proof', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue({
      ...mockObligation,
      proof_storage_key: 'proof-key',
      proof_filename: 'proof.pdf',
    });
    const res = await request(app).get(`${BASE_URL}/obligations/ob-1/download-proof`);
    expect(res.status).toBe(403);
  });

  it('blocks downloading obligation boleto', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue({
      ...mockObligation,
      boleto_storage_key: 'boleto-key',
      boleto_filename: 'boleto.pdf',
    });
    const res = await request(app).get(`${BASE_URL}/obligations/ob-1/download-boleto`);
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Permission: can_mark_processed=false → obligation transition blocked
// ════════════════════════════════════════════════════════════════════════

describe('Permission: can_mark_processed=false → obligation transition blocked', () => {
  beforeEach(() => {
    linkState.current = makeLink({ scope: 'COMPLETO', can_mark_processed: false });
  });

  it('blocks obligation status transition', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue({
      ...mockObligation,
      status: 'DRAFT',
      boleto_storage_key: 'key',
    });
    const res = await request(app)
      .post(`${BASE_URL}/obligations/ob-1/transition`)
      .send({ status: 'SENT_TO_COMPANY' });
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Permission: can_close_period=false → competency operations blocked
// ════════════════════════════════════════════════════════════════════════

describe('Permission: can_close_period=false → competency operations blocked', () => {
  beforeEach(() => {
    linkState.current = makeLink({ scope: 'COMPLETO', can_close_period: false });
  });

  it('blocks creating a competency', async () => {
    const res = await request(app)
      .post(`${BASE_URL}/competencies`)
      .send({ legal_entity_id: ENTITY_ID, month: 1, year: 2026 });
    expect(res.status).toBe(403);
  });

  it('blocks competency status transition', async () => {
    prismaMock.accounting_competencies.findUnique.mockResolvedValue(mockCompetency);
    const res = await request(app)
      .post(`${BASE_URL}/competencies/comp-1/transition`)
      .send({ status: 'WAITING_DOCUMENTS' });
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════
// No link at all → returns 404 (does not reveal data)
// ════════════════════════════════════════════════════════════════════════

describe('No active link → 404', () => {
  beforeEach(() => {
    linkState.current = null;
  });

  it('returns 404 for document detail', async () => {
    prismaMock.accounting_company_documents.findUnique.mockResolvedValue(mockDoc);
    const res = await request(app).get(`${BASE_URL}/documents/doc-1`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for obligation detail', async () => {
    prismaMock.accounting_payment_obligations.findUnique.mockResolvedValue(mockObligation);
    const res = await request(app).get(`${BASE_URL}/obligations/ob-1`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for certificate detail', async () => {
    prismaMock.accounting_certificates.findUnique.mockResolvedValue(mockCertificate);
    const res = await request(app).get(`${BASE_URL}/certificates/cert-1`);
    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════
// LISTING SCOPE ENFORCEMENT
// ════════════════════════════════════════════════════════════════════════

function mockLinksForScope(scope: string) {
  prismaMock.accountant_entity_links.findMany.mockResolvedValue([
    {
      legal_entity_id: ENTITY_ID,
      scope,
      can_view: true,
      inherits_children: false,
    },
  ]);
  prismaMock.legal_entities.findMany.mockResolvedValue([]);
}

describe('Listing: document scope filtering', () => {
  it('FISCAL scope does NOT receive SOCIETARIO documents', async () => {
    mockLinksForScope('FISCAL');
    linkState.current = makeLink({ scope: 'FISCAL' });

    prismaMock.accounting_company_documents.findMany.mockResolvedValue([]);
    prismaMock.accounting_company_documents.count.mockResolvedValue(0);

    const res = await request(app).get(`${BASE_URL}/documents`);
    expect(res.status).toBe(200);

    // Verify the where clause used category filter
    const call = prismaMock.accounting_company_documents.findMany.mock.calls[0]?.[0];
    expect(call.where.document_type).toBeDefined();
    expect(call.where.document_type.category.in).toContain('FISCAL');
    expect(call.where.document_type.category.in).not.toContain('SOCIETARIO');
  });

  it('SOCIETARIO scope does NOT receive FISCAL documents', async () => {
    mockLinksForScope('SOCIETARIO');
    linkState.current = makeLink({ scope: 'SOCIETARIO' });

    prismaMock.accounting_company_documents.findMany.mockResolvedValue([]);
    prismaMock.accounting_company_documents.count.mockResolvedValue(0);

    const res = await request(app).get(`${BASE_URL}/documents`);
    expect(res.status).toBe(200);

    const call = prismaMock.accounting_company_documents.findMany.mock.calls[0]?.[0];
    expect(call.where.document_type.category.in).toContain('SOCIETARIO');
    expect(call.where.document_type.category.in).not.toContain('FISCAL');
  });

  it('COMPLETO scope receives all documents (no category filter)', async () => {
    mockLinksForScope('COMPLETO');
    linkState.current = makeLink({ scope: 'COMPLETO' });

    prismaMock.accounting_company_documents.findMany.mockResolvedValue([]);
    prismaMock.accounting_company_documents.count.mockResolvedValue(0);

    const res = await request(app).get(`${BASE_URL}/documents`);
    expect(res.status).toBe(200);

    const call = prismaMock.accounting_company_documents.findMany.mock.calls[0]?.[0];
    // No category restriction for COMPLETO
    expect(call.where.document_type).toBeUndefined();
  });

  it('pagination total does NOT include hidden scope records', async () => {
    mockLinksForScope('FISCAL');
    linkState.current = makeLink({ scope: 'FISCAL' });

    prismaMock.accounting_company_documents.findMany.mockResolvedValue([]);
    prismaMock.accounting_company_documents.count.mockResolvedValue(3);

    const res = await request(app).get(`${BASE_URL}/documents`);
    expect(res.status).toBe(200);
    // count uses same where as findMany (including category filter)
    const countCall = prismaMock.accounting_company_documents.count.mock.calls[0]?.[0];
    expect(countCall.where.document_type).toBeDefined();
    expect(countCall.where.document_type.category.in).not.toContain('SOCIETARIO');
  });
});

describe('Listing: obligations scope filtering', () => {
  it('FINANCEIRO scope receives obligations', async () => {
    mockLinksForScope('FINANCEIRO');
    linkState.current = makeLink({ scope: 'FINANCEIRO' });

    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([]);

    const res = await request(app).get(`${BASE_URL}/obligations`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('FISCAL scope does NOT receive obligations (empty list)', async () => {
    mockLinksForScope('FISCAL');
    linkState.current = makeLink({ scope: 'FISCAL' });

    const res = await request(app).get(`${BASE_URL}/obligations`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    // findMany should NOT have been called since entityIds is empty
    expect(prismaMock.accounting_payment_obligations.findMany).not.toHaveBeenCalled();
  });

  it('COMPLETO scope receives obligations', async () => {
    mockLinksForScope('COMPLETO');
    linkState.current = makeLink({ scope: 'COMPLETO' });

    prismaMock.accounting_payment_obligations.findMany.mockResolvedValue([]);

    const res = await request(app).get(`${BASE_URL}/obligations`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Listing: competencies scope filtering', () => {
  it('CONTABIL scope receives competencies', async () => {
    mockLinksForScope('CONTABIL');
    linkState.current = makeLink({ scope: 'CONTABIL' });

    prismaMock.accounting_competencies.findMany.mockResolvedValue([]);

    const res = await request(app).get(`${BASE_URL}/competencies`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('FINANCEIRO scope does NOT receive competencies (empty list)', async () => {
    mockLinksForScope('FINANCEIRO');
    linkState.current = makeLink({ scope: 'FINANCEIRO' });

    const res = await request(app).get(`${BASE_URL}/competencies`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(prismaMock.accounting_competencies.findMany).not.toHaveBeenCalled();
  });

  it('COMPLETO scope receives competencies', async () => {
    mockLinksForScope('COMPLETO');
    linkState.current = makeLink({ scope: 'COMPLETO' });

    prismaMock.accounting_competencies.findMany.mockResolvedValue([]);

    const res = await request(app).get(`${BASE_URL}/competencies`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Fiscal Health / Pendências: COMPLETO only', () => {
  it('COMPLETO scope can access fiscal-health per-entity', async () => {
    mockLinksForScope('COMPLETO');
    linkState.current = makeLink({ scope: 'COMPLETO' });

    const res = await request(app).get(`${BASE_URL}/fiscal-health/${ENTITY_ID}`);
    expect(res.status).toBe(200);
  });

  it('FINANCEIRO scope receives 403 for fiscal-health per-entity', async () => {
    mockLinksForScope('FINANCEIRO');
    linkState.current = makeLink({ scope: 'FINANCEIRO' });

    const res = await request(app).get(`${BASE_URL}/fiscal-health/${ENTITY_ID}`);
    expect(res.status).toBe(403);
  });

  it('COMPLETO scope can access fiscal-health summary', async () => {
    mockLinksForScope('COMPLETO');
    linkState.current = makeLink({ scope: 'COMPLETO' });

    prismaMock.legal_entities.findUnique.mockResolvedValue({ id: ENTITY_ID, razao_social: 'Corp', cnpj: '123' });

    const res = await request(app).get(`${BASE_URL}/fiscal-health`);
    expect(res.status).toBe(200);
  });

  it('FISCAL scope receives 403 for fiscal-health summary', async () => {
    mockLinksForScope('FISCAL');
    linkState.current = makeLink({ scope: 'FISCAL' });

    const res = await request(app).get(`${BASE_URL}/fiscal-health`);
    expect(res.status).toBe(403);
  });

  it('COMPLETO scope can access pendencias', async () => {
    mockLinksForScope('COMPLETO');
    linkState.current = makeLink({ scope: 'COMPLETO' });

    const res = await request(app).get(`${BASE_URL}/pendencias`);
    expect(res.status).toBe(200);
  });

  it('CONTABIL scope receives 403 for pendencias', async () => {
    mockLinksForScope('CONTABIL');
    linkState.current = makeLink({ scope: 'CONTABIL' });

    const res = await request(app).get(`${BASE_URL}/pendencias`);
    expect(res.status).toBe(403);
  });

  it('COMPLETO scope can access pendencias/summary', async () => {
    mockLinksForScope('COMPLETO');
    linkState.current = makeLink({ scope: 'COMPLETO' });

    const res = await request(app).get(`${BASE_URL}/pendencias/summary`);
    expect(res.status).toBe(200);
  });

  it('SOCIETARIO scope receives 403 for pendencias/summary', async () => {
    mockLinksForScope('SOCIETARIO');
    linkState.current = makeLink({ scope: 'SOCIETARIO' });

    const res = await request(app).get(`${BASE_URL}/pendencias/summary`);
    expect(res.status).toBe(403);
  });
});
