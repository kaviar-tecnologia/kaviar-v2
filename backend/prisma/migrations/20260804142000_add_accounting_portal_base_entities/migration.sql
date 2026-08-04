-- CreateEnum
CREATE TYPE "legal_entity_type" AS ENUM ('MATRIZ', 'FILIAL');

-- CreateEnum
CREATE TYPE "accounting_firm_document_type" AS ENUM ('CNPJ', 'CPF');

-- CreateEnum
CREATE TYPE "accountant_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'REVOKED');

-- CreateEnum
CREATE TYPE "accountant_invite_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "accountant_link_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "accountant_link_scope" AS ENUM ('FISCAL', 'CONTABIL', 'FOLHA', 'SOCIETARIO', 'FINANCEIRO', 'MUNICIPAL', 'COMPLETO');

-- CreateTable
CREATE TABLE "legal_entities" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "entity_type" "legal_entity_type" NOT NULL,
    "parent_entity_id" TEXT,
    "uf" VARCHAR(2),
    "municipio" TEXT,
    "endereco" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_firms" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "document_type" "accounting_firm_document_type" NOT NULL,
    "document_number" TEXT NOT NULL,
    "crc" TEXT,
    "crc_uf" VARCHAR(2),
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountants" (
    "id" TEXT NOT NULL,
    "accounting_firm_id" TEXT NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "crc" TEXT,
    "crc_uf" VARCHAR(2),
    "status" "accountant_status" NOT NULL DEFAULT 'INVITED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "invited_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "last_access_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_invites" (
    "id" TEXT NOT NULL,
    "accountant_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "accountant_invite_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountant_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_entity_links" (
    "id" TEXT NOT NULL,
    "accountant_id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "scope" "accountant_link_scope" NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT true,
    "can_upload" BOOLEAN NOT NULL DEFAULT false,
    "can_download" BOOLEAN NOT NULL DEFAULT true,
    "can_request_correction" BOOLEAN NOT NULL DEFAULT false,
    "can_mark_processed" BOOLEAN NOT NULL DEFAULT false,
    "can_close_period" BOOLEAN NOT NULL DEFAULT false,
    "inherits_children" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "status" "accountant_link_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountant_entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_cnpj_key" ON "legal_entities"("cnpj");

-- CreateIndex
CREATE INDEX "legal_entities_parent_entity_id_idx" ON "legal_entities"("parent_entity_id");

-- CreateIndex
CREATE INDEX "legal_entities_entity_type_idx" ON "legal_entities"("entity_type");

-- CreateIndex
CREATE INDEX "legal_entities_is_active_idx" ON "legal_entities"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_firms_document_number_key" ON "accounting_firms"("document_number");

-- CreateIndex
CREATE INDEX "accounting_firms_is_active_idx" ON "accounting_firms"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "accountants_email_key" ON "accountants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accountants_cpf_key" ON "accountants"("cpf");

-- CreateIndex
CREATE INDEX "accountants_accounting_firm_id_idx" ON "accountants"("accounting_firm_id");

-- CreateIndex
CREATE INDEX "accountants_status_idx" ON "accountants"("status");

-- CreateIndex
CREATE INDEX "accountants_is_active_idx" ON "accountants"("is_active");

-- CreateIndex
CREATE INDEX "accountant_invites_accountant_id_idx" ON "accountant_invites"("accountant_id");

-- CreateIndex
CREATE INDEX "accountant_invites_status_idx" ON "accountant_invites"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_active_link" ON "accountant_entity_links"("accountant_id", "legal_entity_id", "scope", "status");

-- CreateIndex
CREATE INDEX "accountant_entity_links_accountant_id_idx" ON "accountant_entity_links"("accountant_id");

-- CreateIndex
CREATE INDEX "accountant_entity_links_legal_entity_id_idx" ON "accountant_entity_links"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accountant_entity_links_status_idx" ON "accountant_entity_links"("status");

-- CreateIndex
CREATE INDEX "accountant_entity_links_starts_at_ends_at_idx" ON "accountant_entity_links"("starts_at", "ends_at");

-- AddForeignKey
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_parent_entity_id_fkey" FOREIGN KEY ("parent_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountants" ADD CONSTRAINT "accountants_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_invites" ADD CONSTRAINT "accountant_invites_accountant_id_fkey" FOREIGN KEY ("accountant_id") REFERENCES "accountants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_invites" ADD CONSTRAINT "accountant_invites_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_entity_links" ADD CONSTRAINT "accountant_entity_links_accountant_id_fkey" FOREIGN KEY ("accountant_id") REFERENCES "accountants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_entity_links" ADD CONSTRAINT "accountant_entity_links_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_entity_links" ADD CONSTRAINT "accountant_entity_links_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
