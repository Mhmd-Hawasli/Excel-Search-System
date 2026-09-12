DROP INDEX IF EXISTS "records_d_sham_cash_trgm_idx";

ALTER TABLE "records" DROP COLUMN "d_sham_cash";

CREATE INDEX "records_sf_sham_cash_trgm_idx"
ON "records" USING GIN ((LPAD("sf_sham_cash"::TEXT, 16, '0')) gin_trgm_ops);
