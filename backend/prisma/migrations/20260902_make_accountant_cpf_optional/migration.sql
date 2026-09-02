-- Team members in an external accounting firm do not need CPF to access the portal.
-- PostgreSQL UNIQUE constraints allow multiple NULL values, preserving uniqueness
-- whenever CPF is actually provided.
ALTER TABLE "accountants" ALTER COLUMN "cpf" DROP NOT NULL;
