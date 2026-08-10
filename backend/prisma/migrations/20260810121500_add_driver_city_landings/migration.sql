-- CreateTable
CREATE TABLE "driver_city_landings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "public_status" VARCHAR(32) NOT NULL,
    "landing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_number" VARCHAR(20),
    "created_by_admin_id" UUID,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_city_landings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_city_landings_slug_key" ON "driver_city_landings"("slug");

-- CreateIndex
CREATE INDEX "idx_driver_city_landings_slug" ON "driver_city_landings"("slug");

-- CreateIndex
CREATE INDEX "idx_driver_city_landings_enabled" ON "driver_city_landings"("landing_enabled");

-- CreateIndex
CREATE INDEX "idx_driver_city_landings_status" ON "driver_city_landings"("public_status");

-- Seed initial cities (idempotent via ON CONFLICT)
INSERT INTO "driver_city_landings" ("id", "city", "state", "slug", "public_status", "landing_enabled", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Santa Cruz das Palmeiras', 'SP', 'santa-cruz-das-palmeiras-sp', 'IMPLANTACAO', true, NOW(), NOW()),
  (gen_random_uuid(), 'Tambaú', 'SP', 'tambau-sp', 'RECRUTAMENTO', true, NOW(), NOW()),
  (gen_random_uuid(), 'Pirassununga', 'SP', 'pirassununga-sp', 'IMPLANTACAO', false, NOW(), NOW()),
  (gen_random_uuid(), 'Itaperuna', 'RJ', 'itaperuna-rj', 'IMPLANTACAO', false, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
