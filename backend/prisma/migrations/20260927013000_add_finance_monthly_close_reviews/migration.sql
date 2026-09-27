-- PR #407: prepared only. DO NOT RUN ON PRODUCTION without separate approval.
-- Internal financial review; never a statement or revenue certification.
CREATE TABLE "finance_monthly_close_reviews" (
  "id" TEXT NOT NULL,
  "legal_entity_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "snapshot" JSONB NOT NULL,
  "snapshot_hash" TEXT NOT NULL,
  "review_reasons" JSONB NOT NULL,
  "prepared_by_admin_id" TEXT NOT NULL,
  "submitted_by_admin_id" TEXT,
  "approved_by_admin_id" TEXT,
  "reopened_by_admin_id" TEXT,
  "reopen_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMPTZ,
  "approved_at" TIMESTAMPTZ,
  "reopened_at" TIMESTAMPTZ,
  CONSTRAINT "finance_monthly_close_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_monthly_close_reviews_status_check"
     CHECK ("status" IN ('DRAFT', 'IN_REVIEW', 'INTERNAL_REVIEW_APPROVED', 'REOPENED')),
  CONSTRAINT "finance_monthly_close_reviews_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "finance_monthly_close_reviews_version_check" CHECK ("version" >= 1),
  CONSTRAINT "finance_monthly_close_reviews_entity_fkey" FOREIGN KEY ("legal_entity_id")
     REFERENCES "legal_entities" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "finance_monthly_close_reviews_legal_entity_id_year_month_version_key"
  ON "finance_monthly_close_reviews" ("legal_entity_id", "year", "month", "version");
CREATE INDEX "finance_monthly_close_reviews_legal_entity_id_year_month_created_at_idx"
  ON "finance_monthly_close_reviews" ("legal_entity_id", "year", "month", "created_at");
CREATE INDEX "finance_monthly_close_reviews_status_idx"
  ON "finance_monthly_close_reviews" ("status");
