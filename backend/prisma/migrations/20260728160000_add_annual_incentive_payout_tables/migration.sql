-- Annual Incentive Payout Tables (Marco 3 — Gratificação Anual)
--
-- Tables for automated payout flow:
--   driver_payout_destinations — encrypted Pix CPF destination
--   annual_incentive_requests — payout requests with state machine
--   annual_incentive_request_allocations — FIFO allocation by program_year
--   annual_incentive_payouts — provider-level payout tracking
--   annual_incentive_payout_attempts — attempt history with backoff
--   annual_incentive_payout_outbox — transactional outbox for async processing
--   annual_incentive_webhook_events — deduplicated provider events
--
-- Design decision: saldo permanece no program_year original. Alocação FIFO distribui
-- o valor solicitado começando pelo ano mais antigo.

-- ═══════════════════════════════════════════════════════════════════
-- 1. DRIVER PAYOUT DESTINATIONS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "driver_payout_destinations" (
  "id"                   TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "driver_id"            TEXT NOT NULL,
  "provider"             TEXT NOT NULL DEFAULT 'pix',
  "method"               TEXT NOT NULL DEFAULT 'CPF',
  "pix_key_type"         TEXT NOT NULL,
  "pix_key_encrypted"    TEXT NOT NULL,
  "pix_key_hash"         TEXT NOT NULL,
  "pix_key_masked"       TEXT NOT NULL,
  "owner_document_hash"  TEXT NOT NULL,
  "encryption_key_version" TEXT NOT NULL DEFAULT '1',
  "status"               TEXT NOT NULL DEFAULT 'active',
  "verified_at"          TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "superseded_at"        TIMESTAMPTZ,

  CONSTRAINT "driver_payout_destinations_pkey" PRIMARY KEY ("id")
);

-- Only one active destination per driver at a time
CREATE UNIQUE INDEX "driver_payout_destinations_driver_active_idx"
  ON "driver_payout_destinations" ("driver_id")
  WHERE "status" = 'active' AND "superseded_at" IS NULL;

CREATE INDEX "driver_payout_destinations_driver_id_idx"
  ON "driver_payout_destinations" ("driver_id");

ALTER TABLE "driver_payout_destinations"
  ADD CONSTRAINT "driver_payout_destinations_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_payout_destinations"
  ADD CONSTRAINT "driver_payout_destinations_pix_key_type_chk"
  CHECK ("pix_key_type" IN ('CPF'));

ALTER TABLE "driver_payout_destinations"
  ADD CONSTRAINT "driver_payout_destinations_status_chk"
  CHECK ("status" IN ('active', 'superseded', 'revoked'));

ALTER TABLE "driver_payout_destinations"
  ADD CONSTRAINT "driver_payout_destinations_encrypted_notempty_chk"
  CHECK (length("pix_key_encrypted") > 0);

ALTER TABLE "driver_payout_destinations"
  ADD CONSTRAINT "driver_payout_destinations_hash_notempty_chk"
  CHECK (length("pix_key_hash") > 0);

-- ═══════════════════════════════════════════════════════════════════
-- 2. ANNUAL INCENTIVE REQUESTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "annual_incentive_requests" (
  "id"                            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "driver_id"                     TEXT NOT NULL,
  "requested_amount_cents"        BIGINT NOT NULL,
  "status"                        TEXT NOT NULL DEFAULT 'RESERVED',
  "destination_snapshot_encrypted" TEXT NOT NULL,
  "destination_hash"              TEXT NOT NULL,
  "destination_masked"            TEXT NOT NULL,
  "requested_at"                  TIMESTAMPTZ NOT NULL,
  "reserved_at"                   TIMESTAMPTZ,
  "eligibility_checked_at"        TIMESTAMPTZ,
  "queued_at"                     TIMESTAMPTZ,
  "paid_at"                       TIMESTAMPTZ,
  "failed_at"                     TIMESTAMPTZ,
  "released_at"                   TIMESTAMPTZ,
  "deadline_at"                   TIMESTAMPTZ NOT NULL,
  "idempotency_key"               TEXT NOT NULL,
  "correlation_id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "failure_code"                  TEXT,
  "failure_message_safe"          TEXT,
  "created_at"                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "annual_incentive_requests_pkey" PRIMARY KEY ("id")
);

