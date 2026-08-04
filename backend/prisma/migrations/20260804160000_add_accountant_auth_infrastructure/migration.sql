-- CreateEnum
CREATE TYPE "accountant_session_status" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED', 'COMPROMISED');

-- CreateEnum
CREATE TYPE "accountant_reset_status" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');

-- AlterTable: accountants
ALTER TABLE "accountants" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "accountants" ADD COLUMN "password_changed_at" TIMESTAMPTZ;
ALTER TABLE "accountants" ADD COLUMN "password_version" INT NOT NULL DEFAULT 1;
ALTER TABLE "accountants" ADD COLUMN "failed_login_count" INT NOT NULL DEFAULT 0;
ALTER TABLE "accountants" ADD COLUMN "locked_until" TIMESTAMPTZ;
ALTER TABLE "accountants" ADD COLUMN "last_login_at" TIMESTAMPTZ;
ALTER TABLE "accountants" ADD COLUMN "terms_accepted_at" TIMESTAMPTZ;
ALTER TABLE "accountants" DROP COLUMN IF EXISTS "last_access_at";

-- AlterTable: accountant_invites
ALTER TABLE "accountant_invites" ADD COLUMN "resent_count" INT NOT NULL DEFAULT 0;
ALTER TABLE "accountant_invites" ADD COLUMN "last_sent_at" TIMESTAMPTZ;
ALTER TABLE "accountant_invites" ADD COLUMN "revoked_by_admin_id" TEXT REFERENCES "admins"("id");
ALTER TABLE "accountant_invites" ADD COLUMN "accepted_ip" TEXT;
ALTER TABLE "accountant_invites" ADD COLUMN "accepted_user_agent" TEXT;

-- AlterTable: accountant_entity_links
ALTER TABLE "accountant_entity_links" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: legal_entities
ALTER TABLE "legal_entities" ADD COLUMN "codigo_interno" TEXT;
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_codigo_interno_key" UNIQUE ("codigo_interno");

-- CreateTable: accountant_sessions
CREATE TABLE "accountant_sessions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "accountant_id" TEXT NOT NULL,
  "token_family_id" TEXT NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "generation" INT NOT NULL DEFAULT 1,
  "parent_session_id" TEXT,
  "replaced_by_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "scope" TEXT NOT NULL DEFAULT 'WEB',
  "device_name" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_ip" TEXT,
  "last_activity_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "rotated_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "revocation_reason" TEXT,
  "reuse_detected_at" TIMESTAMPTZ,

  CONSTRAINT "accountant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: accountant_password_resets
CREATE TABLE "accountant_password_resets" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "accountant_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "requested_ip" TEXT,
  "requested_user_agent" TEXT,
  "used_at" TIMESTAMPTZ,
  "used_ip" TEXT,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "accountant_password_resets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "accountant_sessions" ADD CONSTRAINT "accountant_sessions_accountant_id_fkey" FOREIGN KEY ("accountant_id") REFERENCES "accountants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_password_resets" ADD CONSTRAINT "accountant_password_resets_accountant_id_fkey" FOREIGN KEY ("accountant_id") REFERENCES "accountants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "idx_sessions_accountant_status" ON "accountant_sessions" ("accountant_id", "status");
CREATE INDEX "idx_sessions_family_status" ON "accountant_sessions" ("token_family_id", "status");
CREATE INDEX "idx_sessions_refresh_hash" ON "accountant_sessions" ("refresh_token_hash");
CREATE INDEX "idx_resets_accountant_status" ON "accountant_password_resets" ("accountant_id", "status");
CREATE INDEX "idx_resets_token_hash" ON "accountant_password_resets" ("token_hash");
CREATE INDEX "idx_links_accountant_status_start" ON "accountant_entity_links" ("accountant_id", "status", "starts_at");
CREATE INDEX "idx_entities_codigo_interno" ON "legal_entities" ("codigo_interno") WHERE "codigo_interno" IS NOT NULL;
