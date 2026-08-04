-- Add accounting classification fields to financial_categories
-- Frente 3/9: Área do Contador V2 — Plano de Contas e Classificação Contábil
-- All fields are nullable to preserve backward compatibility.
-- Existing rows remain untouched (NULL = not yet classified by accountant).

-- 1. Create enum for accounting nature (debit/credit)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accounting_nature_type') THEN
    CREATE TYPE accounting_nature_type AS ENUM ('DEBIT', 'CREDIT');
  END IF;
END $$;

-- 2. Add columns (idempotent via IF NOT EXISTS pattern)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_categories' AND column_name = 'accounting_code') THEN
    ALTER TABLE financial_categories ADD COLUMN accounting_code TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_categories' AND column_name = 'accounting_nature') THEN
    ALTER TABLE financial_categories ADD COLUMN accounting_nature accounting_nature_type;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_categories' AND column_name = 'dre_group') THEN
    ALTER TABLE financial_categories ADD COLUMN dre_group TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_categories' AND column_name = 'balance_sheet_group') THEN
    ALTER TABLE financial_categories ADD COLUMN balance_sheet_group TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_categories' AND column_name = 'fiscal_classification') THEN
    ALTER TABLE financial_categories ADD COLUMN fiscal_classification TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_categories' AND column_name = 'deductible') THEN
    ALTER TABLE financial_categories ADD COLUMN deductible BOOLEAN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_categories' AND column_name = 'export_code') THEN
    ALTER TABLE financial_categories ADD COLUMN export_code TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_categories' AND column_name = 'accountant_notes') THEN
    ALTER TABLE financial_categories ADD COLUMN accountant_notes TEXT;
  END IF;
END $$;

-- 3. Index on accounting_code for lookup by chart-of-accounts code
CREATE INDEX IF NOT EXISTS idx_financial_categories_accounting_code
  ON financial_categories (accounting_code)
  WHERE accounting_code IS NOT NULL;

-- 4. Validation: confirm columns exist
DO $$ BEGIN
  PERFORM 1 FROM information_schema.columns
    WHERE table_name = 'financial_categories' AND column_name = 'accounting_code';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Migration failed: accounting_code column not created';
  END IF;

  PERFORM 1 FROM information_schema.columns
    WHERE table_name = 'financial_categories' AND column_name = 'accountant_notes';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Migration failed: accountant_notes column not created';
  END IF;
END $$;
