-- PR #409: migration for review ONLY, not a production approval.
CREATE TABLE "finance_official_statement_archives" (
  "id" TEXT NOT NULL,
  "legal_entity_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "content_sha256" VARCHAR(64) NOT NULL,
  "byte_count" INTEGER NOT NULL,
  "media_type" TEXT NOT NULL,
  "declared_source_channel" TEXT NOT NULL,
  "storage_bucket" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "source_verification" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "stored_at" TIMESTAMPTZ,
  "recorded_by_admin_id" TEXT NOT NULL,
  "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_official_statement_archives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_official_archive_provider_check" CHECK ("provider" IN ('SUMUP','ASAAS')),
  CONSTRAINT "finance_official_archive_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "finance_official_archive_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
  CONSTRAINT "finance_official_archive_hash_check" CHECK ("content_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "finance_official_archive_bytes_check" CHECK ("byte_count" BETWEEN 1 AND 5242880),
  CONSTRAINT "finance_official_archive_type_check" CHECK ("media_type" IN ('application/pdf','text/csv')),
  CONSTRAINT "finance_official_archive_channel_check" CHECK ("declared_source_channel" IN
    ('PROVIDER_PORTAL_DECLARED','EMAIL_ATTACHMENT_DECLARED')),
  CONSTRAINT "finance_official_archive_status_check" CHECK ("status" IN ('RESERVED','STORED_UNVERIFIED')),
  CONSTRAINT "finance_official_archive_source_check" CHECK ("source_verification" = 'UNVERIFIED'),
  CONSTRAINT "finance_official_archive_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "finance_official_archive_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "finance_official_statement_archives_storage_key_key"
  ON "finance_official_statement_archives" ("storage_key");
CREATE UNIQUE INDEX "uq_fin_official_scope_hash"
  ON "finance_official_statement_archives"
    ("legal_entity_id","account_id","provider","year","month","content_sha256");
CREATE INDEX "idx_fin_official_period_provider"
  ON "finance_official_statement_archives" ("legal_entity_id","year","month","provider");
