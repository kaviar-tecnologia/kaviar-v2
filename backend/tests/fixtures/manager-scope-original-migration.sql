-- Versioned, prospective financial scope. Existing assignments retain their
-- entire territory until an explicit version becomes effective.
CREATE TABLE "territory_manager_neighborhood_scope_versions" (
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

CREATE UNIQUE INDEX "territory_manager_neighborhood_scope_versions_assignment_id_effective_from_key"
  ON "territory_manager_neighborhood_scope_versions" ("assignment_id", "effective_from");
CREATE INDEX "territory_manager_neighborhood_scope_versions_assignment_id_effective_from_idx"
  ON "territory_manager_neighborhood_scope_versions" ("assignment_id", "effective_from" DESC);

ALTER TABLE "territory_manager_neighborhood_scope_versions"
  ADD CONSTRAINT "territory_manager_neighborhood_scope_versions_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "territory_manager_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
