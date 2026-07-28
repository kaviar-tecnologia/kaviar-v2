-- Outbound Payment Infrastructure (Marco 3.1)
-- Central accounts payable and treasury system.
--
-- Architecture:
--   SumUp → recebimentos e recargas (unchanged)
--   Asaas → todos os pagamentos de saída
--
-- Tables:
--   financial_payees — beneficiários (drivers, managers, suppliers, etc.)
--   financial_payee_destinations — destinos Pix/TED/boleto criptografados
--   financial_obligations — obrigações financeiras (origem do pagamento)
--   financial_obligation_allocations — alocação por fonte/competência
--   financial_payouts — execução do pagamento (provider-level)
--   financial_payout_attempts — tentativas com backoff
--   financial_payout_outbox — outbox transacional
--   financial_provider_events — webhooks/eventos do Asaas deduplicados
--   financial_recurring_obligations — recorrências
--   financial_payment_audit — auditoria de ações administrativas

-- ═══════════════════════════════════════════════════════════════════
-- 1. FINANCIAL PAYEES
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_payees" (
  "id"                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "payee_type"            TEXT NOT NULL,
  "reference_id"          TEXT,
  "legal_name_encrypted"  TEXT NOT NULL,
  "cpf_cnpj_encrypted"    TEXT NOT NULL,
  "cpf_cnpj_hmac"         TEXT NOT NULL,
  "cpf_cnpj_masked"       TEXT NOT NULL,
  "document_type"         TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "verification_status"   TEXT NOT NULL DEFAULT 'PENDING',
  "risk_status"           TEXT NOT NULL DEFAULT 'NORMAL',
  "encryption_key_version" TEXT NOT NULL DEFAULT '1',
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "disabled_at"           TIMESTAMPTZ,

  CONSTRAINT "financial_payees_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_payees"
  ADD CONSTRAINT "financial_payees_payee_type_chk"
  CHECK ("payee_type" IN (
    'DRIVER', 'MANAGER', 'ACCOUNTING_FIRM', 'SUPPLIER',
    'SERVICE_PROVIDER', 'EMPLOYEE', 'CONTRACTOR',
    'GOVERNMENT_ENTITY', 'UTILITY_PROVIDER', 'OTHER_LEGAL_PAYEE'
  ));

ALTER TABLE "financial_payees"
  ADD CONSTRAINT "financial_payees_status_chk"
  CHECK ("status" IN ('PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED', 'DISABLED'));

ALTER TABLE "financial_payees"
  ADD CONSTRAINT "financial_payees_document_type_chk"
  CHECK ("document_type" IN ('CPF', 'CNPJ'));

CREATE INDEX "financial_payees_payee_type_idx" ON "financial_payees" ("payee_type");
CREATE INDEX "financial_payees_status_idx" ON "financial_payees" ("status");
CREATE INDEX "financial_payees_cpf_cnpj_hmac_idx" ON "financial_payees" ("cpf_cnpj_hmac");
CREATE INDEX "financial_payees_reference_id_idx" ON "financial_payees" ("reference_id") WHERE "reference_id" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2. FINANCIAL PAYEE DESTINATIONS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_payee_destinations" (
  "id"                      TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "payee_id"                TEXT NOT NULL,
  "method"                  TEXT NOT NULL,
  "key_type"                TEXT,
  "key_encrypted"           TEXT NOT NULL,
  "key_hmac"                TEXT NOT NULL,
  "key_masked"              TEXT NOT NULL,
  "encryption_key_version"  TEXT NOT NULL DEFAULT '1',
  "status"                  TEXT NOT NULL DEFAULT 'active',
  "verified_at"             TIMESTAMPTZ,
  "cooldown_until"          TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "superseded_at"           TIMESTAMPTZ,

  CONSTRAINT "financial_payee_destinations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_payee_destinations"
  ADD CONSTRAINT "financial_payee_destinations_payee_fkey"
  FOREIGN KEY ("payee_id") REFERENCES "financial_payees"("id") ON DELETE RESTRICT;

ALTER TABLE "financial_payee_destinations"
  ADD CONSTRAINT "financial_payee_destinations_method_chk"
  CHECK ("method" IN ('PIX_CPF', 'PIX_CNPJ', 'PIX_EMAIL', 'PIX_PHONE', 'PIX_EVP', 'BANK_ACCOUNT', 'BILL'));

ALTER TABLE "financial_payee_destinations"
  ADD CONSTRAINT "financial_payee_destinations_status_chk"
  CHECK ("status" IN ('active', 'superseded', 'revoked'));

