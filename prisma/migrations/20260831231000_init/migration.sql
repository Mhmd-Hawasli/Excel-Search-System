CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "standard_field" AS ENUM ('first_name', 'father_name', 'last_name', 'full_name', 'national_id', 'sham_cash', 'personal_no', 'mother_name', 'phone', 'contract_code');
CREATE TYPE "upload_job_status" AS ENUM ('pending', 'parsing', 'inserting', 'done', 'failed');
CREATE TYPE "data_quality_issue_type" AS ENUM ('missing_national_id', 'invalid_national_id', 'duplicate_national_id', 'invalid_phone', 'empty_row');
CREATE TYPE "activity_action" AS ENUM ('file_uploaded', 'file_updated', 'file_replaced', 'file_deleted', 'group_created', 'group_updated', 'group_reordered', 'group_deleted', 'category_created', 'category_updated', 'category_reordered', 'category_deleted', 'template_created', 'backup_restored');

CREATE TABLE "groups" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL DEFAULT '',
  "sort_order" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "files" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "group_id" UUID NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL DEFAULT '', "original_filename" TEXT NOT NULL, "sheet_name" TEXT NOT NULL,
  "row_count" INTEGER NOT NULL DEFAULT 0, "column_signature" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name" TEXT NOT NULL UNIQUE, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "file_columns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
  "header_raw" TEXT NOT NULL, "header_normalized" TEXT NOT NULL, "column_index" INTEGER NOT NULL,
  "category_id" UUID REFERENCES "categories"("id") ON DELETE SET NULL, "standard_field" "standard_field",
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("file_id", "column_index")
);
CREATE TABLE "records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
  "row_index" INTEGER NOT NULL, "data" JSONB NOT NULL,
  "sf_first_name" TEXT, "sf_father_name" TEXT, "sf_last_name" TEXT, "sf_full_name" TEXT, "sf_national_id" TEXT,
  "sf_sham_cash" TEXT, "sf_personal_no" TEXT, "sf_mother_name" TEXT, "sf_phone" TEXT, "sf_contract_code" TEXT,
  "n_first_name" TEXT, "n_father_name" TEXT, "n_last_name" TEXT, "n_full_name" TEXT, "n_mother_name" TEXT, "n_contract_code" TEXT,
  "d_national_id" TEXT, "d_sham_cash" TEXT, "d_personal_no" TEXT, "d_phone" TEXT, "national_id_num" BIGINT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("file_id", "row_index")
);
CREATE TABLE "upload_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "file_id" UUID REFERENCES "files"("id") ON DELETE SET NULL,
  "status" "upload_job_status" NOT NULL DEFAULT 'pending', "total_rows" INTEGER NOT NULL DEFAULT 0, "processed_rows" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT, "payload" JSONB NOT NULL, "started_at" TIMESTAMPTZ(3), "finished_at" TIMESTAMPTZ(3)
);
CREATE TABLE "data_quality_issues" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "file_id" UUID NOT NULL REFERENCES "files"("id") ON DELETE CASCADE,
  "row_index" INTEGER NOT NULL, "issue_type" "data_quality_issue_type" NOT NULL, "column_name" TEXT, "raw_value" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "activity_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "action" "activity_action" NOT NULL, "target_name" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}', "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "mapping_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "group_id" UUID NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL, "header_signature" TEXT NOT NULL, "mapping" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("group_id", "name")
);

CREATE INDEX "files_group_id_idx" ON "files"("group_id");
CREATE INDEX "file_columns_file_id_idx" ON "file_columns"("file_id");
CREATE INDEX "file_columns_category_id_idx" ON "file_columns"("category_id");
CREATE INDEX "records_file_id_idx" ON "records"("file_id");
CREATE INDEX "records_national_id_num_idx" ON "records"("national_id_num");
CREATE INDEX "upload_jobs_file_id_idx" ON "upload_jobs"("file_id");
CREATE INDEX "upload_jobs_status_idx" ON "upload_jobs"("status");
CREATE INDEX "data_quality_issues_file_id_idx" ON "data_quality_issues"("file_id");
CREATE INDEX "data_quality_issues_file_id_issue_type_idx" ON "data_quality_issues"("file_id", "issue_type");
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at");
CREATE INDEX "mapping_templates_group_id_header_signature_idx" ON "mapping_templates"("group_id", "header_signature");

CREATE INDEX "records_n_first_name_trgm_idx" ON "records" USING GIN ("n_first_name" gin_trgm_ops);
CREATE INDEX "records_n_father_name_trgm_idx" ON "records" USING GIN ("n_father_name" gin_trgm_ops);
CREATE INDEX "records_n_last_name_trgm_idx" ON "records" USING GIN ("n_last_name" gin_trgm_ops);
CREATE INDEX "records_n_full_name_trgm_idx" ON "records" USING GIN ("n_full_name" gin_trgm_ops);
CREATE INDEX "records_n_mother_name_trgm_idx" ON "records" USING GIN ("n_mother_name" gin_trgm_ops);
CREATE INDEX "records_n_contract_code_trgm_idx" ON "records" USING GIN ("n_contract_code" gin_trgm_ops);
CREATE INDEX "records_d_national_id_trgm_idx" ON "records" USING GIN ("d_national_id" gin_trgm_ops);
CREATE INDEX "records_d_sham_cash_trgm_idx" ON "records" USING GIN ("d_sham_cash" gin_trgm_ops);
CREATE INDEX "records_d_personal_no_trgm_idx" ON "records" USING GIN ("d_personal_no" gin_trgm_ops);
CREATE INDEX "records_d_phone_trgm_idx" ON "records" USING GIN ("d_phone" gin_trgm_ops);
