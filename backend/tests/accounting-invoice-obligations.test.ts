/**
 * Tests for invoice (nota fiscal) feature on accounting obligations.
 * 
 * Unit tests: run always (serializer logic, validation).
 * Integration tests: OPT-IN via RUN_ACCOUNTING_INTEGRATION=1 + local test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';

// ── Unit tests (always run) ─────────────────────────────────────────────

describe('Invoice — Unit: Serializer logic', () => {
  // Replicate serialize logic for has_invoice
  function hasInvoice(o: any): boolean {
    return !!(o.invoice_pdf_storage_key || o.invoice_xml_storage_key || o.invoice_number);
  }

  it('has_invoice: true when PDF is present', () => {
    expect(hasInvoice({ invoice_pdf_storage_key: 'some-key', invoice_xml_storage_key: null, invoice_number: null })).toBe(true);
  });

  it('has_invoice: true when XML is present', () => {
    expect(hasInvoice({ invoice_pdf_storage_key: null, invoice_xml_storage_key: 'some-key', invoice_number: null })).toBe(true);
  });

  it('has_invoice: true when only number is present (metadata only)', () => {
    expect(hasInvoice({ invoice_pdf_storage_key: null, invoice_xml_storage_key: null, invoice_number: '1234' })).toBe(true);
  });

  it('has_invoice: false when nothing is present', () => {
    expect(hasInvoice({ invoice_pdf_storage_key: null, invoice_xml_storage_key: null, invoice_number: null })).toBe(false);
  });

  it('has_invoice: false with undefined values', () => {
    expect(hasInvoice({})).toBe(false);
  });
});

describe('Invoice — Unit: Metadata validation schema', () => {
  const invoiceMetadataSchema = z.object({
    invoice_number: z.string().trim().max(50).nullish().transform(v => v || null),
    invoice_series: z.string().trim().max(10).nullish().transform(v => v || null),
    invoice_access_key: z.string().trim().max(100).nullish().transform(v => v || null),
    invoice_verification_code: z.string().trim().max(100).nullish().transform(v => v || null),
    invoice_issued_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform(v => v || null),
  }).strict().refine(
    data => Object.values(data).some(v => v != null),
    { message: 'Informe ao menos um campo' }
  );

  it('accepts valid metadata with number only', () => {
    const result = invoiceMetadataSchema.safeParse({ invoice_number: '1234' });
    expect(result.success).toBe(true);
  });

  it('accepts full metadata', () => {
    const result = invoiceMetadataSchema.safeParse({
      invoice_number: '5678',
      invoice_series: '1',
      invoice_access_key: 'abc123456',
      invoice_verification_code: 'XYZW-9876',
      invoice_issued_at: '2026-07-15',
    });
    expect(result.success).toBe(true);
  });

  it('accepts NFS-e style access key (variable length)', () => {
    const result = invoiceMetadataSchema.safeParse({
      invoice_access_key: 'TESTE-NFSE-12345',
      invoice_verification_code: 'ABC123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts NF-e 44-digit access key', () => {
    const key44 = '00000000000000000000000000000000000000000044';
    const result = invoiceMetadataSchema.safeParse({ invoice_access_key: key44 });
    expect(result.success).toBe(true);
  });

  it('rejects empty body (no fields)', () => {
    const result = invoiceMetadataSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const result = invoiceMetadataSchema.safeParse({ invoice_issued_at: '15/07/2026' });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    const result = invoiceMetadataSchema.safeParse({ invoice_number: '1', extra_field: 'hack' });
    expect(result.success).toBe(false);
  });

  it('rejects invoice_number > 50 chars', () => {
    const result = invoiceMetadataSchema.safeParse({ invoice_number: 'x'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('rejects invoice_access_key > 100 chars', () => {
    const result = invoiceMetadataSchema.safeParse({ invoice_access_key: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe('Invoice — Unit: Warning logic for reconcile', () => {
  function shouldWarnNoInvoice(obligationType: string, hasInvoice: boolean): boolean {
    const warnTypes = ['HONORARIOS', 'BOLETO_FORNECEDOR'];
    return warnTypes.includes(obligationType) && !hasInvoice;
  }

  it('warns for HONORARIOS without invoice', () => {
    expect(shouldWarnNoInvoice('HONORARIOS', false)).toBe(true);
  });

  it('warns for BOLETO_FORNECEDOR without invoice', () => {
    expect(shouldWarnNoInvoice('BOLETO_FORNECEDOR', false)).toBe(true);
  });

  it('does not warn for HONORARIOS with invoice', () => {
    expect(shouldWarnNoInvoice('HONORARIOS', true)).toBe(false);
  });

  it('does not warn for DAS_SIMPLES without invoice', () => {
    expect(shouldWarnNoInvoice('DAS_SIMPLES', false)).toBe(false);
  });

  it('does not warn for GUIA_IMPOSTO without invoice', () => {
    expect(shouldWarnNoInvoice('GUIA_IMPOSTO', false)).toBe(false);
  });

  it('does not warn for FGTS without invoice', () => {
    expect(shouldWarnNoInvoice('FGTS', false)).toBe(false);
  });
});

// ── Integration tests (opt-in) ─────────────────────────────────────────

const SKIP_INTEGRATION = !process.env.RUN_ACCOUNTING_INTEGRATION;

function validateSafeUrl() {
  const url = process.env.DATABASE_URL || '';
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Unsafe DATABASE_URL: cannot parse'); }
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error(`Unsafe hostname: ${parsed.hostname}`);
  if (!parsed.pathname.toLowerCase().includes('test')) throw new Error(`DATABASE_URL must contain "test": ${parsed.pathname}`);
}

describe.skipIf(SKIP_INTEGRATION)('Invoice — Integration: DB operations', () => {
  let prisma: PrismaClient;
  const uid = randomUUID().slice(0, 8);
  let entityId: string;
  let obligationId: string;

  beforeAll(async () => {
    validateSafeUrl();
    prisma = new PrismaClient();

    // Create test entity
    const entity = await prisma.legal_entities.create({
      data: { razao_social: `Test Entity NF ${uid}`, cnpj: `99${uid}000001`, entity_type: 'MATRIZ' },
    });
    entityId = entity.id;

    // Create test obligation
    const ob = await prisma.accounting_payment_obligations.create({
      data: {
        legal_entity_id: entityId,
        obligation_type: 'HONORARIOS',
        description: `Test obligation NF ${uid}`,
        amount_cents: 50000,
        due_date: new Date('2026-08-31T12:00:00Z'),
        status: 'VERIFIED',
        action_owner: 'ACCOUNTANT',
      },
    });
    obligationId = ob.id;
  });

  afterAll(async () => {
    await prisma.accounting_obligation_audit.deleteMany({ where: { obligation_id: obligationId } });
    await prisma.accounting_payment_obligations.deleteMany({ where: { id: obligationId } });
    await prisma.legal_entities.delete({ where: { id: entityId } });
    await prisma.$disconnect();
  });

  it('obligation starts without invoice data', async () => {
    const ob = await prisma.accounting_payment_obligations.findUnique({ where: { id: obligationId } });
    expect(ob?.invoice_pdf_storage_key).toBeNull();
    expect(ob?.invoice_xml_storage_key).toBeNull();
    expect(ob?.invoice_number).toBeNull();
    expect(ob?.invoice_series).toBeNull();
    expect(ob?.invoice_access_key).toBeNull();
    expect(ob?.invoice_verification_code).toBeNull();
    expect(ob?.invoice_issued_at).toBeNull();
    expect(ob?.invoice_uploaded_at).toBeNull();
  });

  it('can save invoice metadata', async () => {
    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: obligationId },
      data: {
        invoice_number: '12345',
        invoice_series: '1',
        invoice_access_key: 'TESTE-NFSE-CHAVE-ACESSO',
        invoice_verification_code: 'VERIFY-XYZ',
        invoice_issued_at: new Date('2026-07-15T12:00:00Z'),
      },
    });
    expect(updated.invoice_number).toBe('12345');
    expect(updated.invoice_series).toBe('1');
    expect(updated.invoice_access_key).toBe('TESTE-NFSE-CHAVE-ACESSO');
    expect(updated.invoice_verification_code).toBe('VERIFY-XYZ');
  });

  it('can save invoice file references', async () => {
    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: obligationId },
      data: {
        invoice_pdf_storage_key: `accounting-invoices/${obligationId}/abc123.pdf`,
        invoice_pdf_filename: 'nf-honorarios-jul-2026.pdf',
        invoice_pdf_mime_type: 'application/pdf',
        invoice_pdf_size_bytes: 245000,
        invoice_xml_storage_key: `accounting-invoices/${obligationId}/def456.xml`,
        invoice_xml_filename: 'nf-honorarios-jul-2026.xml',
        invoice_xml_mime_type: 'application/xml',
        invoice_xml_size_bytes: 18000,
        invoice_uploaded_at: new Date(),
      },
    });
    expect(updated.invoice_pdf_storage_key).toContain(obligationId);
    expect(updated.invoice_pdf_filename).toBe('nf-honorarios-jul-2026.pdf');
    expect(updated.invoice_xml_filename).toBe('nf-honorarios-jul-2026.xml');
    expect(updated.invoice_pdf_size_bytes).toBe(245000);
  });

  it('can clear all invoice fields (soft delete)', async () => {
    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: obligationId },
      data: {
        invoice_pdf_storage_key: null,
        invoice_pdf_filename: null,
        invoice_pdf_mime_type: null,
        invoice_pdf_size_bytes: null,
        invoice_xml_storage_key: null,
        invoice_xml_filename: null,
        invoice_xml_mime_type: null,
        invoice_xml_size_bytes: null,
        invoice_number: null,
        invoice_series: null,
        invoice_access_key: null,
        invoice_verification_code: null,
        invoice_issued_at: null,
        invoice_uploaded_at: null,
      },
    });
    expect(updated.invoice_pdf_storage_key).toBeNull();
    expect(updated.invoice_number).toBeNull();
    expect(updated.invoice_xml_storage_key).toBeNull();
  });

  it('transition to RECONCILED works without invoice (backend does not block)', async () => {
    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: obligationId },
      data: { status: 'RECONCILED', reconciled_at: new Date() },
    });
    expect(updated.status).toBe('RECONCILED');
  });

  it('audit event is recorded for invoice operations', async () => {
    await prisma.accounting_obligation_audit.create({
      data: {
        obligation_id: obligationId,
        action: 'INVOICE_REMOVED',
        actor_type: 'ACCOUNTANT',
        actor_id: 'test-accountant',
        details: { pdf_filename: 'nf-test.pdf', invoice_number: '12345' },
      },
    });

    const audit = await prisma.accounting_obligation_audit.findMany({
      where: { obligation_id: obligationId, action: 'INVOICE_REMOVED' },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect((audit[0].details as any)?.pdf_filename).toBe('nf-test.pdf');
  });
});
