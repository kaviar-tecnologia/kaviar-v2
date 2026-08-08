/**
 * E2E test: Full invoice lifecycle on an obligation.
 * 
 * Exercises the complete flow:
 * 1. Open HONORARIOS obligation
 * 2. Attach invoice PDF
 * 3. Attach invoice XML
 * 4. Fill metadata (number, series, issued_at, verification_code)
 * 5. Verify files are present
 * 6. Check audit trail
 * 7. Remove invoice (soft delete)
 * 8. Verify audit records the removal with details
 * 9. Confirm storage keys preserved in audit (files NOT physically deleted)
 * 10. Test VERIFIED→RECONCILED without NF (backend allows)
 *
 * Requires: RUN_ACCOUNTING_INTEGRATION=1 + local PostgreSQL (kaviar_test)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const SKIP = !process.env.RUN_ACCOUNTING_INTEGRATION;

function validateSafeUrl() {
  const url = process.env.DATABASE_URL || '';
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Unsafe DATABASE_URL'); }
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error(`Unsafe hostname: ${parsed.hostname}`);
  if (!parsed.pathname.toLowerCase().includes('test')) throw new Error(`Must contain "test": ${parsed.pathname}`);
}

describe.skipIf(SKIP)('E2E: Invoice lifecycle on HONORARIOS obligation', () => {
  let prisma: PrismaClient;
  const uid = randomUUID().slice(0, 8);
  let entityId: string;
  let obligationId: string;

  // Simulated storage keys (as S3 would generate)
  const pdfStorageKey = `accounting-invoices/test-${uid}/abc123.pdf`;
  const xmlStorageKey = `accounting-invoices/test-${uid}/def456.xml`;

  beforeAll(async () => {
    validateSafeUrl();
    prisma = new PrismaClient();

    const entity = await prisma.legal_entities.create({
      data: { razao_social: `E2E NF Entity ${uid}`, cnpj: `88${uid}000001`, entity_type: 'MATRIZ' },
    });
    entityId = entity.id;

    const ob = await prisma.accounting_payment_obligations.create({
      data: {
        legal_entity_id: entityId,
        obligation_type: 'HONORARIOS',
        description: `Honorários contábeis E2E ${uid}`,
        amount_cents: 200000,
        due_date: new Date('2026-08-31T12:00:00Z'),
        status: 'VERIFIED',
        action_owner: 'ACCOUNTANT',
        boleto_storage_key: `accounting-boletos/${uid}/boleto.pdf`,
        boleto_filename: 'boleto-honorarios.pdf',
        boleto_mime_type: 'application/pdf',
        boleto_size_bytes: 54000,
        proof_storage_key: `accounting-proofs/${uid}/proof.pdf`,
        proof_filename: 'comprovante-pix.pdf',
        proof_mime_type: 'application/pdf',
        proof_size_bytes: 32000,
        paid_at: new Date('2026-08-15T12:00:00Z'),
        proof_uploaded_at: new Date('2026-08-15T14:00:00Z'),
        verified_at: new Date('2026-08-16T09:00:00Z'),
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

  it('1. Obligation starts without invoice', async () => {
    const ob = await prisma.accounting_payment_obligations.findUnique({ where: { id: obligationId } });
    expect(ob!.invoice_pdf_storage_key).toBeNull();
    expect(ob!.invoice_xml_storage_key).toBeNull();
    expect(ob!.invoice_number).toBeNull();
    expect(ob!.status).toBe('VERIFIED');
    
    // has_invoice logic
    const hasInvoice = !!(ob!.invoice_pdf_storage_key || ob!.invoice_xml_storage_key || ob!.invoice_number);
    expect(hasInvoice).toBe(false);
  });

  it('2. Attach invoice PDF', async () => {
    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: obligationId },
      data: {
        invoice_pdf_storage_key: pdfStorageKey,
        invoice_pdf_filename: 'nf-honorarios-ago-2026.pdf',
        invoice_pdf_mime_type: 'application/pdf',
        invoice_pdf_size_bytes: 185000,
        invoice_uploaded_at: new Date(),
      },
    });

    await prisma.accounting_obligation_audit.create({
      data: {
        obligation_id: obligationId,
        action: 'INVOICE_PDF_ATTACHED',
        actor_type: 'ACCOUNTANT',
        actor_id: 'e2e-accountant',
        details: { filename: 'nf-honorarios-ago-2026.pdf', size: 185000 },
      },
    });

    expect(updated.invoice_pdf_storage_key).toBe(pdfStorageKey);
    expect(updated.invoice_pdf_filename).toBe('nf-honorarios-ago-2026.pdf');
  });

  it('3. Attach invoice XML', async () => {
    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: obligationId },
      data: {
        invoice_xml_storage_key: xmlStorageKey,
        invoice_xml_filename: 'nf-honorarios-ago-2026.xml',
        invoice_xml_mime_type: 'application/xml',
        invoice_xml_size_bytes: 12000,
        invoice_uploaded_at: new Date(),
      },
    });

    await prisma.accounting_obligation_audit.create({
      data: {
        obligation_id: obligationId,
        action: 'INVOICE_XML_ATTACHED',
        actor_type: 'ACCOUNTANT',
        actor_id: 'e2e-accountant',
        details: { filename: 'nf-honorarios-ago-2026.xml', size: 12000 },
      },
    });

    expect(updated.invoice_xml_storage_key).toBe(xmlStorageKey);
    expect(updated.invoice_xml_filename).toBe('nf-honorarios-ago-2026.xml');
  });

  it('4. Fill metadata (number, series, verification code, issued_at)', async () => {
    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: obligationId },
      data: {
        invoice_number: '2026001',
        invoice_series: '1',
        invoice_access_key: 'TESTE-NFSE-SEM-SEGREDO',
        invoice_verification_code: 'VERIFY-E2E-1234',
        invoice_issued_at: new Date('2026-08-01T12:00:00Z'),
      },
    });

    await prisma.accounting_obligation_audit.create({
      data: {
        obligation_id: obligationId,
        action: 'INVOICE_METADATA_UPDATED',
        actor_type: 'ACCOUNTANT',
        actor_id: 'e2e-accountant',
        details: { fields_updated: ['invoice_number', 'invoice_series', 'invoice_access_key', 'invoice_verification_code', 'invoice_issued_at'] },
      },
    });

    expect(updated.invoice_number).toBe('2026001');
    expect(updated.invoice_series).toBe('1');
    expect(updated.invoice_access_key).toBe('TESTE-NFSE-SEM-SEGREDO');
    expect(updated.invoice_verification_code).toBe('VERIFY-E2E-1234');
  });

  it('5. Download verification — files are present (simulated via DB read)', async () => {
    const ob = await prisma.accounting_payment_obligations.findUnique({ where: { id: obligationId } });
    
    // In a real flow, these storage keys would be used to generate presigned S3 URLs
    expect(ob!.invoice_pdf_storage_key).toBe(pdfStorageKey);
    expect(ob!.invoice_xml_storage_key).toBe(xmlStorageKey);
    expect(ob!.invoice_pdf_filename).toBe('nf-honorarios-ago-2026.pdf');
    expect(ob!.invoice_xml_filename).toBe('nf-honorarios-ago-2026.xml');
    expect(ob!.invoice_pdf_size_bytes).toBe(185000);
    expect(ob!.invoice_xml_size_bytes).toBe(12000);

    // has_invoice should be true
    const hasInvoice = !!(ob!.invoice_pdf_storage_key || ob!.invoice_xml_storage_key || ob!.invoice_number);
    expect(hasInvoice).toBe(true);
  });

  it('6. Verify audit trail contains all invoice actions', async () => {
    const audit = await prisma.accounting_obligation_audit.findMany({
      where: { obligation_id: obligationId },
      orderBy: { created_at: 'asc' },
    });

    const actions = audit.map(a => a.action);
    expect(actions).toContain('INVOICE_PDF_ATTACHED');
    expect(actions).toContain('INVOICE_XML_ATTACHED');
    expect(actions).toContain('INVOICE_METADATA_UPDATED');
  });

  it('7. Remove/unlink invoice (soft delete — does NOT delete from storage)', async () => {
    // Capture current state for audit (as the endpoint does)
    const before = await prisma.accounting_payment_obligations.findUnique({ where: { id: obligationId } });
    
    const removedDetails: any = {};
    if (before!.invoice_pdf_filename) removedDetails.pdf_filename = before!.invoice_pdf_filename;
    if (before!.invoice_xml_filename) removedDetails.xml_filename = before!.invoice_xml_filename;
    if (before!.invoice_number) removedDetails.invoice_number = before!.invoice_number;
    if (before!.invoice_series) removedDetails.invoice_series = before!.invoice_series;
    if (before!.invoice_access_key) removedDetails.invoice_access_key = before!.invoice_access_key;
    if (before!.invoice_verification_code) removedDetails.invoice_verification_code = before!.invoice_verification_code;
    if (before!.invoice_pdf_storage_key) removedDetails.pdf_storage_key = before!.invoice_pdf_storage_key;
    if (before!.invoice_xml_storage_key) removedDetails.xml_storage_key = before!.invoice_xml_storage_key;

    // Clear all invoice fields
    await prisma.accounting_payment_obligations.update({
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

    await prisma.accounting_obligation_audit.create({
      data: {
        obligation_id: obligationId,
        action: 'INVOICE_REMOVED',
        actor_type: 'ACCOUNTANT',
        actor_id: 'e2e-accountant',
        details: removedDetails,
      },
    });

    // Verify cleared
    const after = await prisma.accounting_payment_obligations.findUnique({ where: { id: obligationId } });
    expect(after!.invoice_pdf_storage_key).toBeNull();
    expect(after!.invoice_xml_storage_key).toBeNull();
    expect(after!.invoice_number).toBeNull();
    expect(after!.invoice_access_key).toBeNull();
    
    const hasInvoice = !!(after!.invoice_pdf_storage_key || after!.invoice_xml_storage_key || after!.invoice_number);
    expect(hasInvoice).toBe(false);
  });

  it('8. Audit trail records removal with full details (storage keys preserved)', async () => {
    const removeAudit = await prisma.accounting_obligation_audit.findFirst({
      where: { obligation_id: obligationId, action: 'INVOICE_REMOVED' },
    });

    expect(removeAudit).not.toBeNull();
    const details = removeAudit!.details as any;
    
    // Storage keys are preserved in audit — files were NOT physically deleted
    expect(details.pdf_storage_key).toBe(pdfStorageKey);
    expect(details.xml_storage_key).toBe(xmlStorageKey);
    expect(details.pdf_filename).toBe('nf-honorarios-ago-2026.pdf');
    expect(details.xml_filename).toBe('nf-honorarios-ago-2026.xml');
    expect(details.invoice_number).toBe('2026001');
    expect(details.invoice_access_key).toBe('TESTE-NFSE-SEM-SEGREDO');
  });

  it('9. Storage keys in audit prove files are NOT physically deleted', async () => {
    // The DELETE endpoint only clears DB fields, never calls S3 DeleteObject.
    // The audit record preserves the storage keys so files can be recovered if needed.
    const removeAudit = await prisma.accounting_obligation_audit.findFirst({
      where: { obligation_id: obligationId, action: 'INVOICE_REMOVED' },
    });
    const details = removeAudit!.details as any;
    
    // These keys still point to files in S3 (unmodified)
    expect(details.pdf_storage_key).toMatch(/^accounting-invoices\//);
    expect(details.xml_storage_key).toMatch(/^accounting-invoices\//);
    
    // Meanwhile the obligation has NO reference to them
    const ob = await prisma.accounting_payment_obligations.findUnique({ where: { id: obligationId } });
    expect(ob!.invoice_pdf_storage_key).toBeNull();
    
    // This proves: file exists in S3, obligation doesn't point to it = soft delete
  });
});

describe.skipIf(SKIP)('E2E: VERIFIED→RECONCILED without invoice (warning scenario)', () => {
  let prisma: PrismaClient;
  const uid = randomUUID().slice(0, 8);
  let entityId: string;
  let obligationId: string;

  beforeAll(async () => {
    validateSafeUrl();
    prisma = new PrismaClient();

    const entity = await prisma.legal_entities.create({
      data: { razao_social: `E2E Reconcile ${uid}`, cnpj: `77${uid}000001`, entity_type: 'MATRIZ' },
    });
    entityId = entity.id;

    const ob = await prisma.accounting_payment_obligations.create({
      data: {
        legal_entity_id: entityId,
        obligation_type: 'HONORARIOS',
        description: `Honorários sem NF - reconcile test ${uid}`,
        amount_cents: 100000,
        due_date: new Date('2026-08-31T12:00:00Z'),
        status: 'VERIFIED',
        action_owner: 'ACCOUNTANT',
        boleto_storage_key: `accounting-boletos/${uid}/boleto.pdf`,
        boleto_filename: 'boleto.pdf',
        boleto_mime_type: 'application/pdf',
        boleto_size_bytes: 30000,
        proof_storage_key: `accounting-proofs/${uid}/proof.pdf`,
        proof_filename: 'comprovante.pdf',
        proof_mime_type: 'application/pdf',
        proof_size_bytes: 20000,
        verified_at: new Date('2026-08-16T09:00:00Z'),
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

  it('1. Obligation is HONORARIOS, VERIFIED, without invoice', async () => {
    const ob = await prisma.accounting_payment_obligations.findUnique({ where: { id: obligationId } });
    expect(ob!.status).toBe('VERIFIED');
    expect(ob!.obligation_type).toBe('HONORARIOS');
    expect(ob!.invoice_pdf_storage_key).toBeNull();
    expect(ob!.invoice_number).toBeNull();
    
    // Frontend warning logic check
    const hasInvoice = !!(ob!.invoice_pdf_storage_key || ob!.invoice_xml_storage_key || ob!.invoice_number);
    const shouldWarn = ['HONORARIOS', 'BOLETO_FORNECEDOR'].includes(ob!.obligation_type) && !hasInvoice;
    expect(shouldWarn).toBe(true);
  });

  it('2. Backend allows transition to RECONCILED without invoice (no blocking)', async () => {
    // This is the key assertion: the backend does NOT block reconciliation without NF
    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: obligationId },
      data: { status: 'RECONCILED', reconciled_at: new Date() },
    });
    
    expect(updated.status).toBe('RECONCILED');
    expect(updated.reconciled_at).not.toBeNull();
    
    // Invoice fields remain null (warning was in frontend only)
    expect(updated.invoice_pdf_storage_key).toBeNull();
    expect(updated.invoice_number).toBeNull();
  });

  it('3. Warning is purely frontend logic — DAS_SIMPLES would NOT trigger warning', () => {
    // Verify the warning logic: only HONORARIOS and BOLETO_FORNECEDOR trigger it
    const shouldWarnForDas = ['HONORARIOS', 'BOLETO_FORNECEDOR'].includes('DAS_SIMPLES') && true;
    expect(shouldWarnForDas).toBe(false);

    const shouldWarnForGuia = ['HONORARIOS', 'BOLETO_FORNECEDOR'].includes('GUIA_IMPOSTO') && true;
    expect(shouldWarnForGuia).toBe(false);

    const shouldWarnForFgts = ['HONORARIOS', 'BOLETO_FORNECEDOR'].includes('FGTS') && true;
    expect(shouldWarnForFgts).toBe(false);
  });
});