-- Idempotency key must be unique
ALTER TABLE "annual_incentive_requests"
  ADD CONSTRAINT "annual_incentive_requests_idempotency_key_unique"
  UNIQUE ("idempotency_key");

-- Only one open request per driver (non-terminal statuses)
CREATE UNIQUE INDEX "annual_incentive_requests_driver_open_idx"
  ON "annual_incentive_requests" ("driver_id")
  WHERE "status" NOT IN ('PAID', 'FAILED_RELEASED', 'CANCELLED_RELEASED');

ALTER TABLE "annual_incentive_requests"
  ADD CONSTRAINT "annual_incentive_requests_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "annual_incentive_requests"
  ADD CONSTRAINT "annual_incentive_requests_amount_positive_chk"
  CHECK ("requested_amount_cents" > 0);

ALTER TABLE "annual_incentive_requests"
  ADD CONSTRAINT "annual_incentive_requests_status_chk"
  CHECK ("status" IN (
    'RESERVED',
    'ELIGIBILITY_CHECKED',
    'QUEUED',
    'PROVIDER_CAPABILITY_CHECK',
    'SUBMITTING',
    'SUBMITTED',
    'PROCESSING',
    'PAID',
    'RETRYABLE_FAILURE',
    'BLOCKED',
    'BLOCKED_PROVIDER_CAPABILITY',
    'FAILED_RELEASED',
    'CANCELLED_RELEASED'
  ));

CREATE INDEX "annual_incentive_requests_driver_id_idx"
  ON "annual_incentive_requests" ("driver_id");

CREATE INDEX "annual_incentive_requests_status_idx"
  ON "annual_incentive_requests" ("status");

CREATE INDEX "annual_incentive_requests_deadline_idx"
  ON "annual_incentive_requests" ("deadline_at")
  WHERE "status" NOT IN ('PAID', 'FAILED_RELEASED', 'CANCELLED_RELEASED');

-- ═══════════════════════════════════════════════════════════════════
-- 3. ANNUAL INCENTIVE REQUEST ALLOCATIONS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "annual_incentive_request_allocations" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "request_id"   TEXT NOT NULL,
  "program_year" INTEGER NOT NULL,
  "amount_cents" BIGINT NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "annual_incentive_request_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "annual_incentive_request_allocations"
  ADD CONSTRAINT "annual_incentive_request_allocations_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "annual_incentive_requests"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "annual_incentive_request_allocations"
  ADD CONSTRAINT "annual_incentive_request_allocations_amount_positive_chk"
  CHECK ("amount_cents" > 0);

ALTER TABLE "annual_incentive_request_allocations"
  ADD CONSTRAINT "annual_incentive_request_allocations_year_range_chk"
  CHECK ("program_year" >= 2026 AND "program_year" <= 2200);

-- One allocation per program_year per request
CREATE UNIQUE INDEX "annual_incentive_request_allocations_request_year_idx"
  ON "annual_incentive_request_allocations" ("request_id", "program_year");

CREATE INDEX "annual_incentive_request_allocations_request_id_idx"
  ON "annual_incentive_request_allocations" ("request_id");

