-- Frente 3D: Certificates, Powers of Attorney, Legal Representation Health
-- Answers: "Does the accountant have everything needed to legally represent this company?"

-- 1. Enums
CREATE TYPE "accounting_certificate_type" AS ENUM ('E_CNPJ_A1', 'E_CNPJ_A3', 'E_CPF_A1', 'E_CPF_A3', 'NF_E', 'OTHER');
CREATE TYPE "accounting_certificate_status" AS ENUM ('ACTIVE', 'REVOKED', 'REPLACED');
CREATE TYPE "accounting_certificate_mode" AS ENUM ('EXTERNAL', 'METADATA_ONLY', 'KAVIAR_MANAGED');
CREATE TYPE "accounting_power_of_attorney_status" AS ENUM ('ACTIVE', 'REVOKED', 'REPLACED', 'SUSPENDED');
CREATE TYPE "accounting_power_of_attorney_scope" AS ENUM ('ECAC', 'PREFEITURA', 'SEFAZ', 'JUNTA_COMERCIAL', 'INSS', 'FGTS', 'OUTRO');

-- 2. Digital Certificates
CREATE TABLE "accounting_certificates" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "legal_entity_id" TEXT NOT NULL,
    "certificate_type" "accounting_certificate_type" NOT NULL,
    "mode" "accounting_certificate_mode" NOT NULL DEFAULT 'METADATA_ONLY',
    "status" "accounting_certificate_status" NOT NULL DEFAULT 'ACTIVE',
    "holder_name" TEXT NOT NULL,
    "holder_document" TEXT,
    "serial_number" TEXT,
    "issuer" TEXT,
    "issued_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "storage_location" TEXT,
    "notes" TEXT,
    "responsible_accountant_id" TEXT,
    "replaced_by_id" TEXT,
    "created_by_id" TEXT,
    "created_by_type" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "accounting_certificates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_certificates_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
    CONSTRAINT "accounting_certificates_responsible_fk" FOREIGN KEY ("responsible_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
    CONSTRAINT "accounting_certificates_replaced_by_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "accounting_certificates"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_certificates_entity" ON "accounting_certificates"("legal_entity_id");
CREATE INDEX "idx_certificates_entity_status" ON "accounting_certificates"("legal_entity_id", "status");
CREATE INDEX "idx_certificates_expires" ON "accounting_certificates"("expires_at") WHERE "status" = 'ACTIVE';
CREATE INDEX "idx_certificates_responsible" ON "accounting_certificates"("responsible_accountant_id");
CREATE INDEX "idx_certificates_type_status" ON "accounting_certificates"("certificate_type", "status");

-- 3. Powers of Attorney (Procurações)
CREATE TABLE "accounting_powers_of_attorney" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "legal_entity_id" TEXT NOT NULL,
    "scope" "accounting_power_of_attorney_scope" NOT NULL,
    "scope_detail" TEXT,
    "status" "accounting_power_of_attorney_status" NOT NULL DEFAULT 'ACTIVE',
    "grantor_name" TEXT NOT NULL,
    "grantor_document" TEXT,
    "grantee_name" TEXT NOT NULL,
    "grantee_document" TEXT,
    "issued_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "protocol_number" TEXT,
    "notes" TEXT,
    "responsible_accountant_id" TEXT,
    "document_file_id" TEXT,
    "replaced_by_id" TEXT,
    "created_by_id" TEXT,
    "created_by_type" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "accounting_powers_of_attorney_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_poa_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
    CONSTRAINT "accounting_poa_responsible_fk" FOREIGN KEY ("responsible_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
    CONSTRAINT "accounting_poa_file_fk" FOREIGN KEY ("document_file_id") REFERENCES "accounting_company_document_files"("id") ON DELETE SET NULL,
    CONSTRAINT "accounting_poa_replaced_by_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "accounting_powers_of_attorney"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_poa_entity" ON "accounting_powers_of_attorney"("legal_entity_id");
CREATE INDEX "idx_poa_entity_scope" ON "accounting_powers_of_attorney"("legal_entity_id", "scope");
CREATE INDEX "idx_poa_entity_status" ON "accounting_powers_of_attorney"("legal_entity_id", "status");
CREATE INDEX "idx_poa_expires" ON "accounting_powers_of_attorney"("expires_at") WHERE "status" = 'ACTIVE' AND "expires_at" IS NOT NULL;
CREATE INDEX "idx_poa_responsible" ON "accounting_powers_of_attorney"("responsible_accountant_id");

-- 4. Seed: Initial required items per company (fiscal health rules)
-- This defines WHAT a company needs to be "healthy"
CREATE TABLE "accounting_fiscal_health_rules" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rule_type" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "severity" TEXT NOT NULL DEFAULT 'CRITICAL',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "accounting_fiscal_health_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_fiscal_health_rules_code_key" ON "accounting_fiscal_health_rules"("code");

-- Seed fiscal health rules
INSERT INTO "accounting_fiscal_health_rules" ("id", "code", "name", "description", "rule_type", "is_required", "severity", "sort_order")
VALUES
  (gen_random_uuid()::text, 'CERT_DIGITAL_VALID', 'Certificado Digital válido', 'Empresa deve possuir certificado digital ativo e não vencido', 'CERTIFICATE', true, 'CRITICAL', 1),
  (gen_random_uuid()::text, 'PROC_ECAC_VALID', 'Procuração e-CAC válida', 'Procuração eletrônica para acesso ao e-CAC ativa', 'POWER_OF_ATTORNEY', true, 'CRITICAL', 2),
  (gen_random_uuid()::text, 'PROC_PREFEITURA_VALID', 'Procuração Prefeitura válida', 'Procuração para representação junto à prefeitura', 'POWER_OF_ATTORNEY', false, 'WARNING', 3),
  (gen_random_uuid()::text, 'PROC_SEFAZ_VALID', 'Procuração SEFAZ válida', 'Procuração para representação junto à SEFAZ', 'POWER_OF_ATTORNEY', false, 'WARNING', 4),
  (gen_random_uuid()::text, 'DOC_CONTRATO_SOCIAL', 'Contrato Social presente', 'Cópia do contrato social arquivada', 'DOCUMENT', true, 'CRITICAL', 5),
  (gen_random_uuid()::text, 'DOC_CARTAO_CNPJ', 'Cartão CNPJ presente', 'Cartão CNPJ atualizado', 'DOCUMENT', true, 'WARNING', 6);
