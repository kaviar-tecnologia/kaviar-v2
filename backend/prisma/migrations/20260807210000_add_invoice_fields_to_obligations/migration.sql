-- Migration: add_invoice_fields_to_obligations
-- Date: 2026-08-07
-- Description: Adds invoice (nota fiscal) fields to accounting_payment_obligations.
-- All fields are nullable — no impact on existing rows.

ALTER TABLE accounting_payment_obligations
  ADD COLUMN invoice_pdf_storage_key    TEXT,
  ADD COLUMN invoice_pdf_filename       TEXT,
  ADD COLUMN invoice_pdf_mime_type      TEXT,
  ADD COLUMN invoice_pdf_size_bytes     INTEGER,
  ADD COLUMN invoice_xml_storage_key    TEXT,
  ADD COLUMN invoice_xml_filename       TEXT,
  ADD COLUMN invoice_xml_mime_type      TEXT,
  ADD COLUMN invoice_xml_size_bytes     INTEGER,
  ADD COLUMN invoice_number             TEXT,
  ADD COLUMN invoice_series             TEXT,
  ADD COLUMN invoice_access_key         TEXT,
  ADD COLUMN invoice_verification_code  TEXT,
  ADD COLUMN invoice_issued_at          DATE,
  ADD COLUMN invoice_uploaded_at        TIMESTAMPTZ;
