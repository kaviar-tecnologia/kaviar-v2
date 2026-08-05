-- Frente 3F completion: Obligation access tokens for company self-service
-- Token-based access: company receives link, can view/pay/upload without login

CREATE TABLE "accounting_obligation_access_tokens" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "obligation_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_accountant_id" TEXT NOT NULL,
  "accessed_count" INTEGER NOT NULL DEFAULT 0,
  "last_accessed_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "accounting_oat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_oat_obligation_fk" FOREIGN KEY ("obligation_id") REFERENCES "accounting_payment_obligations"("id") ON DELETE CASCADE,
  CONSTRAINT "accounting_oat_created_by_fk" FOREIGN KEY ("created_by_accountant_id") REFERENCES "accountants"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "accounting_oat_token_hash_key" ON "accounting_obligation_access_tokens"("token_hash");
CREATE INDEX "idx_oat_obligation" ON "accounting_obligation_access_tokens"("obligation_id");
CREATE INDEX "idx_oat_active" ON "accounting_obligation_access_tokens"("is_active", "expires_at") WHERE "is_active" = true;

-- Audit trail table for obligation events
CREATE TABLE "accounting_obligation_audit" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "obligation_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "details" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "accounting_oa_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_oa_audit_obligation_fk" FOREIGN KEY ("obligation_id") REFERENCES "accounting_payment_obligations"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_oa_audit_obligation" ON "accounting_obligation_audit"("obligation_id", "created_at");
CREATE INDEX "idx_oa_audit_action" ON "accounting_obligation_audit"("action", "created_at");

-- Fix: update the KAVIAR entity link to use explicit admin (goes@usbtecnok.com.br)
UPDATE "accountant_entity_links"
SET "created_by_admin_id" = (SELECT id FROM admins WHERE email = 'goes@usbtecnok.com.br' LIMIT 1)
WHERE "legal_entity_id" = 'a1b2c3d4-kavr-4000-8000-000000000001'
  AND "created_by_admin_id" = (SELECT id FROM admins ORDER BY created_at ASC LIMIT 1);