CREATE UNIQUE INDEX "financial_payee_destinations_active_idx"
  ON "financial_payee_destinations" ("payee_id")
  WHERE "status" = 'active' AND "superseded_at" IS NULL;

CREATE INDEX "financial_payee_destinations_payee_id_idx" ON "financial_payee_destinations" ("payee_id");

-- ═══════════════════════════════════════════════════════════════════
-- 3. FINANCIAL OBLIGATIONS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_obligations" (
  "id"                      TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "payee_id"                TEXT NOT NULL,
  "purpose"                 TEXT NOT NULL,
  "source_type"             TEXT NOT NULL,
  "source_id"               TEXT,
  "description_safe"        TEXT NOT NULL,
  "gross_amount_cents"      BIGINT NOT NULL,
  "discount_amount_cents"   BIGINT NOT NULL DEFAULT 0,
  "net_amount_cents"        BIGINT NOT NULL,
  "due_date"                DATE,
  "competence_date"         DATE,
  "status"                  TEXT NOT NULL DEFAULT 'DRAFT',
  "recurring_schedule_id"   TEXT,
  "document_reference"      TEXT,
  "destination_snapshot_encrypted" TEXT,
  "destination_hmac"        TEXT,
  "destination_masked"      TEXT,
  "idempotency_key"         TEXT NOT NULL,
  "correlation_id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "created_by_system"       BOOLEAN NOT NULL DEFAULT false,
  "created_by_admin_id"     TEXT,
  "approved_by_admin_id"    TEXT,
  "approved_at"             TIMESTAMPTZ,
  "failure_code"            TEXT,
  "failure_message_safe"    TEXT,
  "deadline_at"             TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "financial_obligations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_obligations"
  ADD CONSTRAINT "financial_obligations_payee_fkey"
  FOREIGN KEY ("payee_id") REFERENCES "financial_payees"("id") ON DELETE RESTRICT;

ALTER TABLE "financial_obligations"
  ADD CONSTRAINT "financial_obligations_purpose_chk"
  CHECK ("purpose" IN (
    'DRIVER_ANNUAL_INCENTIVE', 'MANAGER_TERRITORIAL_COMMISSION',
    'ACCOUNTING_SERVICE', 'SUPPLIER_INVOICE', 'SERVICE_PROVIDER',
    'OPERATIONAL_EXPENSE', 'EMPLOYEE_OR_CONTRACTOR_REIMBURSEMENT',
    'TAX_OR_GOVERNMENT_PAYMENT', 'UTILITY_BILL',
    'OTHER_APPROVED_BUSINESS_EXPENSE'
  ));

ALTER TABLE "financial_obligations"
  ADD CONSTRAINT "financial_obligations_status_chk"
  CHECK ("status" IN (
    'DRAFT', 'VALIDATING', 'APPROVED', 'SCHEDULED', 'RESERVED',
    'QUEUED', 'SUBMITTING', 'SUBMITTED', 'PROCESSING', 'PAID',
    'BLOCKED', 'BLOCKED_POLICY_REVIEW', 'RETRYABLE_FAILURE',
    'FAILED', 'CANCELLED'
  ));

ALTER TABLE "financial_obligations"
  ADD CONSTRAINT "financial_obligations_net_amount_positive_chk"
  CHECK ("net_amount_cents" > 0);

ALTER TABLE "financial_obligations"
  ADD CONSTRAINT "financial_obligations_gross_amount_positive_chk"
  CHECK ("gross_amount_cents" > 0);

ALTER TABLE "financial_obligations"
  ADD CONSTRAINT "financial_obligations_idempotency_key_unique"
  UNIQUE ("idempotency_key");

CREATE INDEX "financial_obligations_payee_id_idx" ON "financial_obligations" ("payee_id");
CREATE INDEX "financial_obligations_purpose_idx" ON "financial_obligations" ("purpose");
CREATE INDEX "financial_obligations_status_idx" ON "financial_obligations" ("status");
CREATE INDEX "financial_obligations_due_date_idx" ON "financial_obligations" ("due_date") WHERE "status" NOT IN ('PAID', 'FAILED', 'CANCELLED');
CREATE INDEX "financial_obligations_source_idx" ON "financial_obligations" ("source_type", "source_id") WHERE "source_id" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 4. FINANCIAL OBLIGATION ALLOCATIONS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_obligation_allocations" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "obligation_id"  TEXT NOT NULL,
  "source_type"    TEXT NOT NULL,
  "source_id"      TEXT NOT NULL,
  "amount_cents"   BIGINT NOT NULL,
  "metadata"       JSONB NOT NULL DEFAULT '{}',
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "financial_obligation_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_obligation_allocations"
  ADD CONSTRAINT "financial_obligation_allocations_obligation_fkey"
  FOREIGN KEY ("obligation_id") REFERENCES "financial_obligations"("id") ON DELETE RESTRICT;

