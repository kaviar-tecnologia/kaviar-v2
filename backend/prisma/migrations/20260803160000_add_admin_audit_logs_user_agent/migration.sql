-- Recover schema drift in legacy admin_audit_logs tables.
-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
-- Nullable and idempotent: safe for databases where the column already exists.

ALTER TABLE admin_audit_logs
ADD COLUMN IF NOT EXISTS user_agent TEXT;
