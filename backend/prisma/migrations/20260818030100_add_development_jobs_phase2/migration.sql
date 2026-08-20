-- KAVIAR Development Agent — Phase 2
-- Persistence + human confirmation only.
-- No worker, OpenHands, Git, GitHub, merge or deploy execution.

CREATE TABLE "development_jobs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "requested_by_admin_id" TEXT NOT NULL,
    "confirmed_by_admin_id" TEXT,
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "development_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "development_jobs_requested_by_admin_id_fkey"
      FOREIGN KEY ("requested_by_admin_id")
      REFERENCES "admins"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE,
    CONSTRAINT "development_jobs_confirmed_by_admin_id_fkey"
      FOREIGN KEY ("confirmed_by_admin_id")
      REFERENCES "admins"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE
);

CREATE INDEX "development_jobs_status_created_at_idx"
  ON "development_jobs"("status", "created_at");

CREATE INDEX "development_jobs_requested_by_admin_id_idx"
  ON "development_jobs"("requested_by_admin_id");

CREATE INDEX "development_jobs_confirmed_by_admin_id_idx"
  ON "development_jobs"("confirmed_by_admin_id");
