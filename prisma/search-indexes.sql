CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "records_n_first_name_trgm_idx" ON "records" USING GIN ("n_first_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_n_father_name_trgm_idx" ON "records" USING GIN ("n_father_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_n_last_name_trgm_idx" ON "records" USING GIN ("n_last_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_n_full_name_trgm_idx" ON "records" USING GIN ("n_full_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_n_mother_name_trgm_idx" ON "records" USING GIN ("n_mother_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_n_contract_code_trgm_idx" ON "records" USING GIN ("n_contract_code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_n_secondary_contract_code_trgm_idx" ON "records" USING GIN ("n_secondary_contract_code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_d_national_id_trgm_idx" ON "records" USING GIN ("d_national_id" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_sf_sham_cash_trgm_idx" ON "records" USING GIN ((LPAD("sf_sham_cash"::TEXT, 16, '0')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_d_personal_no_trgm_idx" ON "records" USING GIN ("d_personal_no" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "records_d_phone_trgm_idx" ON "records" USING GIN ("d_phone" gin_trgm_ops);
