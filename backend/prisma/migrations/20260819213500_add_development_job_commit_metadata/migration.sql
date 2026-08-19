ALTER TABLE "development_jobs"
  ADD COLUMN IF NOT EXISTS "result_branch" TEXT,
  ADD COLUMN IF NOT EXISTS "result_commit_sha" TEXT;
