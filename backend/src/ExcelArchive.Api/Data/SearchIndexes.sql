-- Idempotent search indexes migrated from prisma/search-indexes.sql.
-- Run after `dotnet ef database update` when trigram search is enabled.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS records_n_full_name_trgm_idx ON records USING GIN (n_full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_n_first_name_trgm_idx ON records USING GIN (n_first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_n_last_name_trgm_idx ON records USING GIN (n_last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_n_mother_name_trgm_idx ON records USING GIN (n_mother_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_n_contract_code_trgm_idx ON records USING GIN (n_contract_code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_d_national_id_trgm_idx ON records USING GIN (d_national_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_d_phone_trgm_idx ON records USING GIN (d_phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_d_personal_no_trgm_idx ON records USING GIN (d_personal_no gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_sf_job_title_trgm_idx ON records USING GIN (sf_job_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_sf_full_name_trgm_idx ON records USING GIN (sf_full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS records_sf_phone_trgm_idx ON records USING GIN (sf_phone gin_trgm_ops);
