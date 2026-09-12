# Phase 1 completion evidence (2026-09-08, second session)

## Committed foundation tests — 86/86 PASS
- Project: `V2/backend/tests/ExcelArchive.Foundation.Tests` (xUnit, in solution).
- Command: `dotnet test ExcelArchive.Api.sln` → Passed 86, Failed 0 (23s).
- Coverage: normalization (14 V1 golden pairs + helpers + national layers),
  scrypt (Node vector, unicode/space, wrong, malformed, PBKDF2 dispatch),
  session (Node key-derivation vector, round-trip, dual claims, 12h, wrong-secret,
  tampered, expired, prod-secret rule, dev fallback), permissions (24-key catalog,
  unify, V1 scope matrix), scope (InMemory group/file/combo/empty matrix),
  EF model (15 tables, singular activity_log, cache keys, uniques, FK deletes,
  timestamptz(3), varchar enums, snake columns), SQL files (14 indexes, no raw
  extras, padded-sham expression, 5 cache triggers), auth flow (login cookie flags,
  trim/whitespace, blank/wrong/inactive 401, me + Arabic 401, no hash leak,
  inactive/renamed/tampered rejection, logout clear, 401-vs-404 branches).

## Real bug found by the new tests (fixed)
- `activity_log` was mapped as `activity_logs` (DbSet pluralization). V1 table is
  singular (docs/07.1). Fixed in `AppDbContext` with explicit `ToTable("activity_log")`;
  Baseline migration confirms singular. All other 14 tables already matched.

## EF Baseline migration (scaffolded, reviewed, APPLIED on fixture)
- Tooling: `backend/.config/dotnet-tools.json` (dotnet-ef 10.0.12, local manifest).
- `src/ExcelArchive.Infrastructure/Migrations/20260908203405_Baseline.cs` (+ Designer
  + ModelSnapshot) plus `20260908213419_RemoveDuplicateFunctionalCategoryIndex.cs`
  (drops the EF functional-category btree that duplicated the V1-named index in
  SearchIndexes.sql). Runtime still uses EnsureCreated: switching live environments to
  Migrate() without a baselined `__EFMigrationsHistory` would crash on existing
  EnsureCreated DBs, so the switch stays a Phase 7/8 ops item. Seeder upgrade path unchanged.
- Incident (remediated): the first `database update` hit the real `excel_archive_2`
  because `DesignTimeDbContextFactory` hardcoded its connection string (with a password
  in source). EF created one stray empty `__EFMigrationsHistory` table there; migration
  DDL itself rolled back. Fixed the factory to read `ConnectionStrings__Default` /
  `DATABASE_URL` (secret removed from source) and dropped the stray table — the real DB
  was verified back at its original 15 tables. Lesson recorded: verify the factory
  target before every tooling run.

## Builds
- Backend: `dotnet test` solution build 0 warnings 0 errors.
- Frontend: `tsc --noEmit` pass; eslint on Phase-1 files pass;
  `npm run build` succeeds (18 routes incl. /login + shell).

## Isolated V1 reference (materialized)
- `V2/test-artifacts/v1-reference/`: source-only copy of V1 (src, prisma, scripts,
  configs; ~5MB). Excluded: node_modules, .next, .next-dev, .npm-cache, tmp, .git,
  .env/.env.local. Original V1 untouched (branch main, status clean).

## D1–D3 DONE locally 2026-09-09 (no Docker; portable PG17 service on :5433)
Environment: existing `postgresql-x64-17` service left untouched; disposable instance
`pgsql-phase1-fixture` (NetworkService, data dir Temp/opencode/pg-fixture-data,
localhost:5433, trust auth) created for D1–D3, now Stopped/Manual — restart with
`net start pgsql-phase1-fixture`. Rehearsal on PG17; production target is PG16, and no
version-specific syntax is used. V1 database never touched (read-only `\l`/`\dt` only).

### D1 — schema evolution proven
- Fresh create: `database update` on empty `excel_archive_2_fixture` → Baseline + Delta
  applied; 16 tables (15 domain + history); singular `activity_log`; extensions
  pg_trgm + fuzzystrmatch; 13 trgm + 1 btree = 14 V1 indexes; 5/5 conflict triggers;
  singleton revision 0. EXPLAIN: btree used for functional_category; GIN correctly
  skipped on the empty table (planner behavior, not a defect).
- Clone upgrade: read-only pg_dump of EnsureCreated `excel_archive_2` (1 group, 1 file,
  2 records, 1 user, 23 grants, 2 jobs) → `excel_archive_2_clone`; renames to canonical
  names; SQL files applied with zero errors; dropped the 3 superseded raw-field indexes
  and the duplicate EF functional index → exactly the 14 V1 indexes; 5/5 triggers;
  data intact. Upgraded clone keeps timestamptz(6) vs model timestamptz(3): runtime-neutral,
  recorded; a future Migrate() would emit ALTERs, which is why the Migrate-switch stays
  deferred. (An early "4/5 triggers" reading was a truncated-output artifact; file-output
  verification shows 5/5 on both DBs.)
- V1 baseline runs: `v1-reference` npm install ✓, prisma generate ✓,
  arabic.test.ts 19/19 ✓, `npm run build` ✓ (all routes + middleware),
  `prisma migrate deploy` 16/16 ✓ into `excel_archive_v1baseline`,
  `next start -p 3100` boot + /login 200 ✓. Original V1 untouched.

### D2 — HTTP round-trip proven (backend :5000 on fixture DB, seeded admin, defaults)
- /health/ready + /health/live 200. login 200 + `excel_archive_session=JWT`
  (HttpOnly, SameSite=Lax, Path=/, MaxAge=43200; payload sub + username + unique_name,
  12h). me 200 (no hash leak); anonymous me 401 with Arabic `{ok:false}` message;
  groups 200; missing group 404; logout 200 clears cookie (1970 expiry);
  post-logout me 401.
- Rewrite via frontend :3000: login 200 with cookie forwarded both ways; me 200.
- Limits (code-verified): 50MB enforced in UploadService + 3 controllers with
  [RequestSizeLimit]; restore has the 250MB Arabic 413 check BUT no endpoint
  RequestSizeLimit/FormOptions, so Kestrel/form defaults cap first → recorded P6.3 item.
  Poll default is 1500ms vs V1 1200ms → recorded P2.3 item. No 250MB live transfer
  attempted (needs a huge fixture; headers/config evidence suffices for Phase 1).

### D3 — shell/login baseline proven (markup level)
- /login serves lang=ar dir=rtl, Cairo refs, تسجيل الدخول button, current-password,
  username field, role=alert only on error (correct), safe-next + pending text in code.
- Unauthenticated / renders ONLY the guard loading text — zero protected markup
  (no flash). Pixel-level 5-width/theme sweep stays Phase 7 per the gap register
  (G-SHELL completes in 7).
