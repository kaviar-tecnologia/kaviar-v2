-- Frente 3H: Recurring Automation
-- Templates for recurring obligations + automation config per company

-- 1. Recurring obligation templates
CREATE TABLE "accounting_recurring_templates" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "legal_entity_id" TEXT NOT NULL,
  "obligation_type" "accounting_obligation_type" NOT NULL,
  "description" TEXT NOT NULL,
  "beneficiary" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "day_of_month_due" INTEGER NOT NULL,
  "days_before_due_to_create" INTEGER NOT NULL DEFAULT 15,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "created_by_accountant_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "accounting_rt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_rt_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "accounting_rt_created_by_fk" FOREIGN KEY ("created_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
  CONSTRAINT "accounting_rt_day_check" CHECK ("day_of_month_due" >= 1 AND "day_of_month_due" <= 31),
  CONSTRAINT "accounting_rt_amount_check" CHECK ("amount_cents" > 0)
);

CREATE INDEX "idx_rt_entity" ON "accounting_recurring_templates"("legal_entity_id");
CREATE INDEX "idx_rt_active" ON "accounting_recurring_templates"("is_active") WHERE "is_active" = true;

-- 2. Automation config per company
CREATE TABLE "accounting_automation_config" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "legal_entity_id" TEXT NOT NULL,
  "auto_create_competency" BOOLEAN NOT NULL DEFAULT false,
  "competency_deadline_day" INTEGER DEFAULT 20,
  "auto_create_obligations" BOOLEAN NOT NULL DEFAULT false,
  "send_reminder_d7" BOOLEAN NOT NULL DEFAULT true,
  "send_reminder_d1" BOOLEAN NOT NULL DEFAULT true,
  "send_reminder_due" BOOLEAN NOT NULL DEFAULT true,
  "send_reminder_overdue" BOOLEAN NOT NULL DEFAULT true,
  "notify_accountant_proof" BOOLEAN NOT NULL DEFAULT true,
  "notify_company_pending" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "activated_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "accounting_ac_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_ac_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "accounting_ac_entity_key" ON "accounting_automation_config"("legal_entity_id");

-- 3. Execution log (tracks when automations ran)
CREATE TABLE "accounting_automation_log" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "legal_entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "accounting_al_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accounting_al_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_al_entity_action" ON "accounting_automation_log"("legal_entity_id", "action", "created_at");

-- Seed: Enable automation for KAVIAR only
INSERT INTO "accounting_automation_config" ("legal_entity_id", "auto_create_competency", "auto_create_obligations", "is_active", "activated_at")
SELECT id, true, true, true, NOW()
FROM "legal_entities" WHERE "cnpj" = '67783601000199'
ON CONFLICT ("legal_entity_id") DO NOTHING;
