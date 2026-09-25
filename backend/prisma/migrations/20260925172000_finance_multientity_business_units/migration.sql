-- Finance multi-entity + independent business-unit dimensions
-- Adds explicit CNPJ ownership, product/service segmentation and dated entity-territory responsibility.
-- Existing rows remain valid with NULL dimensions; no historical attribution is guessed.

CREATE TABLE "financial_business_units" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_business_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_business_units_code_key" ON "financial_business_units"("code");
CREATE INDEX "financial_business_units_is_active_sort_order_idx" ON "financial_business_units"("is_active", "sort_order");

INSERT INTO "financial_business_units" ("id","code","name","description","is_system","is_active","sort_order","updated_at")
VALUES
  ('fbu_corporate','CORPORATE','Corporativo','Custos e receitas corporativos compartilhados',true,true,10,CURRENT_TIMESTAMP),
  ('fbu_mobility','MOBILITY','Mobilidade','Corridas e operação de mobilidade KAVIAR',true,true,20,CURRENT_TIMESTAMP),
  ('fbu_kaviar_ar','KAVIAR_AR','KAVIAR AR','Realidade aumentada, guia e experiências AR',true,true,30,CURRENT_TIMESTAMP),
  ('fbu_commerce','COMMERCE','Comércio','Parcerias e produtos de comércio local',true,true,40,CURRENT_TIMESTAMP),
  ('fbu_premium','PREMIUM','Premium','Turismo, aeroporto e serviços premium',true,true,50,CURRENT_TIMESTAMP),
  ('fbu_pet','PET','Pet','Produtos e serviços KAVIAR Pet',true,true,60,CURRENT_TIMESTAMP),
  ('fbu_care','CARE','Care','Produtos e serviços KAVIAR Care',true,true,70,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "financial_entity_territory_assignments" (
  "id" TEXT NOT NULL,
  "legal_entity_id" TEXT NOT NULL,
  "territory_id" TEXT NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_entity_territory_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "financial_entity_territory_assignments_entity_active_idx"
  ON "financial_entity_territory_assignments"("legal_entity_id","is_active");
CREATE INDEX "financial_entity_territory_assignments_territory_active_idx"
  ON "financial_entity_territory_assignments"("territory_id","is_active");
CREATE INDEX "financial_entity_territory_assignments_effective_idx"
  ON "financial_entity_territory_assignments"("effective_from","effective_until");

ALTER TABLE "financial_recognition_policies"
  ADD COLUMN "legal_entity_id" TEXT,
  ADD COLUMN "business_unit_id" TEXT;

ALTER TABLE "financial_accounts"
  ADD COLUMN "legal_entity_id" TEXT;

ALTER TABLE "financial_transactions"
  ADD COLUMN "legal_entity_id" TEXT,
  ADD COLUMN "business_unit_id" TEXT;

ALTER TABLE "financial_transaction_allocations"
  ADD COLUMN "business_unit_id" TEXT;

ALTER TABLE "financial_obligations"
  ADD COLUMN "legal_entity_id" TEXT,
  ADD COLUMN "business_unit_id" TEXT;

CREATE INDEX "financial_recognition_policies_legal_entity_id_idx" ON "financial_recognition_policies"("legal_entity_id");
CREATE INDEX "financial_recognition_policies_business_unit_id_idx" ON "financial_recognition_policies"("business_unit_id");
CREATE INDEX "financial_accounts_legal_entity_id_idx" ON "financial_accounts"("legal_entity_id");
CREATE INDEX "financial_transactions_legal_entity_id_competence_date_idx" ON "financial_transactions"("legal_entity_id","competence_date");
CREATE INDEX "financial_transactions_business_unit_id_competence_date_idx" ON "financial_transactions"("business_unit_id","competence_date");
CREATE INDEX "financial_transaction_allocations_business_unit_id_idx" ON "financial_transaction_allocations"("business_unit_id");
CREATE INDEX "financial_obligations_legal_entity_id_idx" ON "financial_obligations"("legal_entity_id");
CREATE INDEX "financial_obligations_business_unit_id_idx" ON "financial_obligations"("business_unit_id");

ALTER TABLE "financial_recognition_policies"
  ADD CONSTRAINT "financial_recognition_policies_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_recognition_policies_business_unit_id_fkey"
  FOREIGN KEY ("business_unit_id") REFERENCES "financial_business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_accounts"
  ADD CONSTRAINT "financial_accounts_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_transactions_business_unit_id_fkey"
  FOREIGN KEY ("business_unit_id") REFERENCES "financial_business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_transaction_allocations"
  ADD CONSTRAINT "financial_transaction_allocations_business_unit_id_fkey"
  FOREIGN KEY ("business_unit_id") REFERENCES "financial_business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_obligations"
  ADD CONSTRAINT "financial_obligations_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_obligations_business_unit_id_fkey"
  FOREIGN KEY ("business_unit_id") REFERENCES "financial_business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_entity_territory_assignments"
  ADD CONSTRAINT "financial_entity_territory_assignments_legal_entity_id_fkey"
  FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_entity_territory_assignments_territory_id_fkey"
  FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
