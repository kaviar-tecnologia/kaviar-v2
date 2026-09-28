-- CARE-02 — additive data contract only. NO seed, dispatch or activation.
-- All qualification and vehicle records start PENDING. Trip requirements start DRAFT.
-- Existing rides/drivers and finance tables are not altered.

CREATE TYPE "CareRideMode" AS ENUM ('ASSISTED', 'FOLDING_WHEELCHAIR', 'ADAPTED_WHEELCHAIR');
CREATE TYPE "CareQualificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'EXPIRED');
CREATE TYPE "CareTripStatus" AS ENUM ('DRAFT', 'READY', 'BLOCKED');

CREATE TABLE "care_trip_requirements" (
  "id" TEXT NOT NULL,
  "ride_id" TEXT NOT NULL,
  "mode" "CareRideMode" NOT NULL,
  "status" "CareTripStatus" NOT NULL DEFAULT 'DRAFT',
  "needs_extra_boarding_time" BOOLEAN NOT NULL DEFAULT false,
  "uses_walking_aid" BOOLEAN NOT NULL DEFAULT false,
  "folding_wheelchair" BOOLEAN NOT NULL DEFAULT false,
  "remain_in_wheelchair" BOOLEAN NOT NULL DEFAULT false,
  "can_self_transfer" BOOLEAN,
  "needs_pickup_guidance" BOOLEAN NOT NULL DEFAULT false,
  "guide_dog" BOOLEAN NOT NULL DEFAULT false,
  "companion_seats" INTEGER NOT NULL DEFAULT 0,
  "reviewed_at" TIMESTAMPTZ(6),
  "reviewed_by_admin_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_trip_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "care_trip_companion_seats_range" CHECK ("companion_seats" BETWEEN 0 AND 16),
  CONSTRAINT "care_trip_mode_consistency" CHECK (
    ("mode" <> 'ASSISTED' OR (NOT "folding_wheelchair" AND NOT "remain_in_wheelchair"))
    AND ("mode" <> 'FOLDING_WHEELCHAIR' OR
      ("folding_wheelchair" AND NOT "remain_in_wheelchair" AND "can_self_transfer" IS TRUE))
    AND ("mode" <> 'ADAPTED_WHEELCHAIR' OR "remain_in_wheelchair")
  ),
  CONSTRAINT "care_trip_ready_requires_review" CHECK (
    "status" <> 'READY' OR ("reviewed_at" IS NOT NULL AND "reviewed_by_admin_id" IS NOT NULL AND length(trim("reviewed_by_admin_id")) > 0)
  )
);
CREATE UNIQUE INDEX "care_trip_requirements_ride_id_key" ON "care_trip_requirements"("ride_id");
CREATE INDEX "care_trip_requirements_mode_status_idx" ON "care_trip_requirements"("mode", "status");
ALTER TABLE "care_trip_requirements"
  ADD CONSTRAINT "care_trip_requirements_ride_id_fkey"
  FOREIGN KEY ("ride_id") REFERENCES "rides_v2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "care_driver_qualifications" (
  "id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "status" "CareQualificationStatus" NOT NULL DEFAULT 'PENDING',
  "assisted_training_verified" BOOLEAN NOT NULL DEFAULT false,
  "folding_training_verified" BOOLEAN NOT NULL DEFAULT false,
  "adapted_training_verified" BOOLEAN NOT NULL DEFAULT false,
  "valid_until" TIMESTAMPTZ(6),
  "verified_at" TIMESTAMPTZ(6),
  "verified_by_admin_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_driver_qualifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "care_driver_verified_requires_evidence" CHECK (
    "status" <> 'VERIFIED' OR (
      "verified_at" IS NOT NULL
      AND "verified_by_admin_id" IS NOT NULL
      AND length(trim("verified_by_admin_id")) > 0
      AND "valid_until" IS NOT NULL
      AND "valid_until" > "verified_at"
      AND ("assisted_training_verified" OR "folding_training_verified" OR "adapted_training_verified")
    )
  )
);
CREATE UNIQUE INDEX "care_driver_qualifications_driver_id_key" ON "care_driver_qualifications"("driver_id");
CREATE INDEX "care_driver_qualifications_status_valid_until_idx" ON "care_driver_qualifications"("status", "valid_until");
ALTER TABLE "care_driver_qualifications"
  ADD CONSTRAINT "care_driver_qualifications_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "care_vehicle_capabilities" (
  "id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "plate_snapshot" VARCHAR(16),
  "status" "CareQualificationStatus" NOT NULL DEFAULT 'PENDING',
  "folding_storage_verified" BOOLEAN NOT NULL DEFAULT false,
  "ramp_or_lift_verified" BOOLEAN NOT NULL DEFAULT false,
  "wheelchair_restraint_verified" BOOLEAN NOT NULL DEFAULT false,
  "occupant_restraint_verified" BOOLEAN NOT NULL DEFAULT false,
  "adaptation_document_verified" BOOLEAN NOT NULL DEFAULT false,
  "wheelchair_capacity" INTEGER NOT NULL DEFAULT 0,
  "companion_seats" INTEGER NOT NULL DEFAULT 0,
  "inspection_valid_until" TIMESTAMPTZ(6),
  "verified_at" TIMESTAMPTZ(6),
  "verified_by_admin_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_vehicle_capabilities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "care_vehicle_capacity_range" CHECK (
    "wheelchair_capacity" BETWEEN 0 AND 8 AND "companion_seats" BETWEEN 0 AND 32
  ),
  CONSTRAINT "care_vehicle_verified_requires_review" CHECK (
    "status" <> 'VERIFIED' OR (
      "plate_snapshot" IS NOT NULL
      AND length(trim("plate_snapshot")) > 0
      AND "verified_at" IS NOT NULL
      AND "verified_by_admin_id" IS NOT NULL
      AND length(trim("verified_by_admin_id")) > 0
      AND "inspection_valid_until" IS NOT NULL
      AND "inspection_valid_until" > "verified_at"
    )
  ),
  CONSTRAINT "care_vehicle_adapted_requires_equipment" CHECK (
    "status" <> 'VERIFIED' OR "wheelchair_capacity" = 0 OR
    (
      "ramp_or_lift_verified"
      AND "wheelchair_restraint_verified"
      AND "occupant_restraint_verified"
      AND "adaptation_document_verified"
    )
  )
);
CREATE UNIQUE INDEX "care_vehicle_capabilities_driver_id_key" ON "care_vehicle_capabilities"("driver_id");
CREATE INDEX "care_vehicle_capabilities_status_inspection_valid_until_idx"
  ON "care_vehicle_capabilities"("status", "inspection_valid_until");
ALTER TABLE "care_vehicle_capabilities"
  ADD CONSTRAINT "care_vehicle_capabilities_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
