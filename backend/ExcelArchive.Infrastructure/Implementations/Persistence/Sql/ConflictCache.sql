-- Conflict cache revision infrastructure. Parity with V1
-- prisma/migrations/20260906140000_conflict_query_cache/migration.sql.
-- Tables themselves are created by EF EnsureCreated/Migrate; the CREATE TABLE
-- IF NOT EXISTS below is the upgrade path for pre-existing V2 databases where
-- EnsureCreated no-ops and therefore never adds the two cache tables.

CREATE TABLE IF NOT EXISTS conflict_cache_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS conflict_query_cache (
  key TEXT PRIMARY KEY,
  source_revision BIGINT NOT NULL,
  checked_date DATE NOT NULL,
  payload JSONB NOT NULL,
  rebuilt_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS conflict_query_cache_rebuilt_at_idx ON conflict_query_cache (rebuilt_at);

INSERT INTO conflict_cache_state (id, revision)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.invalidate_conflict_query_cache() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.conflict_cache_state SET revision = revision + 1 WHERE id = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS records_conflict_cache_changed ON records;
CREATE TRIGGER records_conflict_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON records
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();

DROP TRIGGER IF EXISTS files_conflict_cache_changed ON files;
CREATE TRIGGER files_conflict_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON files
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();

DROP TRIGGER IF EXISTS file_columns_conflict_cache_changed ON file_columns;
CREATE TRIGGER file_columns_conflict_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON file_columns
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();

DROP TRIGGER IF EXISTS upload_jobs_conflict_cache_changed ON upload_jobs;
CREATE TRIGGER upload_jobs_conflict_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON upload_jobs
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();

DROP TRIGGER IF EXISTS ignored_conflicts_cache_changed ON ignored_conflicts;
CREATE TRIGGER ignored_conflicts_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ignored_conflicts
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();
