-- CreateTable: territorial_dataset_versions
-- Tabela NOVA. Não altera nenhuma tabela existente. Apenas cria a tabela e índices.
-- NÃO aplicar em produção sem autorização (nada de prisma migrate deploy aqui).
CREATE TABLE "territorial_dataset_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" TEXT NOT NULL,
    "uf" VARCHAR(2) NOT NULL,
    "provider_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "method" TEXT,
    "collected_at" TIMESTAMPTZ NOT NULL,
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "source_verified" BOOLEAN NOT NULL DEFAULT false,
    "s3_raw_key" TEXT,
    "s3_normalized_key" TEXT,
    "feature_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "out_of_bbox_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ,
    "notes" TEXT,
    "checksum" TEXT,

    CONSTRAINT "territorial_dataset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "territorial_dataset_versions_city_uf_idx" ON "territorial_dataset_versions"("city", "uf");
CREATE INDEX "territorial_dataset_versions_status_idx" ON "territorial_dataset_versions"("status");
CREATE INDEX "territorial_dataset_versions_provider_id_idx" ON "territorial_dataset_versions"("provider_id");
CREATE INDEX "territorial_dataset_versions_uf_city_created_at_idx" ON "territorial_dataset_versions"("uf", "city", "created_at" DESC);
