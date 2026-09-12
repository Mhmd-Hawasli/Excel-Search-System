# Phase 1 baseline — P1.1 inventory (2026-09-08)

## V2 working-tree state (preserved, not reset)
- V2 branch: `arena/01a07c39-excel-search-system` tracking `origin/arena/01a07c39-excel-search-system`.
- V1 branch: `main` clean (`## main...origin/main`, no short-status entries).
- V2 restructuring (commit `11da0d5 Decouple backend/frontend into ASP.NET 10 + Next.js 16 architecture`):
  - Deleted root Next.js app (`src/*`, `prisma/*`, `scripts/*`, docs screenshots) — moved/split into `frontend/` + `backend/`.
  - Modified: `backend/ExcelArchive.Api.sln`, `backend/README.md`, 15 controllers, `ExcelArchive.Api.csproj`, `Middleware/AuthMiddleware.cs`, `Middleware/ExceptionHandlingMiddleware.cs`, `Program.cs`, `appsettings.json`, `docker-compose.yml`, `frontend/next-env.d.ts`, `frontend/src/app/(protected)/layout.tsx`.
  - Untracked (new Clean Architecture): `backend/Dockerfile`, `backend/src/ExcelArchive.Api/Auth/`, `GlobalUsings.cs`, `bin/`, `obj/`, `ExcelArchive.Application/`, `ExcelArchive.Domain/`, `ExcelArchive.Infrastructure/`, `frontend/.env.local`, `frontend/.next/`, `frontend/AGENTS.md`, `frontend/CLAUDE.md`, `frontend/Dockerfile`, `frontend/node_modules/`, `frontend/src/app/(protected)/groups/[id]/files/`, `logs/`, `merge-sheets/`, `merge/`, `components/pager.tsx`, hooks, `services/misc.service.ts`, `services/upload.service.ts`, `tsconfig.tsbuildinfo`.
- Rule: preserve all above. No `git reset/clean/restore`, no V1 writes. Full short-status captured in session log; this file is the durable manifest.

## Target DB / ports / tool versions (no secrets)
- Target DB: `excel_archive_2` (compose service `excel-archive-2-postgres`, `postgres:16-alpine`, host port `5432`, volume `excel_archive_2_data`).
- Fixture DB (live since 2026-09-09): `excel_archive_2_fixture` (+ `excel_archive_2_clone`,
  `excel_archive_v1baseline`) on disposable local instance `pgsql-phase1-fixture`
  (PG17 binaries, NetworkService, localhost:5433, trust auth, data dir
  Temp/opencode/pg-fixture-data) — parked Stopped/Manual, restart with
  `net start pgsql-phase1-fixture`. The real `excel_archive_2` was never written
  except one stray empty `__EFMigrationsHistory` table from a mis-targeted tooling run,
  dropped and verified back at 15 tables the same session.
- Backend: ASP.NET 10 (`net10.0`, SDK `10.0.203`), local `http://localhost:5000`, compose `backend:5000 → host 5000`.
- Frontend: Next `^16.3.4`, React `^19.2.8`, Node `v24.12.0` / npm `11.19.0`, engines `>=20.9.0`; local `http://localhost:3000`, compose `3000:3000`, `BACKEND_URL=http://backend:5000` in compose, `http://localhost:5000` fallback in `next.config.ts`.
- `psql` / `docker` CLIs absent on this agent host — DB/container checks deferred to a host with Docker; no DB operation performed in P1.1.
- V1 stack (reference only): Next `^16.3.4`, Prisma `7.10`, Postgres 16, ExcelJS 4.4, jose, Zod, Tailwind 3.4.

## Isolated V1 reference copy (materialized 2026-09-08)
- Location: `V2/test-artifacts/v1-reference/` — source-only copy (~5MB): src, prisma,
  scripts, configs, docs, test-artifacts. Verified: package.json, src/lib/auth/session.ts,
  prisma/schema.prisma present; `.env`/`.env.local` absent; node_modules absent.
- Excluded: node_modules (843MB), .next (812MB), .npm-cache (1086MB), .next-dev, tmp,
  .git, .vscode, .env/.env.local. Run `npm install` inside the copy on first use;
  never install/run inside original `V1/`.
- Original V1 (`../V1/`) and its DB/volume stay read-only. No write-capable command points at them. `.env` files never copied into docs/source.

## V2 schema inventory (non-destructive, code inspection)
- `AppDbContext` (`backend/src/ExcelArchive.Infrastructure/Persistence/AppDbContext.cs:12-24`): 13 `DbSet`s — Groups, Files, Categories, FileColumns, Records, UploadJobs, DataQualityIssues, ActivityLogs, RecordEdits, MappingTemplates, IgnoredConflicts, Users, UserPermissions.
- Missing vs V1 15 models: `ConflictCacheState` (`conflict_cache_state`, int id=1 + revision) and `ConflictQueryCache` (`conflict_query_cache`, text key + sourceRevision/checkedDate/payload/rebuiltAt) — no domain entities, no `DbSet`s. → P1.2 must add.
- Bootstrap: `EnsureCreated` + `Data/SearchIndexes.sql` in `DbSeeder.SeedAsync`; `DesignTimeDbContextFactory` exists for future `dotnet ef migrations add Baseline`; zero EF migrations ship. `EnsureCreated` ≠ `Migrate` — upgrade path unproven. → P1.2.
- `SearchIndexes.sql` (V2, 11 indexes, only `pg_trgm`): missing 6 V1 definitions (`n_father_name`, `n_secondary_contract_code`, `n_job_title`, `n_organizational_level`, `sf_sham_cash` padded-16 expression, `sf_functional_category` b-tree) and `fuzzystrmatch`; 3 extra raw-field indexes (`sf_job_title`, `sf_full_name`, `sf_phone`) that do not replace normalized indexes. Seeder swallows index failure as warning. → P1.2.
- Types: EF enum → `varchar` via `EnumToPrismaConverter` (documented physical difference, acceptable if contracts preserved); JSONB columns present; timestamps default (no explicit `timestamptz(3)` — V1 uses `timestamptz(3)`); uniques/FKs match V1 except cache tables absent. Full per-property manifest → `test-artifacts/schema-manifest.md` (P1.2).
- V1 source of truth: `V1/prisma/schema.prisma` (15 models, 4 enums), `V1/prisma/search-indexes.sql` (14 indexes + 2 extensions), 16 migrations including `20260906140000_conflict_query_cache` (state + query tables + 5 statement triggers + revision function).

## P1.1 acceptance
- [x] No write-capable command points at original V1 or its DB.
- [x] Pre-existing V2 changes documented (not reset).
- [x] Target DB/ports/tool versions recorded without secrets.
- [x] Isolated reference path + fixture DB identity selected.
- [x] Current V2 schema inventoried (13/15 entities, index/migration gaps named).
- Next: P1.2 schema manifest + migrations + index/cache DDL.
