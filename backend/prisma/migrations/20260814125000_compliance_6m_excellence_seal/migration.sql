-- Compliance: add emission_date for 6-month validity calculation
ALTER TABLE "driver_compliance_documents"
  ADD COLUMN IF NOT EXISTS "emission_date" DATE;

CREATE INDEX IF NOT EXISTS "idx_compliance_emission_date_current"
  ON "driver_compliance_documents"("emission_date")
  WHERE "is_current" = true;

-- Badge Events: audit trail for EXCELLENCE_SEAL and future badges
CREATE TABLE IF NOT EXISTS "driver_badge_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "driver_id" TEXT NOT NULL,
  "badge_code" VARCHAR(50) NOT NULL,
  "event_type" VARCHAR(30) NOT NULL,
  "reason" TEXT,
  "criteria_snapshot" JSONB,
  "admin_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "driver_badge_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "driver_badge_events_driver_fkey" FOREIGN KEY ("driver_id")
    REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_badge_events_driver_code_date"
  ON "driver_badge_events"("driver_id", "badge_code", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_badge_events_code_type"
  ON "driver_badge_events"("badge_code", "event_type");
