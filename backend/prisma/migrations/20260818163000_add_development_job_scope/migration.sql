-- KAVIAR Development Agent
-- Persist immutable scope before human confirmation.

ALTER TABLE "development_jobs"
  ADD COLUMN "allowed_paths" JSONB,
  ADD COLUMN "scope_rationale" TEXT,
  ADD COLUMN "scope_resolved_at" TIMESTAMPTZ;

ALTER TABLE "development_jobs"
  ALTER COLUMN "status"
  SET DEFAULT 'AWAITING_SCOPE';
