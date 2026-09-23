import { describe, expect, it } from 'vitest';
import {
  hasInvoiceFile,
  requiresInvoiceFileBeforeReconcile,
  invoiceRemovalLocked,
} from '../src/services/accounting/accounting-invoice-policy.service';

describe('accounting invoice reconciliation policy', () => {
  it('requires an actual PDF or XML file for HONORARIOS reconciliation', () => {
    expect(requiresInvoiceFileBeforeReconcile({
      obligation_type: 'HONORARIOS',
      invoice_pdf_storage_key: null,
      invoice_xml_storage_key: null,
    })).toBe(true);
  });

  it('accepts PDF for HONORARIOS reconciliation', () => {
    expect(requiresInvoiceFileBeforeReconcile({
      obligation_type: 'HONORARIOS',
      invoice_pdf_storage_key: 'accounting-invoices/ob/nf.pdf',
      invoice_xml_storage_key: null,
    })).toBe(false);
  });

  it('accepts XML for HONORARIOS reconciliation', () => {
    expect(requiresInvoiceFileBeforeReconcile({
      obligation_type: 'HONORARIOS',
      invoice_pdf_storage_key: null,
      invoice_xml_storage_key: 'accounting-invoices/ob/nf.xml',
    })).toBe(false);
  });

  it('does not impose the HONORARIOS rule on other obligation types', () => {
    expect(requiresInvoiceFileBeforeReconcile({
      obligation_type: 'DAS_SIMPLES',
      invoice_pdf_storage_key: null,
      invoice_xml_storage_key: null,
    })).toBe(false);
  });

  it('detects invoice file presence independently of metadata', () => {
    expect(hasInvoiceFile({
      invoice_pdf_storage_key: null,
      invoice_xml_storage_key: null,
    })).toBe(false);

    expect(hasInvoiceFile({
      invoice_pdf_storage_key: 'nf.pdf',
      invoice_xml_storage_key: null,
    })).toBe(true);
  });

  it('locks invoice removal after HONORARIOS is reconciled', () => {
    expect(invoiceRemovalLocked({
      obligation_type: 'HONORARIOS',
      status: 'RECONCILED',
    })).toBe(true);

    expect(invoiceRemovalLocked({
      obligation_type: 'HONORARIOS',
      status: 'VERIFIED',
    })).toBe(false);

    expect(invoiceRemovalLocked({
      obligation_type: 'BOLETO_FORNECEDOR',
      status: 'RECONCILED',
    })).toBe(false);
  });
});
