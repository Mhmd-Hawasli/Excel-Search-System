# Phase 7 — Full parity, performance and deployment rehearsal (evidence)

Date: 2026-09-09. Scope: docs/08 P7.1–P7.5. V1 read-only; all changes in V2.
Fixture host: NOT available (`localhost:5433` TCP closed; local `postgresql-x64-17`
service exists but no fixture DB/credentials were provisioned). Live-DB/browser
proofs stay explicitly deferred, same as Phases 1–6.

## Changed paths

Backend:
- `src/ExcelArchive.Api/Program.cs` — `/health/ready` now also runs a
  `search-schema` check (pg_trgm + fuzzystrmatch extensions, >= 14 `records_*`
  indexes, both conflict cache tables). Index/extension loss is now a readiness
  failure (docs/04), not a log warning.
- `src/ExcelArchive.Infrastructure/Upload/UploadBackgroundService.cs` — startup
  crash recovery: `RecoverInterruptedJobsAsync` re-queues PARSING/INSERTING jobs
  to PENDING once (EF-based, works on InMemory + Postgres). Previously only
  PENDING was ever claimed, so crash-interrupted jobs hung forever.
- Tests: `tests/.../MergeP74ScaleTests.cs` (new, 55k-row no-truncation proof),
  `tests/.../JobRecoveryP75Tests.cs` (new, 2 recovery tests).

Frontend:
- `src/hooks/use-upload-job-polling.ts` — I02 fix: sequential `setTimeout`
  chain (no overlapping polls), sequence guard against stale out-of-order
  responses, `AbortController` cancels in-flight fetch on unmount/job change.
  Nominal 1200 ms cadence, UPPERCASE statuses, one-toast-per-job preserved.

## P7.1 — 19-route control ledger + permissions

- V1 and V2 both have exactly 19 `page.tsx` routes (login, dashboard, conflicts,
  edits, groups, group detail, file detail, mapping edit, quality, update, logs,
  merge, merge-sheets, record detail, search, backup, categories, users, upload).
  Verified by recursive enumeration of both trees — identical sets.
- Permission reconciliation: every controller resolves through
  `ApiControllerBase.RequirePermissionAsync` (401 signed-out vs hidden 404).
  Observed keys: ActivityBrowse; BackupExport/Restore; CategoriesManage/View +
  UploadView (selector reads); ConflictsFilters/View + ExportRun; EditsView;
  GroupsView + UploadRun/UploadView + ExportRun (files); MergeView;
  EditsUpdate/View + SearchView (records); SearchView; SheetMergeView; UploadRun
  (jobs + workbooks); UsersCreate/Update/Delete/View. Dashboard requires auth,
  sections gated client-side from `/api/auth/me` per V1. No mismatched key found.
- No zero-GUID placeholder (`00000000-...`) anywhere under `frontend/src`.

## P7.2 — Visual sweep (static; live-browser pixel pass deferred)

- `globals.css` verified: base 1440 layout; `@media (max-width:1279px)`,
  `(max-width:1023px)` 60px rail, `(max-width:639px)` mobile stacked topbar and
  16px inputs — covers required 1440/1024/768/390/320 widths structurally.
- Sidebar 252px / collapsed 72px (`data-collapsed`, persisted
  `archive-sidebar-collapsed`), mobile drawer via Radix Dialog overlay
  (`mobile-sidebar`, overlay/Escape/focus from Radix), light/dark CSS vars +
  `next-themes` provider, `prefers-reduced-motion`, `:focus-visible` rings,
  RTL (`dir=rtl`, `ltr-numbers`), `@media print` hides sidebar/topbar/footer/
  `.no-print` and expands all tab panels. Cairo self-hosted variable font,
  `lang=ar`, no hydration flash (`suppressHydrationWarning` + theme provider).
- Shared states present: `empty-state`, `flash-message`, `pager`, skeleton via
  per-page loading, `typed-delete-button`, alert-dialog overlays, not-found +
  global error routes with Arabic text.
- Live-browser pixel comparison at 5 widths × light/dark × shell states needs a
  fixture host + browser harness; deferred (recorded blocker, not a pass claim).

## P7.3 — Integrated journey + full regression

- Backend: `dotnet test ExcelArchive.Api.sln` → **431/431 PASS** (428 + 3 new),
  0 failed, ~15 s. Covers foundation, groups/upload/files, search/records/edits,
  58-rule conflicts + 250-row export-beyond-page, merge/sheet-merge + NDJSON,
  categories/users/backup/migration/activity, scale + recovery.
- Frontend: `npm run lint` 0 errors, `npm run typecheck` clean,
  `npm run build` 19/19 routes green (9 static / 10 dynamic, same as baseline).
