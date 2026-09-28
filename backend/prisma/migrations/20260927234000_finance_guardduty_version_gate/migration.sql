-- Existing archive rows remain unapproved; no retroactive malware clearance.
-- Keep the original migration immutable and preserve provider-origin UNVERIFIED.
ALTER TABLE "finance_official_statement_archives"
  ADD COLUMN "storage_version_id" TEXT,
  ADD COLUMN "malware_scan_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "malware_scanned_at" TIMESTAMPTZ,
  ADD COLUMN "integrity_verified_at" TIMESTAMPTZ;

ALTER TABLE "finance_official_statement_archives"
  DROP CONSTRAINT "finance_official_archive_status_check",
  ADD CONSTRAINT "finance_official_archive_status_check"
    CHECK ("status" IN ('RESERVED','STORED_PENDING_SCAN','STORED_UNVERIFIED')),
  ADD CONSTRAINT "finance_official_archive_malware_check"
    CHECK ("malware_scan_status" IN
      ('PENDING','NO_THREATS_FOUND','THREATS_FOUND','UNSUPPORTED','ACCESS_DENIED','FAILED')),
  ADD CONSTRAINT "finance_official_archive_version_check"
    CHECK ("status" <> 'STORED_PENDING_SCAN' OR
      ("storage_version_id" IS NOT NULL AND length("storage_version_id") > 0)),
  ADD CONSTRAINT "finance_official_archive_clean_check"
    CHECK ("malware_scan_status" <> 'NO_THREATS_FOUND' OR
      ("status" = 'STORED_UNVERIFIED' AND "storage_version_id" IS NOT NULL
       AND "integrity_verified_at" IS NOT NULL AND "malware_scanned_at" IS NOT NULL));
