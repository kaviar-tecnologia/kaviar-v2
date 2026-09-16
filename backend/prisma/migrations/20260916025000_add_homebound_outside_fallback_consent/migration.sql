ALTER TABLE "rides_v2"
ADD COLUMN "outside_fallback_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "outside_fallback_consented_at" TIMESTAMP(3);
