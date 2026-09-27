-- PR #408: isolated SYNTHETIC manifest only. No production migration approval.
-- The uploaded test CSV content is NOT retained; only its server-calculated
-- SHA-256, byte count, provider scope and reconciliation-preview summary.
CREATE TABLE "finance_statement_evidence" (
  "id" TEXT NOT NULL,
  "legal_entity_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "content_sha256" VARCHAR(64) NOT NULL,
  "byte_count" INTEGER NOT NULL,
  "event_count" INTEGER NOT NULL,
  "preview_summary" JSONB NOT NULL,
  "source_kind" TEXT NOT NULL DEFAULT 'SYNTHETIC_FIXTURE',
  "status" TEXT NOT NULL DEFAULT 'SYNTHETIC_RECORDED_UNVERIFIED',
  "recorded_by_admin_id" TEXT NOT NULL,
  "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_statement_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_statement_evidence_provider_check" CHECK ("provider" IN ('SUMUP','ASAAS')),
  CONSTRAINT "finance_statement_evidence_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "finance_statement_evidence_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
  CONSTRAINT "finance_statement_evidence_hash_check" CHECK ("content_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "finance_statement_evidence_bytes_check" CHECK ("byte_count" > 0 AND "byte_count" <= 65536),
  CONSTRAINT "finance_statement_evidence_events_check" CHECK ("event_count" BETWEEN 0 AND 100),
  CONSTRAINT "finance_statement_evidence_source_check" CHECK ("source_kind" = 'SYNTHETIC_FIXTURE'),
  CONSTRAINT "finance_statement_evidence_status_check" CHECK ("status" = 'SYNTHETIC_RECORDED_UNVERIFIED'),
  CONSTRAINT "finance_statement_evidence_entity_fkey" FOREIGN KEY ("legal_entity_id")
    REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "finance_statement_evidence_account_fkey" FOREIGN KEY ("account_id")
    REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uq_fin_evidence_scope_hash"
 ON "finance_statement_evidence" ("legal_entity_id","account_id","provider","year","month","content_sha256");
CREATE INDEX "idx_fin_evidence_period_provider"
 ON "finance_statement_evidence" ("legal_entity_id","year","month","provider");
