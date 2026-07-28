-- Harden Outbound Payment Infrastructure (Marco 3.1B)
-- Incremental migration over 20260728200000_add_outbound_payment_infrastructure.
--
-- Changes:
-- 1. Unique index on financial_obligations(source_type, source_id) to prevent
--    duplicate obligations per annual incentive request.
-- 2. Add processing_status column to financial_provider_events for async event worker.

-- ═══════════════════════════════════════════════════════════════════
-- 1. One obligation per source (prevents duplicate for same request)
-- ═══════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS "financial_obligations_source_unique_idx"
  ON "financial_obligations" ("source_type", "source_id")
  WHERE "source_id" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Event processing status for async worker
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "financial_provider_events"
  ADD COLUMN IF NOT EXISTS "processing_status" TEXT NOT NULL DEFAULT 'PENDING';

ALTER TABLE "financial_provider_events"
  ADD CONSTRAINT "financial_provider_events_processing_status_chk"
  CHECK ("processing_status" IN (
    'PENDING', 'PROCESSING', 'PROCESSED',
    'IGNORED_UNKNOWN_EVENT', 'FAILED_RETRYABLE', 'FAILED_REVIEW_REQUIRED'
  ));

ALTER TABLE "financial_provider_events"
  ADD COLUMN IF NOT EXISTS "processing_attempts" INT NOT NULL DEFAULT 0;

ALTER TABLE "financial_provider_events"
  ADD COLUMN IF NOT EXISTS "next_processing_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE "financial_provider_events"
  ADD COLUMN IF NOT EXISTS "processing_error_safe" TEXT;

CREATE INDEX IF NOT EXISTS "financial_provider_events_processing_pending_idx"
  ON "financial_provider_events" ("processing_status", "next_processing_at")
  WHERE "processing_status" IN ('PENDING', 'FAILED_RETRYABLE');