ALTER TABLE "financial_obligation_allocations"
  ADD CONSTRAINT "financial_obligation_allocations_amount_positive_chk"
  CHECK ("amount_cents" > 0);

CREATE INDEX "financial_obligation_allocations_obligation_idx" ON "financial_obligation_allocations" ("obligation_id");

-- ═══════════════════════════════════════════════════════════════════
-- 5. FINANCIAL PAYOUTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_payouts" (
  "id"                     TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "obligation_id"          TEXT NOT NULL,
  "payee_id"               TEXT NOT NULL,
  "amount_cents"           BIGINT NOT NULL,
  "instrument"             TEXT NOT NULL,
  "provider_name"          TEXT NOT NULL,
  "provider_payout_id"     TEXT,
  "external_reference"     TEXT NOT NULL,
  "status"                 TEXT NOT NULL DEFAULT 'PENDING',
  "provider_status"        TEXT,
  "provider_response_safe" JSONB,
  "fee_cents"              BIGINT,
  "submitted_at"           TIMESTAMPTZ,
  "confirmed_at"           TIMESTAMPTZ,
  "failed_at"              TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "financial_payouts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_payouts"
  ADD CONSTRAINT "financial_payouts_obligation_fkey"
  FOREIGN KEY ("obligation_id") REFERENCES "financial_obligations"("id") ON DELETE RESTRICT;

ALTER TABLE "financial_payouts"
  ADD CONSTRAINT "financial_payouts_payee_fkey"
  FOREIGN KEY ("payee_id") REFERENCES "financial_payees"("id") ON DELETE RESTRICT;

ALTER TABLE "financial_payouts"
  ADD CONSTRAINT "financial_payouts_amount_positive_chk"
  CHECK ("amount_cents" > 0);

ALTER TABLE "financial_payouts"
  ADD CONSTRAINT "financial_payouts_instrument_chk"
  CHECK ("instrument" IN ('ASAAS_PIX_TRANSFER', 'ASAAS_BANK_TRANSFER', 'ASAAS_BILL_PAYMENT'));

ALTER TABLE "financial_payouts"
  ADD CONSTRAINT "financial_payouts_status_chk"
  CHECK ("status" IN (
    'PENDING', 'SUBMITTING', 'SUBMITTED', 'PROCESSING', 'DONE',
    'FAILED', 'CANCELLED', 'UNKNOWN_SUBMISSION', 'BLOCKED_PROVIDER_RECONCILIATION'
  ));

CREATE UNIQUE INDEX "financial_payouts_external_reference_idx" ON "financial_payouts" ("external_reference");
CREATE UNIQUE INDEX "financial_payouts_provider_payout_id_idx" ON "financial_payouts" ("provider_payout_id") WHERE "provider_payout_id" IS NOT NULL;
CREATE INDEX "financial_payouts_obligation_id_idx" ON "financial_payouts" ("obligation_id");
CREATE INDEX "financial_payouts_status_idx" ON "financial_payouts" ("status");

-- ═══════════════════════════════════════════════════════════════════
-- 6. FINANCIAL PAYOUT ATTEMPTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_payout_attempts" (
  "id"                     TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "payout_id"              TEXT NOT NULL,
  "attempt_number"         INT NOT NULL,
  "status"                 TEXT NOT NULL,
  "error_code"             TEXT,
  "error_safe"             TEXT,
  "provider_response_safe" JSONB,
  "started_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "finished_at"            TIMESTAMPTZ,
  "next_retry_at"          TIMESTAMPTZ,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "financial_payout_attempts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_payout_attempts"
  ADD CONSTRAINT "financial_payout_attempts_payout_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "financial_payouts"("id") ON DELETE RESTRICT;

CREATE INDEX "financial_payout_attempts_payout_id_idx" ON "financial_payout_attempts" ("payout_id");

