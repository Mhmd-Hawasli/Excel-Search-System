ALTER TYPE "standard_field" ADD VALUE IF NOT EXISTS 'secondary_contract_code';

ALTER TABLE "records"
  ADD COLUMN "sf_secondary_contract_code" TEXT,
  ADD COLUMN "n_secondary_contract_code" TEXT;

CREATE INDEX "records_n_secondary_contract_code_trgm_idx"
  ON "records" USING GIN ("n_secondary_contract_code" gin_trgm_ops);
