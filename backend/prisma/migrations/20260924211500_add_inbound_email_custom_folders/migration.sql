-- Custom folders for the institutional inbox.
CREATE TABLE "inbound_email_folders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(80) NOT NULL,
  "created_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inbound_email_folders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inbound_email_folders_name_key" UNIQUE ("name")
);

CREATE UNIQUE INDEX "inbound_email_folders_name_lower_key"
  ON "inbound_email_folders" (LOWER("name"));

CREATE INDEX "inbound_email_folders_name_idx"
  ON "inbound_email_folders" ("name");

ALTER TABLE "inbound_email_messages"
  ADD COLUMN "custom_folder_id" UUID;

CREATE INDEX "inbound_email_messages_custom_folder_id_received_at_idx"
  ON "inbound_email_messages" ("custom_folder_id", "received_at");

ALTER TABLE "inbound_email_messages"
  ADD CONSTRAINT "inbound_email_messages_custom_folder_id_fkey"
  FOREIGN KEY ("custom_folder_id")
  REFERENCES "inbound_email_folders"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
