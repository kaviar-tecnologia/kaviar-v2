-- Refuse deployment if existing duplicates require manual reconciliation.
-- Do not remove or modify existing assignments or referral agents.
BEGIN;

CREATE UNIQUE INDEX "tma_pending_admin_territory_unique"
  ON "territory_manager_assignments" ("admin_id", "territory_id")
  WHERE "status" = 'pending_approval';

CREATE UNIQUE INDEX "referral_agents_operator_email_unique"
  ON "referral_agents" ("email")
  WHERE "email" LIKE 'operator:%';

COMMIT;
