# Release manifest (P8.1) — V2 cutover release

Status 2026-09-09: **rehearsal complete / deployment pending** (P8.3–P8.4).
No production authorization, host, or source data access exists in this
environment (open inputs in docs/10); nothing below authorizes touching
production. V1 stays read-only and is never decommissioned under this plan.

## 1. Source snapshot identity

| Artifact | Identity (2026-09-09) |
|---|---|
| V1 source (frozen reference) | git HEAD `c8f47c2`, working tree **clean** |
| V2 release candidate | git HEAD `11da0d5` + additive Phase 1–8 work (pre-existing restructuring deletions preserved, never reset) |
| EF migrations shipped | 3 (`Baseline`, `RemoveDuplicateFunctionalCategoryIndex`, `AuditTimestampDefaults`) |
| Schema | 15 tables (10 archive + users/userPermissions + 2 conflict-cache + ignored_conflicts), 14 search indexes (`SearchIndexes.sql`), 5 conflict-coupling triggers (`ConflictCache.sql`), extensions `pg_trgm` + `fuzzystrmatch` |
| Parity surface | 19/19 routes, 38 handlers (A01–A38) + documented read models, 14 search fields, 58 conflict rules, two merge engines, 7 quality types, UPPERCASE jobs @1200 ms |
| Verification on this snapshot | Backend 433/433, frontend lint + typecheck clean, `next build` 19/19 green (evidence: `evidence/phase7.md`, `evidence/phase8.md`) |

## 2. Runtime bill of materials

Backend image (`backend/Dockerfile`): .NET 10 (`mcr.microsoft.com/dotnet/aspnet:10.0`),
listens **5000** (`ASPNETCORE_URLS=http://+:5000`). Excel via ClosedXML.
Frontend image (`frontend/Dockerfile`): Node 24-alpine, Next 16, serves **3000**,
proxies `/api/*` to `BACKEND_URL` (compose default `http://backend:5000`).
Database: Postgres 16 (`postgres:16-alpine`), database `excel_archive_2`.

## 3. Required configuration (no defaults ship secrets)

| Variable | Required value | Notes |
|---|---|---|
| `ConnectionStrings__Default` (or `DATABASE_URL`) | `Host=postgres;Port=5432;Database=excel_archive_2;Username=excel_archive;Password=<strong>` | Never the V1 database; separate volume (`excel_archive_2_data`) |
| `SESSION_SECRET` | ≥32-char random secret | Startup must reject missing/weak values; derivation salt `excel-archive-search/session-signing/v1` is fixed |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Owner bootstrap account | Seeded only when users table is empty; otherwise grants are upgraded, never reset |
| `BACKEND_URL` (frontend) | `http://backend:5000` in compose; server-only | Never expose Postgres/Prisma to the browser |
| `AllowedOrigins__0` (+ peers) | Exact frontend origin(s) | Credentials (cookies) require exact origins, not `*` |
| `UploadStore:Path` | Persistent volume path | Durable job inputs; survives restarts (default: OS temp — override in production) |
| Reverse proxy | Forward cookies, upload bodies (50/250 MiB), `Content-Disposition`, NDJSON streams; set `X-Forwarded-Proto` from the trusted proxy only | Backend trusts forwarding headers per its `ForwardedHeaders` setup — terminate TLS at the proxy and verify LAN HTTP vs HTTPS separately |

Production startup gate: `/health/ready` must report healthy (Postgres **plus**
search-schema: both extensions, ≥14 `records_*` indexes, both cache tables),
otherwise the release does not take traffic. Rate limits ship as code (login
20/min, api 300/min — 1200 ms polling cannot trip the api bucket).

## 4. Cutover window (template — needs approver + freeze owner, docs/10)

1. Announce window; freeze source writes (operational level). Record snapshot
   time + per-table row counts + `MAX(updated_at)` watermarks.
2. Export from source: `GET /api/backup/export` (archive) +
   `GET /api/backup/migration-export` (accounts). Store under private
   migration artifacts (never chat/docs/repo).
3. Disposable-target rehearsal first (P8.2): restore (confirmation `استعادة`),
   import accounts, verify §5. Only then touch the production target.
4. Production transfer → verify §5 → monitor (auth failures, job states,
   cache revision movement, 5xx rate).
5. Sessions are NOT carried: users log in again (documented re-login; password
   hashes are compatible, no reset).
6. Estimated transfer time: **unmeasured** — no production-sized dataset exists
   here; measure on the rehearsal target with a real snapshot before promising
   a window. Do not invent throughput numbers.

## 5. Cutover verification checklist (counts + behavior)

- Archive restore summary `{groups, files, records}` equals source counts;
  accounts import summary `{users, userPermissions, ignoredConflicts}` equals
  the accounts file counts; source UUIDs preserved (spot-check IDs).
- Every migrated user logs in with the original password; scoped users see
  exactly their snapshot files (post-grant files stay invisible); conflict
  ignores apply to the same rule+record; sample exports match source semantics
  (docs/09); conflict revision bumped (cache rebuilt, never migrated).
- Core journeys on target: upload → browse → quality → remap → replace →
  export; search order/counts; edit → revert propagation; both merge tools;
  backup export round-trip.

## 6. Rollback procedure (rehearsed in-suite, P8.2)

- Retain the **pre-cutover target snapshot** (full archive export + DB-level
  backup) until the agreed retention date (propose 30 days; needs approver).
- Rollback = re-restore the pre-cutover snapshot (proven: archive reverts,
  accounts/logins survive). Never a reverse transfer; never touch V1.
- Malformed-restore and failed-replace paths are all-or-nothing by
  construction (covered by `BackupPhase6Tests`, `WorkerTests`, `RemapTests`).

## 7. Authorization record (P8.3/P8.4)

- Rehearsal documents (this manifest, `migration-spec.md`, `evidence/phase8.md`)
  are written — no approval needed for writing them.
- **Production migration/cutover is NOT authorized and NOT performed.**
  Required before P8.4: target host/proxy/HTTPS owner, source snapshot access +
  secure accounts destination, cutover window + freeze + retention + approver,
  session-carryover decision (default: re-login), real-dataset performance
  baseline. Until then: **rehearsal complete / deployment pending.**
