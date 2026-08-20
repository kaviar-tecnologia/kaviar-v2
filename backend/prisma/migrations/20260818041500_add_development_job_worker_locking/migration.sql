-- KAVIAR Development Agent — Phase 3 worker locking.
-- Queue capture and stale-job recovery only.
-- No OpenHands, Gemini, Git, GitHub, merge or deploy execution.

ALTER TABLE "development_jobs"
  ADD COLUMN "started_at" TIMESTAMPTZ,
  ADD COLUMN "locked_at" TIMESTAMPTZ,
  ADD COLUMN "locked_by" TEXT,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "development_jobs_status_locked_at_idx"
  ON "development_jobs"("status", "locked_at");