-- ═══════════════════════════════════════════════════════════════════
-- 4. ANNUAL INCENTIVE PAYOUTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "annual_incentive_payouts" (
  "id"                     TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "request_id"             TEXT NOT NULL,
  "driver_id"              TEXT NOT NULL,
  "amount_cents"           BIGINT NOT NULL,
  "provider_name"          TEXT NOT NULL,
  "provider_payout_id"     TEXT,
  "external_reference"     TEXT NOT NULL,
  "status"                 TEXT NOT NULL DEFAULT 'PENDING',
  "provider_status"        TEXT,
  "provider_response_safe" JSONB,
  "submitted_at"           TIMESTAMPTZ,
  "confirmed_at"           TIMESTAMPTZ,
  "failed_at"              TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "annual_incentive_payouts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "annual_incentive_payouts"
  ADD CONSTRAINT "annual_incentive_payouts_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "annual_incentive_requests"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "annual_incentive_payouts"
  ADD CONSTRAINT "annual_incentive_payouts_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "annual_incentive_payouts"
  ADD CONSTRAINT "annual_incentive_payouts_amount_positive_chk"
  CHECK ("amount_cents" > 0);

ALTER TABLE "annual_incentive_payouts"
  ADD CONSTRAINT "annual_incentive_payouts_status_chk"
  CHECK ("status" IN (
    'PENDING',
    'SUBMITTING',
    'SUBMITTED',
    'PROCESSING',
    'DONE',
    'FAILED',
    'CANCELLED',
    'UNKNOWN_SUBMISSION',
    'BLOCKED_PROVIDER_RECONCILIATION'
  ));

-- External reference unique per provider
CREATE UNIQUE INDEX "annual_incentive_payouts_external_reference_idx"
  ON "annual_incentive_payouts" ("external_reference");

-- Provider payout ID unique when present
CREATE UNIQUE INDEX "annual_incentive_payouts_provider_payout_id_idx"
  ON "annual_incentive_payouts" ("provider_payout_id")
  WHERE "provider_payout_id" IS NOT NULL;

CREATE INDEX "annual_incentive_payouts_request_id_idx"
  ON "annual_incentive_payouts" ("request_id");

CREATE INDEX "annual_incentive_payouts_status_idx"
  ON "annual_incentive_payouts" ("status");

-- ═══════════════════════════════════════════════════════════════════
-- 5. ANNUAL INCENTIVE PAYOUT ATTEMPTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "annual_incentive_payout_attempts" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "payout_id"      TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status"         TEXT NOT NULL,
  "error_code"     TEXT,
  "error_safe"     TEXT,
  "provider_response_safe" JSONB,
  "started_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "finished_at"    TIMESTAMPTZ,
  "next_retry_at"  TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "annual_incentive_payout_attempts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "annual_incentive_payout_attempts"
  ADD CONSTRAINT "annual_incentive_payout_attempts_payout_id_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "annual_incentive_payouts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "annual_incentive_payout_attempts"
  ADD CONSTRAINT "annual_incentive_payout_attempts_number_positive_chk"
  CHECK ("attempt_number" > 0);

CREATE INDEX "annual_incentive_payout_attempts_payout_id_idx"
  ON "annual_incentive_payout_attempts" ("payout_id");

-- ═══════════════════════════════════════════════════════════════════
-- 6. ANNUAL INCENTIVE PAYOUT OUTBOX
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "annual_incentive_payout_outbox" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "request_id"  TEXT NOT NULL,
  "driver_id"   TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "priority"    INTEGER NOT NULL DEFAULT 0,
  "locked_at"   TIMESTAMPTZ,
  "locked_by"   TEXT,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "next_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "annual_incentive_payout_outbox_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "annual_incentive_payout_outbox"
  ADD CONSTRAINT "annual_incentive_payout_outbox_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "annual_incentive_requests"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "annual_incentive_payout_outbox"
  ADD CONSTRAINT "annual_incentive_payout_outbox_status_chk"
  CHECK ("status" IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'BLOCKED'));

CREATE UNIQUE INDEX "annual_incentive_payout_outbox_request_id_idx"
  ON "annual_incentive_payout_outbox" ("request_id");

CREATE INDEX "annual_incentive_payout_outbox_pending_idx"
  ON "annual_incentive_payout_outbox" ("status", "next_at")
  WHERE "status" IN ('PENDING', 'PROCESSING');

-- ═══════════════════════════════════════════════════════════════════
-- 7. ANNUAL INCENTIVE WEBHOOK EVENTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "annual_incentive_webhook_events" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "provider_name"     TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "event_type"        TEXT NOT NULL,
  "payout_id"         TEXT,
  "payload_safe"      JSONB NOT NULL DEFAULT '{}',
  "processed"         BOOLEAN NOT NULL DEFAULT false,
  "processed_at"      TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "annual_incentive_webhook_events_pkey" PRIMARY KEY ("id")
);

-- Provider event ID unique per provider (deduplication)
CREATE UNIQUE INDEX "annual_incentive_webhook_events_provider_event_idx"
  ON "annual_incentive_webhook_events" ("provider_name", "provider_event_id");

CREATE INDEX "annual_incentive_webhook_events_payout_id_idx"
  ON "annual_incentive_webhook_events" ("payout_id")
  WHERE "payout_id" IS NOT NULL;
