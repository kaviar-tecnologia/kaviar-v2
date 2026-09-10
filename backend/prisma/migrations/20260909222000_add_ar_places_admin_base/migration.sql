-- CreateEnum
CREATE TYPE "ar_place_type" AS ENUM ('HOTEL', 'COMMERCE', 'TOURISM', 'CARE', 'PET', 'AIRPORT');

-- CreateEnum
CREATE TYPE "ar_place_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ar_place_locale" AS ENUM ('PT_BR', 'EN', 'ES', 'FR');

-- CreateTable
CREATE TABLE "ar_places" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "place_id" VARCHAR(120) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "ar_place_type" NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "status" "ar_place_status" NOT NULL DEFAULT 'DRAFT',
    "territory_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ar_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_place_contents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ar_place_id" UUID NOT NULL,
    "locale" "ar_place_locale" NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "learn_more" TEXT,
    "useful_info" TEXT,
    "grounding_rule" TEXT,
    "boundary_rule" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ar_place_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ar_places_place_id_key" ON "ar_places"("place_id");

-- CreateIndex
CREATE INDEX "idx_ar_places_type" ON "ar_places"("type");

-- CreateIndex
CREATE INDEX "idx_ar_places_status" ON "ar_places"("status");

-- CreateIndex
CREATE INDEX "idx_ar_places_territory" ON "ar_places"("territory_id");

-- CreateIndex
CREATE INDEX "idx_ar_places_city_state" ON "ar_places"("city", "state");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ar_place_contents_place_locale" ON "ar_place_contents"("ar_place_id", "locale");

-- CreateIndex
CREATE INDEX "idx_ar_place_contents_locale" ON "ar_place_contents"("locale");

-- AddForeignKey
ALTER TABLE "ar_places" ADD CONSTRAINT "ar_places_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_place_contents" ADD CONSTRAINT "ar_place_contents_ar_place_id_fkey" FOREIGN KEY ("ar_place_id") REFERENCES "ar_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