-- ═══════════════════════════════════════════════════════════════════
-- 7. FINANCIAL PAYOUT OUTBOX
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_payout_outbox" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "obligation_id"  TEXT NOT NULL,
  "payee_id"       TEXT NOT NULL,
  "purpose"        TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "priority"       INT NOT NULL DEFAULT 0,
  "locked_at"      TIMESTAMPTZ,
  "locked_by"      TEXT,
  "attempts"       INT NOT NULL DEFAULT 0,
  "next_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "financial_payout_outbox_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_payout_outbox"
  ADD CONSTRAINT "financial_payout_outbox_obligation_fkey"
  FOREIGN KEY ("obligation_id") REFERENCES "financial_obligations"("id") ON DELETE RESTRICT;

ALTER TABLE "financial_payout_outbox"
  ADD CONSTRAINT "financial_payout_outbox_status_chk"
  CHECK ("status" IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'BLOCKED'));

CREATE UNIQUE INDEX "financial_payout_outbox_obligation_idx" ON "financial_payout_outbox" ("obligation_id");
CREATE INDEX "financial_payout_outbox_pending_idx" ON "financial_payout_outbox" ("status", "next_at") WHERE "status" IN ('PENDING', 'PROCESSING');

-- ═══════════════════════════════════════════════════════════════════
-- 8. FINANCIAL PROVIDER EVENTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_provider_events" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "provider_name"     TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "event_category"    TEXT NOT NULL,
  "event_type"        TEXT NOT NULL,
  "payout_id"         TEXT,
  "payload_safe"      JSONB NOT NULL DEFAULT '{}',
  "processed"         BOOLEAN NOT NULL DEFAULT false,
  "processed_at"      TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "financial_provider_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_provider_events"
  ADD CONSTRAINT "financial_provider_events_category_chk"
  CHECK ("event_category" IN ('TRANSFER', 'BILL_PAYMENT'));

CREATE UNIQUE INDEX "financial_provider_events_dedup_idx"
  ON "financial_provider_events" ("provider_name", "provider_event_id");
CREATE INDEX "financial_provider_events_payout_idx"
  ON "financial_provider_events" ("payout_id") WHERE "payout_id" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 9. FINANCIAL RECURRING OBLIGATIONS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_recurring_obligations" (
  "id"                          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "payee_id"                    TEXT NOT NULL,
  "purpose"                     TEXT NOT NULL,
  "description_safe"            TEXT NOT NULL,
  "frequency"                   TEXT NOT NULL,
  "expected_amount_cents"       BIGINT NOT NULL,
  "amount_tolerance_cents"      BIGINT NOT NULL DEFAULT 0,
  "due_day"                     INT,
  "start_date"                  DATE NOT NULL,
  "end_date"                    DATE,
  "active"                      BOOLEAN NOT NULL DEFAULT true,
  "requires_document"           BOOLEAN NOT NULL DEFAULT true,
  "automatic_approval_allowed"  BOOLEAN NOT NULL DEFAULT false,
  "last_generated_competence"   DATE,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "financial_recurring_obligations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "financial_recurring_obligations"
  ADD CONSTRAINT "financial_recurring_obligations_payee_fkey"
  FOREIGN KEY ("payee_id") REFERENCES "financial_payees"("id") ON DELETE RESTRICT;

ALTER TABLE "financial_recurring_obligations"
  ADD CONSTRAINT "financial_recurring_obligations_frequency_chk"
  CHECK ("frequency" IN ('MONTHLY', 'WEEKLY', 'ANNUAL', 'CUSTOM_CALENDAR'));

ALTER TABLE "financial_recurring_obligations"
  ADD CONSTRAINT "financial_recurring_obligations_amount_positive_chk"
  CHECK ("expected_amount_cents" > 0);

CREATE INDEX "financial_recurring_obligations_payee_idx" ON "financial_recurring_obligations" ("payee_id");
CREATE INDEX "financial_recurring_obligations_active_idx" ON "financial_recurring_obligations" ("active") WHERE "active" = true;

-- ═══════════════════════════════════════════════════════════════════
-- 10. FINANCIAL PAYMENT AUDIT
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "financial_payment_audit" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "entity_type"    TEXT NOT NULL,
  "entity_id"      TEXT NOT NULL,
  "action"         TEXT NOT NULL,
  "admin_id"       TEXT,
  "system_actor"   TEXT,
  "details_safe"   JSONB NOT NULL DEFAULT '{}',
  "ip_address"     TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "financial_payment_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_payment_audit_entity_idx" ON "financial_payment_audit" ("entity_type", "entity_id");
CREATE INDEX "financial_payment_audit_admin_idx" ON "financial_payment_audit" ("admin_id") WHERE "admin_id" IS NOT NULL;
CREATE INDEX "financial_payment_audit_created_idx" ON "financial_payment_audit" ("created_at" DESC);
