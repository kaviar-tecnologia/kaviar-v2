-- Add email status tracking fields to accountant_invites
ALTER TABLE accountant_invites ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;
ALTER TABLE accountant_invites ADD COLUMN IF NOT EXISTS last_email_status TEXT;
ALTER TABLE accountant_invites ADD COLUMN IF NOT EXISTS last_email_error TEXT;
ALTER TABLE accountant_invites ADD COLUMN IF NOT EXISTS last_email_log_id TEXT;
