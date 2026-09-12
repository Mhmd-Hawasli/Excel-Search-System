# Conflict query cache

Conflict reports, statistics and exports use a persistent PostgreSQL JSONB cache.
The first request for a query computes and saves the result; subsequent identical
requests read it without running the conflict scan again.

## Freshness and permissions

- Statement-level database triggers on `records`, `files`, `file_columns`,
  `upload_jobs` and `ignored_conflicts` increment one source revision on every
  insert, update, delete or truncate. This covers edits, imports, replacements,
  remapping columns, renames, ignored conflicts and direct SQL writes. Invalidation
  commits or rolls back with the source change. Triggers do not run expensive scans.
- A revision mismatch invalidates all older results immediately. The next request
  rebuilds before serving the report; there is no stale-result fallback and no
  background refresh delay. A query already running during a concurrent edit has
  normal PostgreSQL statement-snapshot semantics. Its result is not cached as the
  newer revision.
- Results also expire when the database date changes, because future-date rules
  depend on `CURRENT_DATE`.
- The cache key hashes the SQL and all bound values, including filters, pagination,
  sorting, rule definitions and permitted file IDs. Authorization is resolved on
  every request before looking up the cache. Parent groups do not grant access to
  unselected sibling files. Permission changes therefore use a different scope key.
- Per-query transaction advisory locks coalesce concurrent misses across server
  processes. A maximum of 128 entries is retained, with a 2 MiB per-entry limit;
  larger results are computed normally without being persisted.

This is conservative invalidation, not incremental per-record conflict detection:
editing one record can change conflicts on other records and in other files.
New filter/page/scope combinations also require an initial calculation.

## Deployment

Run `npm run db:migrate` and `npm run db:generate` before starting the updated app.
Migration `20260906140000_conflict_query_cache` creates both cache tables, the
revision function and the five triggers. `db:push` alone does **not** install these
triggers. Do not disable the triggers during data imports or restores. After a
restore that deliberately bypasses triggers, invalidate any restored cache with:

```sql
UPDATE conflict_cache_state SET revision = revision + 1 WHERE id = 1;
```

If rule behavior changes outside the generated SQL, bump `CACHE_FORMAT` in
`src/lib/conflicts/cache.ts`. Any new source table read by conflict SQL must also
receive an invalidation trigger in a migration.

## Verification

- `npm run test:conflict-cache` tests the actual migration and cache SQL in an
  isolated schema that is rolled back entirely. Covers 20 source mutation cases,
  persistent hits, transaction rollback, date expiry, scope isolation, a revision
  change during calculation and calculation failures.
- `npm run test:conflicts` verifies conflict semantics against isolated fixtures.
  Explicit transaction clients bypass persistent caching so temporary fixture
  data can never populate the application cache.
- `node --import tsx --env-file=.env scripts/benchmark-conflicts.ts --cache`
  compares first and repeated report reads and asserts identical payloads. It
  writes only derived cache data, not source records. A first read can already be
  a cache hit if that exact query was previously requested.
