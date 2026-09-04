-- Standard employment fields: job title, functional category (numeric 1..5,
-- 0 = error/unknown, NULL = empty) and basic organizational level.

ALTER TYPE "standard_field" ADD VALUE IF NOT EXISTS 'job_title';
ALTER TYPE "standard_field" ADD VALUE IF NOT EXISTS 'functional_category';
ALTER TYPE "standard_field" ADD VALUE IF NOT EXISTS 'organizational_level';

ALTER TYPE "data_quality_issue_type" ADD VALUE IF NOT EXISTS 'invalid_functional_category';

ALTER TABLE "records"
  ADD COLUMN "sf_job_title" TEXT,
  ADD COLUMN "sf_functional_category" INTEGER,
  ADD COLUMN "sf_organizational_level" TEXT,
  ADD COLUMN "n_job_title" TEXT,
  ADD COLUMN "n_organizational_level" TEXT;

CREATE INDEX IF NOT EXISTS "records_n_job_title_trgm_idx"
  ON "records" USING GIN ("n_job_title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_n_organizational_level_trgm_idx"
  ON "records" USING GIN ("n_organizational_level" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_sf_functional_category_idx"
  ON "records" ("sf_functional_category");
