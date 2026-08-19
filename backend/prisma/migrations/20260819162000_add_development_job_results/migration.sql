ALTER TABLE "development_jobs"
  ADD COLUMN IF NOT EXISTS "result_changed_paths" JSONB,
  ADD COLUMN IF NOT EXISTS "result_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "error_message" TEXT,
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ;
