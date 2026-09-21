CREATE TABLE "driver_insurance_enrollments" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "vehicle_plate" VARCHAR(20) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "cancelled_at" DATE,
    "provider_reference" VARCHAR(120),
    "request_payload" JSONB NOT NULL,
    "provider_response" JSONB,
    "last_error_code" VARCHAR(50),
    "last_error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_insurance_enrollments_pkey"
      PRIMARY KEY ("id"),

    CONSTRAINT "driver_insurance_enrollments_driver_id_fkey"
      FOREIGN KEY ("driver_id")
      REFERENCES "drivers"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ux_driver_insurance_provider_plate_from"
ON "driver_insurance_enrollments"
("driver_id", "provider", "vehicle_plate", "valid_from");

CREATE INDEX "driver_insurance_enrollments_driver_id_idx"
ON "driver_insurance_enrollments"("driver_id");

CREATE INDEX "driver_insurance_enrollments_provider_status_idx"
ON "driver_insurance_enrollments"("provider", "status");

CREATE INDEX "driver_insurance_enrollments_provider_reference_idx"
ON "driver_insurance_enrollments"("provider_reference");

CREATE INDEX "driver_insurance_enrollments_valid_until_idx"
ON "driver_insurance_enrollments"("valid_until");
