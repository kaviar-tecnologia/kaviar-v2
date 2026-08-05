-- Frente 3C: Document management for Accountant Portal
-- Creates: document types catalog, company documents, document files (versions)
-- Status: operational lifecycle only (no temporal EXPIRED state)
-- Temporal expiry derived from expires_at at query time

-- 1. Enums
CREATE TYPE "accounting_document_category" AS ENUM ('SOCIETARIO', 'FISCAL', 'TRABALHISTA', 'CERTIFICADO', 'PROCURACAO', 'LICENCA', 'INSCRICAO', 'OUTRO');
CREATE TYPE "accounting_document_status" AS ENUM ('DRAFT', 'SENT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'REJECTED', 'REPLACED', 'REVOKED');
CREATE TYPE "accounting_document_scan_status" AS ENUM ('NOT_SCANNED', 'PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- 2. Document types catalog (SUPER_ADMIN editable, code immutable after creation)
CREATE TABLE "accounting_document_types" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "accounting_document_category" NOT NULL,
    "requires_validity" BOOLEAN NOT NULL DEFAULT false,
    "renewal_alert_days" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "accounting_document_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_document_types_code_key" ON "accounting_document_types"("code");
CREATE INDEX "idx_doc_types_category" ON "accounting_document_types"("category");
CREATE INDEX "idx_doc_types_active_sort" ON "accounting_document_types"("is_active", "sort_order");

-- 3. Company documents (logical document per company, no current_file_id — derived from max version)
CREATE TABLE "accounting_company_documents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "legal_entity_id" TEXT NOT NULL,
    "document_type_id" TEXT NOT NULL,
    "status" "accounting_document_status" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMPTZ,
    "valid_from" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "reference_number" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_by_type" VARCHAR(20),
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "accounting_company_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_company_documents_entity_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
    CONSTRAINT "accounting_company_documents_type_fk" FOREIGN KEY ("document_type_id") REFERENCES "accounting_document_types"("id") ON DELETE RESTRICT
);

CREATE INDEX "idx_company_docs_entity" ON "accounting_company_documents"("legal_entity_id");
CREATE INDEX "idx_company_docs_type" ON "accounting_company_documents"("document_type_id");
CREATE INDEX "idx_company_docs_entity_type" ON "accounting_company_documents"("legal_entity_id", "document_type_id");
CREATE INDEX "idx_company_docs_status" ON "accounting_company_documents"("status");
CREATE INDEX "idx_company_docs_expires" ON "accounting_company_documents"("expires_at") WHERE "expires_at" IS NOT NULL;
CREATE INDEX "idx_company_docs_entity_status" ON "accounting_company_documents"("legal_entity_id", "status");

-- 4. Document files (physical S3 versions, uploaded_by with separate FK fields)
-- scan_status: NOT_SCANNED (MVP default, no scanner yet), PENDING, CLEAN, INFECTED, FAILED
-- storage_key: UNIQUE (prevents duplicate S3 keys)
-- sha256: allows deduplication detection (not enforcement)
CREATE TABLE "accounting_company_document_files" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "original_filename" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "uploaded_by_admin_id" TEXT,
    "uploaded_by_accountant_id" TEXT,
    "scan_status" "accounting_document_scan_status" NOT NULL DEFAULT 'NOT_SCANNED',
    "replacement_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "accounting_company_document_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounting_company_document_files_doc_fk" FOREIGN KEY ("document_id") REFERENCES "accounting_company_documents"("id") ON DELETE RESTRICT,
    CONSTRAINT "accounting_company_document_files_admin_fk" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL,
    CONSTRAINT "accounting_company_document_files_accountant_fk" FOREIGN KEY ("uploaded_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL,
    CONSTRAINT "accounting_company_document_files_has_uploader" CHECK (
      ("uploaded_by_admin_id" IS NOT NULL AND "uploaded_by_accountant_id" IS NULL)
      OR
      ("uploaded_by_admin_id" IS NULL AND "uploaded_by_accountant_id" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "accounting_company_document_files_doc_version_key" ON "accounting_company_document_files"("document_id", "version_number");
CREATE UNIQUE INDEX "accounting_company_document_files_storage_key_key" ON "accounting_company_document_files"("storage_key");
CREATE INDEX "idx_doc_files_document" ON "accounting_company_document_files"("document_id");
CREATE INDEX "idx_doc_files_sha256" ON "accounting_company_document_files"("sha256");
