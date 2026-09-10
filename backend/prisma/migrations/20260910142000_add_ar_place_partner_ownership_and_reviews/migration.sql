ALTER TABLE "ar_places"
ADD COLUMN "owner_partner_id" TEXT;

ALTER TABLE "ar_places"
ADD CONSTRAINT "ar_places_owner_partner_id_fkey"
FOREIGN KEY ("owner_partner_id") REFERENCES "territorial_partners"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "idx_ar_places_owner_partner"
ON "ar_places"("owner_partner_id");

CREATE TABLE "ar_place_partner_change_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ar_place_id" UUID NOT NULL,
  "partner_id" TEXT NOT NULL,
  "submitted_by_partner_user_id" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "locale" "ar_place_locale" NOT NULL DEFAULT 'PT_BR',
  "name" VARCHAR(255) NOT NULL,
  "address" TEXT,
  "summary" TEXT,
  "description" TEXT,
  "learn_more" TEXT,
  "useful_info" TEXT,
  "reviewed_by_admin_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ar_place_partner_change_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ar_place_partner_change_requests_ar_place_id_fkey"
    FOREIGN KEY ("ar_place_id") REFERENCES "ar_places"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT "ar_place_partner_change_requests_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "territorial_partners"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT "ar_place_partner_change_requests_submitted_by_partner_user_id_fkey"
    FOREIGN KEY ("submitted_by_partner_user_id") REFERENCES "partner_users"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE INDEX "idx_ar_place_partner_change_requests_place_status"
ON "ar_place_partner_change_requests"("ar_place_id", "status");

CREATE INDEX "idx_ar_place_partner_change_requests_partner_status"
ON "ar_place_partner_change_requests"("partner_id", "status");

CREATE INDEX "idx_ar_place_partner_change_requests_submitter"
ON "ar_place_partner_change_requests"("submitted_by_partner_user_id");

CREATE UNIQUE INDEX "uq_ar_place_partner_change_requests_pending"
ON "ar_place_partner_change_requests"("ar_place_id")
WHERE "status" = 'PENDING';
