-- Fix: Store boleto/proof file data directly on obligation
-- Removes dependency on accounting_company_document_files (which requires document_id FK)

ALTER TABLE "accounting_payment_obligations" ADD COLUMN "boleto_storage_key" TEXT;
ALTER TABLE "accounting_payment_obligations" ADD COLUMN "boleto_filename" TEXT;
ALTER TABLE "accounting_payment_obligations" ADD COLUMN "boleto_mime_type" TEXT;
ALTER TABLE "accounting_payment_obligations" ADD COLUMN "boleto_size_bytes" INTEGER;

ALTER TABLE "accounting_payment_obligations" ADD COLUMN "proof_storage_key" TEXT;
ALTER TABLE "accounting_payment_obligations" ADD COLUMN "proof_filename" TEXT;
ALTER TABLE "accounting_payment_obligations" ADD COLUMN "proof_mime_type" TEXT;
ALTER TABLE "accounting_payment_obligations" ADD COLUMN "proof_size_bytes" INTEGER;

-- Drop unused FK columns (boleto_file_id and proof_file_id pointed to document_files)
ALTER TABLE "accounting_payment_obligations" DROP CONSTRAINT IF EXISTS "accounting_po_boleto_fk";
ALTER TABLE "accounting_payment_obligations" DROP CONSTRAINT IF EXISTS "accounting_po_proof_fk";
ALTER TABLE "accounting_payment_obligations" DROP COLUMN IF EXISTS "boleto_file_id";
ALTER TABLE "accounting_payment_obligations" DROP COLUMN IF EXISTS "proof_file_id";
