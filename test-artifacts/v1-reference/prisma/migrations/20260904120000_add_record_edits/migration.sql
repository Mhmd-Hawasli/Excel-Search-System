-- Manual record edits layer: original Excel values stay recoverable in record_edits history
ALTER TYPE "activity_action" ADD VALUE IF NOT EXISTS 'record_edited';

CREATE TABLE IF NOT EXISTS "record_edits" (
  "id" UUID NOT NULL,
  "record_id" UUID NOT NULL,
  "file_id" UUID NOT NULL,
  "file_column_id" UUID,
  "header_raw" TEXT NOT NULL,
  "old_value" TEXT NOT NULL DEFAULT '',
  "new_value" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "record_edits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "record_edits_record_id_idx" ON "record_edits"("record_id");
CREATE INDEX IF NOT EXISTS "record_edits_file_id_idx" ON "record_edits"("file_id");
CREATE INDEX IF NOT EXISTS "record_edits_file_id_created_at_idx" ON "record_edits"("file_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "record_edits" ADD CONSTRAINT "record_edits_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "record_edits" ADD CONSTRAINT "record_edits_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "record_edits" ADD CONSTRAINT "record_edits_file_column_id_fkey" FOREIGN KEY ("file_column_id") REFERENCES "file_columns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
