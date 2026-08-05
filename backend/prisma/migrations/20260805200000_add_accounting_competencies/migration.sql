-- Frente 3G: Competências Contábeis (Monthly Accounting Periods)

CREATE TYPE "accounting_competency_status" AS ENUM (
  'OPEN',
  'WAITING_DOCUMENTS',
  'UNDER_REVIEW',
  'PENDING_CORRECTION',
  'COMPLETED',
  'REOPENED',
  'CANCELED'
);

-- Main competency table
CREATE TABLE "accounting_competencies" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "legal_entity_id" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "status" "accounting_competency_status" NOT NULL DEFAULT 'OPEN',
  "action_owner" TEXT NOT NULL DEFAULT 'ACCOUNTANT',
  "expected_deadline" DATE,
  "completed_at" TIMESTAMPTZ,
  "completed_by_accountant_id" TEXT,
  "reopened_at" TIMESTAMPTZ,
  "reopen_reason" TEXT,
  "responsible_accountant_id" TEXT,
  "notes" TEXT,
  "created_by_accountant_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "accounting_competencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_comp_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "accounting_comp_responsible_fk" FOREIGN KEY ("responsible_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
  CONSTRAINT "accounting_comp_completed_by_fk" FOREIGN KEY ("completed_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
  CONSTRAINT "accounting_comp_created_by_fk" FOREIGN KEY ("created_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
  CONSTRAINT "accounting_comp_month_check" CHECK ("month" >= 1 AND "month" <= 12),
  CONSTRAINT "accounting_comp_year_check" CHECK ("year" >= 2020 AND "year" <= 2100)
);

-- Prevent duplicate competency for same entity+period
CREATE UNIQUE INDEX "accounting_competencies_entity_period_key" ON "accounting_competencies"("legal_entity_id", "year", "month");
CREATE INDEX "idx_comp_entity" ON "accounting_competencies"("legal_entity_id");
CREATE INDEX "idx_comp_entity_status" ON "accounting_competencies"("legal_entity_id", "status");
CREATE INDEX "idx_comp_period" ON "accounting_competencies"("year", "month");
CREATE INDEX "idx_comp_deadline" ON "accounting_competencies"("expected_deadline") WHERE "status" NOT IN ('COMPLETED', 'CANCELED');

-- Link documents to competencies (many-to-many)
CREATE TABLE "accounting_competency_documents" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "competency_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "linked_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "linked_by_accountant_id" TEXT,

  CONSTRAINT "accounting_cd_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_cd_comp_fk" FOREIGN KEY ("competency_id") REFERENCES "accounting_competencies"("id") ON DELETE CASCADE,
  CONSTRAINT "accounting_cd_doc_fk" FOREIGN KEY ("document_id") REFERENCES "accounting_company_documents"("id") ON DELETE CASCADE,
  CONSTRAINT "accounting_cd_linked_by_fk" FOREIGN KEY ("linked_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "accounting_cd_comp_doc_key" ON "accounting_competency_documents"("competency_id", "document_id");
CREATE INDEX "idx_cd_competency" ON "accounting_competency_documents"("competency_id");

-- Add optional competence fields to payment obligations
ALTER TABLE "accounting_payment_obligations" ADD COLUMN IF NOT EXISTS "competency_id" TEXT;
ALTER TABLE "accounting_payment_obligations" ADD CONSTRAINT "accounting_po_competency_fk"
  FOREIGN KEY ("competency_id") REFERENCES "accounting_competencies"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_po_competency" ON "accounting_payment_obligations"("competency_id") WHERE "competency_id" IS NOT NULL;
