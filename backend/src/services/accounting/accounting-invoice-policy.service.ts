/**
 * Business policy for invoice requirements on accounting obligations.
 *
 * HONORARIOS (accounting fees) may only be reconciled after an actual
 * invoice file (PDF or XML) is attached. Metadata alone is not enough.
 */
export type InvoicePolicyObligation = {
  obligation_type?: string | null;
  status?: string | null;
  invoice_pdf_storage_key?: string | null;
  invoice_xml_storage_key?: string | null;
};

export function hasInvoiceFile(ob: InvoicePolicyObligation): boolean {
  return !!(ob.invoice_pdf_storage_key || ob.invoice_xml_storage_key);
}

export function requiresInvoiceFileBeforeReconcile(ob: InvoicePolicyObligation): boolean {
  return ob.obligation_type === 'HONORARIOS' && !hasInvoiceFile(ob);
}

export function invoiceRemovalLocked(ob: InvoicePolicyObligation): boolean {
  return ob.obligation_type === 'HONORARIOS' && ob.status === 'RECONCILED';
}
