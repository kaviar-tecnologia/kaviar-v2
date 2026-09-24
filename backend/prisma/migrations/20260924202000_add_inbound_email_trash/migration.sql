-- Add soft-trash lifecycle for institutional inbound email.
ALTER TABLE "inbound_email_messages"
  ADD COLUMN "status_before_trash" VARCHAR(20),
  ADD COLUMN "trashed_at" TIMESTAMP(3),
  ADD COLUMN "trashed_by_admin_id" UUID;

ALTER TABLE "inbound_email_messages"
  DROP CONSTRAINT IF EXISTS "inbound_email_messages_status_check";

ALTER TABLE "inbound_email_messages"
  ADD CONSTRAINT "inbound_email_messages_status_check"
  CHECK ("status" IN ('NEW', 'READ', 'ARCHIVED', 'TRASHED', 'DELETING'));

ALTER TABLE "inbound_email_messages"
  ADD CONSTRAINT "inbound_email_messages_status_before_trash_check"
  CHECK ("status_before_trash" IS NULL OR "status_before_trash" IN ('NEW', 'READ', 'ARCHIVED'));

CREATE INDEX "inbound_email_messages_trashed_at_idx"
  ON "inbound_email_messages" ("trashed_at");