- Integrated fixture coverage (in-suite, InMemory + ClosedXML, no host needed):
  X01–X12 workbook/import/replace/remap/export, Q/E vectors, C001–C058 ±
  fixtures + C059–C063 validation/ignore/export, CACHE bounds, M/S series,
  B-series round-trips, U-permission snapshot semantics. Prior live-journey
  evidence (52 checks, phases 2–3) stands; re-running it needs the fixture host.

## P7.4 — Benchmarks + measured improvements

Measured on this host (Windows, .NET 10, InMemory where noted):
- Full backend suite: 431 tests / ~15 s (≈ 35 ms/test incl. EF InMemory setup).
- `MergeP74ScaleTests` (new): 55k unique national-id rows/side end-to-end in
  **~1 s**, all 55k rows present, 55k pairs, status `complete` — closes the P5.5
  >50k proof: no silent truncation, no 50k cap remains in the engine.
- Sheet-merge >300-unlinked proof pre-exists (`Build_FullUnlinkedKeptBeyondPreview`:
  352 total, 300 preview, all 352 in export sheet). Conflict >200-row export
  pre-exists (`ExportBeyond200_MatchesListSemantics`, 250 rows).
- I02 poll fix is behavior-correctness (overlap/stale/cancel), not a speed claim:
  same 1200 ms nominal cadence, one toast; no perf regression possible (fewer
  concurrent requests than before). Frontend lint/typecheck/build green after.
- No speculative tuning applied (per docs/10 process): EXPLAIN/500k-scale numbers
  need the same-data/same-hardware fixture host; not invented here.

## P7.5 — Ops / deployment rehearsal (code + inspection; live transfer deferred)

- Cookies/proxy: session cookie HttpOnly/SameSite=Lax/Path=/12h, Secure derived
  from `IsHttps` or `X-Forwarded-Proto`; `UseForwardedHeaders` with cleared
  known networks/proxies (local-dev compatible; direct-backend exposure must
  sit behind the documented trusted proxy — residual ops note, unchanged).
- Limits: 50 MiB request caps on workbook/merge/sheet-merge inspects + 413s;
  restore `DisableRequestSizeLimit` + 260 MiB form limit + 250 MiB 413 gate;
  global 300 MiB multipart ceiling. Rate limits: login 20/min, api 300/min —
  1200 ms polling (≈ 50 req/min/job) cannot trip the api bucket.
- NDJSON: `NdjsonWriter` flushes every line; frontend `apiFetchNDJSON` uses
  streaming `TextDecoder` + `\n` split with tail flush — split UTF-8/partial
  lines handled on both ends. Binary exports assert content-type/disposition
  and parse bytes separately.
- Readiness: `/health/live` + `/health/ready` (postgres SELECT 1 AND new
  search-schema check). Seeder still `EnsureCreated` + idempotent SQL files;
  switching startup to `Migrate` is intentionally NOT done here (existing
  EnsureCreated DBs have no migration history — needs the P8 baselining
  rehearsal on a clone, not a blind switch).
- Job restart: fixed (recovery method + 2 tests). Temp cleanup: `WorkbookFileStore`
  disk-backed + 1-day prune; merge sessions 12h/50-entry cap; sheet-merge
  uploads/sessions 12h, export buffers 15min/50-entry cap — bounded, namespaced,
  no cross-tool ID reuse.
- Rollback rehearsal: restore is transactional all-or-nothing (malformed input
  leaves DB unchanged — covered by `BackupPhase6Tests`); replacement stages to
  a temp file and promotes atomically with old-dataset cleanup only on failure
  (covered by `WorkerTests` + `RemapTests`). Live 250 MiB transfer timing and
  proxy-cookie round-trip need the fixture host; deferred.

## Deferred (needs fixture host — not claimed)

1. Populated EXPLAIN ANALYZE + live Q07 re-run (P3.5).
2. Live 20-mutation + date-rollover cache proof (P4.6).
3. Populated-restore timing + 250 MiB live transfer (P6/P7.5).
4. Live-browser 5-width × theme × shell pixel/interaction pass (P7.2).
5. Same-hardware V1-vs-V2 benchmark medians/p95 (P7.4) and `Migrate`-switch
   rehearsal on a clone (P7.5/P8).

## Verdict

Phase 7 COMPLETE at code + suite + static-evidence level (P7.1–P7.5 worked,
2 backend fixes + 1 frontend fix, 3 new tests, 431/431 + lint + typecheck +
19/19 build green). The five deferred items above are environment blockers for
a fixture host, identical in kind to the Phases 1–6 deferrals. No P0/P1 gap is
unaddressed in code; final live-fire acceptance belongs to Phase 8 rehearsal.
