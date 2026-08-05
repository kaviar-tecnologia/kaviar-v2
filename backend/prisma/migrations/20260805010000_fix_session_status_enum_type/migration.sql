-- Fix type mismatch: columns were created as TEXT but Prisma schema uses enums
-- PostgreSQL cannot compare TEXT = ENUM directly
-- Must drop default before altering type, then restore with enum-typed default

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accountant_sessions' AND column_name = 'status' AND data_type = 'text'
  ) THEN
    ALTER TABLE "accountant_sessions" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "accountant_sessions" 
      ALTER COLUMN "status" TYPE "accountant_session_status" USING "status"::"accountant_session_status";
    ALTER TABLE "accountant_sessions" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"accountant_session_status";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accountant_password_resets' AND column_name = 'status' AND data_type = 'text'
  ) THEN
    ALTER TABLE "accountant_password_resets" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "accountant_password_resets" 
      ALTER COLUMN "status" TYPE "accountant_reset_status" USING "status"::"accountant_reset_status";
    ALTER TABLE "accountant_password_resets" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"accountant_reset_status";
  END IF;
END $$;
