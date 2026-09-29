-- CARE-06A — additive extension of EXISTING official scope sources.
-- No seed, no activation, no payment/dispatcher changes.
-- CARE-04A remains the release barrier.

ALTER TYPE "MunicipalServiceModality"
  ADD VALUE IF NOT EXISTS 'CARE_ASSISTED';
ALTER TYPE "MunicipalServiceModality"
  ADD VALUE IF NOT EXISTS 'CARE_FOLDING_WHEELCHAIR';
ALTER TYPE "MunicipalServiceModality"
  ADD VALUE IF NOT EXISTS 'CARE_ADAPTED_WHEELCHAIR';

ALTER TABLE "municipal_regulations"
  ADD COLUMN "care_scope_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "care_scope_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "care_scope_verified_by_admin_id" TEXT,
  ADD COLUMN "care_scope_document_url" TEXT;

ALTER TABLE "municipal_regulations"
  ADD CONSTRAINT "municipal_regulations_care_verified_by_admin_fkey"
  FOREIGN KEY ("care_scope_verified_by_admin_id")
  REFERENCES "admins"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Exact CARE municipal modalities must be affirmatively reviewed before an
-- active record can ever be used as operational evidence. Existing ordinary
-- CAR/MOTO/TAXI/VAN rows are unaffected.
ALTER TABLE "municipal_regulations"
  ADD CONSTRAINT "municipal_regulations_care_active_requires_review"
  CHECK (
    "service_modality"::text NOT IN (
      'CARE_ASSISTED',
      'CARE_FOLDING_WHEELCHAIR',
      'CARE_ADAPTED_WHEELCHAIR'
    )
    OR "is_active" IS NOT TRUE
    OR (
      "care_scope_verified" IS TRUE
      AND "care_scope_verified_at" IS NOT NULL
      AND "care_scope_verified_by_admin_id" IS NOT NULL
      AND length(trim("care_scope_verified_by_admin_id")) > 0
      AND "care_scope_document_url" IS NOT NULL
      AND length(trim("care_scope_document_url")) > 0
      AND "regulation_status" IN (
        'REGULATED'::"MunicipalRegulationStatus",
        'NOT_REGULATED'::"MunicipalRegulationStatus"
      )
    )
  );

CREATE INDEX "municipal_regulations_care_scope_verified_idx"
  ON "municipal_regulations"("care_scope_verified");

ALTER TABLE "operational_insurance_coverages"
  DROP CONSTRAINT IF EXISTS "operational_insurance_coverages_modality_check";

ALTER TABLE "operational_insurance_coverages"
  ADD CONSTRAINT "operational_insurance_coverages_modality_check"
  CHECK (
    "modality" IN (
      'CAR_PASSENGER',
      'MOTO_PASSENGER',
      'MOTO_DELIVERY',
      'CARE_ASSISTED',
      'CARE_FOLDING_WHEELCHAIR',
      'CARE_ADAPTED_WHEELCHAIR'
    )
  );

ALTER TABLE "operational_insurance_coverages"
  ADD COLUMN "care_scope_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "care_scope_verified_at" TIMESTAMPTZ(6),
  ADD COLUMN "care_scope_verified_by_admin_id" TEXT;

ALTER TABLE "operational_insurance_coverages"
  ADD CONSTRAINT "operational_insurance_coverages_care_verified_by_admin_fkey"
  FOREIGN KEY ("care_scope_verified_by_admin_id")
  REFERENCES "admins"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- A CARE insurance record cannot become ACTIVE merely because a generic policy
-- exists. Exact territory, official document and explicit administrative review
-- are mandatory. Existing generic CAR/MOTO records are unaffected.
ALTER TABLE "operational_insurance_coverages"
  ADD CONSTRAINT "operational_insurance_coverages_care_active_requires_review"
  CHECK (
    "modality" NOT IN (
      'CARE_ASSISTED',
      'CARE_FOLDING_WHEELCHAIR',
      'CARE_ADAPTED_WHEELCHAIR'
    )
    OR "status" <> 'ACTIVE'
    OR (
      "territory_id" IS NOT NULL
      AND "document_url" IS NOT NULL
      AND length(trim("document_url")) > 0
      AND "care_scope_verified" IS TRUE
      AND "care_scope_verified_at" IS NOT NULL
      AND "care_scope_verified_by_admin_id" IS NOT NULL
      AND length(trim("care_scope_verified_by_admin_id")) > 0
      AND "valid_until" >= "valid_from"
    )
  );

CREATE INDEX "operational_insurance_coverages_care_scope_verified_idx"
  ON "operational_insurance_coverages"("care_scope_verified");

ALTER TABLE "driver_insurance_enrollments"
  ADD COLUMN "operational_coverage_id" TEXT,
  ADD COLUMN "operational_coverage_linked_at" TIMESTAMPTZ(6),
  ADD COLUMN "operational_coverage_linked_by_admin_id" TEXT;

ALTER TABLE "driver_insurance_enrollments"
  ADD CONSTRAINT "driver_insurance_enrollments_operational_coverage_id_fkey"
  FOREIGN KEY ("operational_coverage_id")
  REFERENCES "operational_insurance_coverages"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "driver_insurance_enrollments"
  ADD CONSTRAINT "driver_insurance_enrollments_coverage_linked_by_admin_fkey"
  FOREIGN KEY ("operational_coverage_linked_by_admin_id")
  REFERENCES "admins"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "driver_insurance_enrollments_operational_coverage_id_idx"
  ON "driver_insurance_enrollments"("operational_coverage_id");

CREATE INDEX "driver_insurance_enrollments_coverage_linked_by_admin_idx"
  ON "driver_insurance_enrollments"("operational_coverage_linked_by_admin_id");
