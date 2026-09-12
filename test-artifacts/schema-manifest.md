# Schema manifest — V1 Prisma → V2 EF (P1.2, 2026-09-08)

Source: `V1/prisma/schema.prisma`. Target: `V2/backend/src/ExcelArchive.{Domain,Infrastructure}` + `Api/Data/*.sql`.
Physical differences allowed only where noted; logical export/import must stay compatible.

## Enums (persist as Prisma snake_case strings via EnumToPrismaConverter, varchar)
- StandardField (14): first_name … organizational_level — V2 `StandardField` matches; FileColumn.StandardField nullable.
- UploadJobStatus (5, UPPERCASE members → pending…failed): PENDING/PARSING/INSERTING/DONE/FAILED uppercase at JSON transport; DB labels lowercase.
- DataQualityIssueType (7): missing_national_id … empty_row.
- ActivityAction (22): file_uploaded … user_permissions_updated.

## Tables
- groups: id uuid PK, name unique, description default "", sort_order, created_at/updated_at timestamptz(3). → Group + Files + Templates + ScopedPermissions (Cascade).
- files: id, group_id FK Cascade, name unique, description, original_filename, sheet_name, row_count, column_signature, version default 1, uploaded_at/updated_at. → File + Columns/Records/UploadJobs(DataQualityIssues/RecordEdits Cascade; UploadJobs SetNull).
- categories: id, name unique, sort_order, created_at. → Category + Columns.
- file_columns: id, file_id Cascade, header_raw/normalized, column_index, sort_order default 0, category_id nullable SetNull, standard_field nullable; unique (file_id,column_index); indexes file_id, category_id, (category_id,sort_order).
- records: id, file_id Cascade, row_index, data jsonb, sf_* (sf_national_id/sf_sham_cash BigInt nullable; sf_functional_category int nullable; rest text nullable), n_* text nullable (9 cols), d_national_id/d_personal_no/d_phone text nullable, fmt_fills/fmt_font_colors jsonb nullable, national_id_num BigInt nullable, created_at only (no updated_at — matches V1). Unique (file_id,row_index); indexes file_id, national_id_num, sf_functional_category.
- upload_jobs: id, file_id nullable SetNull, status varchar default pending, total/processed_rows, error_message nullable, payload jsonb, started_at/finished_at nullable timestamptz(3). Indexes file_id, status.
- data_quality_issues: id, file_id Cascade, row_index, issue_type varchar, column_name/raw_value nullable, created_at. Indexes file_id, (file_id,issue_type).
- activity_log (singular table!): id, action varchar, target_name, details jsonb default {}, created_at. Index created_at.
- record_edits: id, record_id Cascade, file_id Cascade, file_column_id nullable SetNull, header_raw, old/new_value default "", created_at. Indexes record_id, file_id, (file_id,created_at).
- mapping_templates: id, group_id Cascade, name, header_signature, mapping jsonb, created_at/updated_at. Unique (group_id,name); index (group_id,header_signature).
- ignored_conflicts: id, rule text, record_id Cascade, created_at. Unique (rule,record_id); indexes record_id, rule.
- conflict_cache_state (NEW in V2, was missing): int id PK (ValueGeneratedNever, CHECK id=1 in SQL), revision BigInt. Singleton row (1,0).
- conflict_query_cache (NEW, was missing): key text PK, source_revision BigInt, checked_date date, payload jsonb, rebuilt_at timestamptz(3). Index rebuilt_at.
- users: id, username unique, password_hash, display_name nullable, is_active default true, created_at/updated_at.
- user_permissions: id, user_id Cascade, permission text, group_id/file_id nullable Cascade, created_at. Indexes user_id/group_id/file_id. Scope rule: not both group+file; no scope on global rights (validated in Phase 6 user packets; foundation normalizes on read).

## Timestamps
- All DateTime → timestamptz(3) via AppDbContext loop (V1 @db.Timestamptz(3)); ConflictQueryCache.CheckedDate stays date.
- V2 entities intentionally mirror V1 per-entity CreatedAt/UpdatedAt presence (e.g., Record has CreatedAt only); do not infer BaseEntity timestamps.

## Precision / BigInt
- UUIDs preserved; source row order via (file_id,row_index). BigInt sf_national_id/sf_sham_cash/national_id_num serialize as JSON strings (JS safe-integer); no float intermediates; raw JSON retains original text + leading zeros.
- National layers: raw → nationalIdDigits (Arabic/Persian→Latin, strip all \s, reject non-0-9, trim leading zeros) → sf (BigInt if ≤ Int64 max) → d (pad 11, no truncate) → nationalIdNum only when issue null (9–11 digits). Display falls back to original invalid text.

## Indexes / extensions (Data/SearchIndexes.sql = V1 parity, 14 indexes)
- pg_trgm + fuzzystrmatch. 9× n_* GIN trgm, d_national_id/d_personal_no/d_phone GIN trgm, sf_sham_cash LPAD-16 expression GIN trgm, sf_functional_category b-tree. Removed 3 extra raw-field V2 indexes.
- Cache DDL (Data/ConflictCache.sql): CREATE TABLE IF NOT EXISTS both cache tables (upgrade path for pre-existing EnsureCreated DBs) + singleton row + invalidate_conflict_query_cache() + 5 statement triggers (records/files/file_columns/upload_jobs/ignored_conflicts).

## Migration path
- Fresh disposable DB: EnsureCreated + both SQL files → full schema; validate via `dotnet ef migrations add Baseline` dry-run (DesignTimeDbContextFactory present) then switch seeder to Migrate() in a follow-up once a disposable Postgres is reachable (no docker/psql on this host — not run in P1.2).
- Existing V2 DB: back up, run ConflictCache.sql (idempotent tables/triggers) + SearchIndexes.sql, review EF model diff for timestamp/enum physical alignment; do not run EnsureCreated+Migrate interchangeably.
- Required-index/cache failure must surface in /health/ready, not just seeder warning — P1.6 follow-up.
