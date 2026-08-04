-- Migration: Add partial indexes for accounting portal
-- Replaces the naive @@unique on accountant_entity_links (which prevents multiple REVOKED records)
-- and adds a partial unique index to accountant_invites for one PENDING per accountant.

-- 1. Drop the existing composite unique constraint on accountant_entity_links
DROP INDEX IF EXISTS "uq_active_link";

-- 2. Create partial unique index: only one ACTIVE link per (accountant_id, legal_entity_id, scope)
CREATE UNIQUE INDEX "uq_active_link"
  ON "accountant_entity_links" ("accountant_id", "legal_entity_id", "scope")
  WHERE "status" = 'ACTIVE';

-- 3. Create partial unique index on accountant_invites: only one PENDING per accountant
CREATE UNIQUE INDEX "uq_accountant_invite_pending"
  ON "accountant_invites" ("accountant_id")
  WHERE "status" = 'PENDING';
