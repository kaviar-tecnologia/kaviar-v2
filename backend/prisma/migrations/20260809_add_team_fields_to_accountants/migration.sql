-- Migration: Add team member fields to accountants
-- Date: 2026-08-09
-- Purpose: Allow accounting firms to have non-accountant team members
-- Backward-compatible: all fields nullable or with defaults

ALTER TABLE accountants ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE accountants ADD COLUMN IF NOT EXISTS is_responsible_accountant BOOLEAN NOT NULL DEFAULT false;
