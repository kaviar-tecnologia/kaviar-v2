-- Versioned, prospective financial scope. Existing assignments retain their
-- entire territory until an explicit version becomes effective.
-- Prisma v5/PostgreSQL can leave committed DDL after a failed migration.
-- Replaying after `prisma migrate resolve --rolled-back` is intentionally safe
-- for the observed state: the table and its UNIQUE index may already exist.
-- The UNIQUE B-tree already serves (assignment_id, effective_from DESC) scans;
-- a second index would have its long name truncated to the same 63-byte ID.
BEGIN;

CREATE TABLE IF NOT EXISTS "territory_manager_neighborhood_scope_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "assignment_id" UUID NOT NULL,
  "neighborhood_ids" TEXT[] NOT NULL,
  "effective_from" TIMESTAMPTZ NOT NULL,
  "agreement_reference" TEXT NOT NULL,
  "change_reason" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "canceled_at" TIMESTAMPTZ,
  "canceled_by" TEXT,
  "cancel_reason" TEXT,
  CONSTRAINT "territory_manager_neighborhood_scope_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manager_scope_nonempty_reason" CHECK (length(btrim("change_reason")) >= 10),
  CONSTRAINT "manager_scope_nonempty_agreement" CHECK (length(btrim("agreement_reference")) >= 8),
  CONSTRAINT "manager_scope_no_null_neighborhoods" CHECK (array_position("neighborhood_ids", NULL) IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "territory_manager_neighborhood_scope_versions_assignment_id_effective_from_key"
  ON "territory_manager_neighborhood_scope_versions" ("assignment_id", "effective_from");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'territory_manager_neighborhood_scope_versions'::regclass
      AND confrelid = 'territory_manager_assignments'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE "territory_manager_neighborhood_scope_versions"
      ADD CONSTRAINT "territory_manager_neighborhood_scope_versions_assignment_id_fkey"
      FOREIGN KEY ("assignment_id") REFERENCES "territory_manager_assignments"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
