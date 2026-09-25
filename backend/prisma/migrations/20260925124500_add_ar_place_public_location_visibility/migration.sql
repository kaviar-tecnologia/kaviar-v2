-- Keep exact AR-place location data available to admins while allowing public APIs to hide it.
ALTER TABLE "ar_places"
ADD COLUMN "public_location_enabled" BOOLEAN NOT NULL DEFAULT TRUE;

-- Existing KAVIAR-owned representations are private by default for safety.
UPDATE "ar_places"
SET "public_location_enabled" = FALSE
WHERE "type" = 'KAVIAR_POINT';

COMMENT ON COLUMN "ar_places"."public_location_enabled"
IS 'When false, public AR responses omit address and exact latitude/longitude; admin data remains intact.';
