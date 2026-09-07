-- A transactionally updated revision invalidates every derived conflict query.
-- Statement triggers cover raw SQL, imports, restores, cascades and bulk writes.
CREATE TABLE "conflict_cache_state" (
  "id" INTEGER PRIMARY KEY CHECK (id = 1),
  "revision" BIGINT NOT NULL DEFAULT 0
);
INSERT INTO "conflict_cache_state" (id, revision) VALUES (1, 0);

CREATE TABLE "conflict_query_cache" (
  "key" TEXT PRIMARY KEY,
  "source_revision" BIGINT NOT NULL,
  "checked_date" DATE NOT NULL,
  "payload" JSONB NOT NULL,
  "rebuilt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "conflict_query_cache_rebuilt_at_idx" ON "conflict_query_cache" (rebuilt_at);

CREATE FUNCTION public.invalidate_conflict_query_cache() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.conflict_cache_state SET revision = revision + 1 WHERE id = 1;
  RETURN NULL;
END;
$$;

CREATE TRIGGER records_conflict_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "records"
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();

CREATE TRIGGER files_conflict_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "files"
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();

CREATE TRIGGER file_columns_conflict_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "file_columns"
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();

CREATE TRIGGER upload_jobs_conflict_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "upload_jobs"
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();

CREATE TRIGGER ignored_conflicts_cache_changed
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "ignored_conflicts"
FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_conflict_query_cache();
