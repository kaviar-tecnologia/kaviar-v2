-- Frente 3F: Contas a Pagar (Payment Obligations)
-- Full lifecycle: accountant creates → company pays → accountant verifies

-- 1. Enum for obligation status
CREATE TYPE "accounting_obligation_status" AS ENUM (
  'DRAFT',
  'SENT_TO_COMPANY',
  'VIEWED',
  'SCHEDULED',
  'PAID',
  'PROOF_UPLOADED',
  'UNDER_VERIFICATION',
  'VERIFIED',
  'RECONCILED',
  'REJECTED',
  'CANCELED'
);

-- 2. Enum for obligation type
CREATE TYPE "accounting_obligation_type" AS ENUM (
  'HONORARIOS',
  'DAS_SIMPLES',
  'GUIA_IMPOSTO',
  'FGTS',
  'INSS',
  'TAXA_MUNICIPAL',
  'BOLETO_FORNECEDOR',
  'OUTRO'
);

-- 3. Enum for who owns the next action
CREATE TYPE "accounting_obligation_action_owner" AS ENUM (
  'ACCOUNTANT',
  'COMPANY'
);

-- 4. Main table
CREATE TABLE "accounting_payment_obligations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "legal_entity_id" TEXT NOT NULL,
  "obligation_type" "accounting_obligation_type" NOT NULL,
  "status" "accounting_obligation_status" NOT NULL DEFAULT 'DRAFT',
  "action_owner" "accounting_obligation_action_owner" NOT NULL DEFAULT 'ACCOUNTANT',
  "description" TEXT NOT NULL,
  "beneficiary" TEXT,
  "reference_number" TEXT,
  "competence_month" INTEGER,
  "competence_year" INTEGER,
  "amount_cents" INTEGER NOT NULL,
  "issued_at" DATE,
  "due_date" DATE NOT NULL,
  "barcode" TEXT,
  "pix_key" TEXT,
  "notes" TEXT,
  "boleto_file_id" TEXT,
  "proof_file_id" TEXT,
  "sent_at" TIMESTAMPTZ,
  "viewed_at" TIMESTAMPTZ,
  "scheduled_at" TIMESTAMPTZ,
  "paid_at" TIMESTAMPTZ,
  "proof_uploaded_at" TIMESTAMPTZ,
  "verified_at" TIMESTAMPTZ,
  "reconciled_at" TIMESTAMPTZ,
  "rejected_at" TIMESTAMPTZ,
  "rejection_reason" TEXT,
  "created_by_accountant_id" TEXT,
  "verified_by_accountant_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "accounting_payment_obligations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_po_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "accounting_po_boleto_fk" FOREIGN KEY ("boleto_file_id") REFERENCES "accounting_company_document_files"("id") ON DELETE SET NULL,
  CONSTRAINT "accounting_po_proof_fk" FOREIGN KEY ("proof_file_id") REFERENCES "accounting_company_document_files"("id") ON DELETE SET NULL,
  CONSTRAINT "accounting_po_created_by_fk" FOREIGN KEY ("created_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
  CONSTRAINT "accounting_po_verified_by_fk" FOREIGN KEY ("verified_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
  CONSTRAINT "accounting_po_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE INDEX "idx_po_entity" ON "accounting_payment_obligations"("legal_entity_id");
CREATE INDEX "idx_po_entity_status" ON "accounting_payment_obligations"("legal_entity_id", "status");
CREATE INDEX "idx_po_due_date" ON "accounting_payment_obligations"("due_date") WHERE "status" NOT IN ('RECONCILED', 'CANCELED');
CREATE INDEX "idx_po_action_owner" ON "accounting_payment_obligations"("action_owner", "status");
CREATE INDEX "idx_po_created_by" ON "accounting_payment_obligations"("created_by_accountant_id");
CREATE INDEX "idx_po_competence" ON "accounting_payment_obligations"("legal_entity_id", "competence_year", "competence_month");
