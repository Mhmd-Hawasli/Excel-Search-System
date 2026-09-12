# Phase 3 re-verification — docs re-read + test gate (2026-09-09)

Request: `red the docs folder: check and test phase 3 and update plan (md files)`.
No application code changed in this session; verification + docs only.

## Docs re-read
00, 08 (Phase 3 = P3.1–P3.5), 03 (gaps G-SEARCH, G-SEARCH-COUNT,
G-RECORD-READ, G-EDIT, G-REVERT, G-EDITS-PAGE), 09 (Q01–Q07, E01–05),
12 + phase3-start.md. Plan unchanged: no packet redefinition needed.

## Test results (this session)
- `dotnet build Api` → succeeded, 0 warnings, 0 errors.
- Full backend suite → **213/213 PASS** (31 s).
- Phase-3 subset (`SearchLiveTests|SearchServiceFacts|SearchValidationTests|
  EditsServiceTests`) → **33/33 PASS** (20 s, fixture :5433 live).
- `npm run build` frontend → 19 routes, typecheck green.
- Fixture DB `pgsql-phase1-fixture` + `postgresql-x64-17` both Running
  during verification. V1 untouched.

## Per-packet verdict vs 08 exit criteria
- P3.1 (14 fields, repeated scope, functional categories, fuzzy,
  ranking/sorts; Q01–Q06): PASS — 8/8 `SearchLiveTests` green; no count
  cache in `SearchService` (counts always live). Tail Q07 (warm-count
  mutation test) still open → P3.5.
- P3.2 (record read model + related visible files): PASS (backend) —
  `RecordService.GetDetailAsync` scoped, badge-gated, 4 related/conflict
  lookups; `records.service.ts` aligned. Live formatting/category-order
  assertions still open → P3.5.
- P3.3 (GET/POST edits + server-derived revert; E01–E05): PASS —
  5/5 `EditsServiceTests` green (A→B→C→revert, no-op, overlong, unknown
  column, revert-without-history, visit). Live-DB E′
  (national-identity/related, remap-after-edit, export-after-revert)
  still open → P3.5.
- P3.4 (UI-03/11/12 full ports): OPEN — `search-results.tsx`,
  `record-details.tsx`, `edits-page.tsx` are minimal contract adapters
  only (verified in source this session). Missing per 06: mode tabs,
  14-field select, scope selector, 10 sorts, highlight/pager, keyboard
  nav; record tabs/hide-empty/copy/save-cancel/revert/print/history;
  edits file-summary/history/export views.
- P3.5 (Q07 + populated EXPLAIN + evidence): OPEN.

## Phase exit (08)
NOT met: `search finds expected records in exact order` (backend ✓),
`every edit/revert propagates immediately` (backend ✓, live E′ pending),
UI-03/11/12 controls (pending). Phase 3 stays IN_PROGRESS.
G-SEARCH/G-EDIT/G-REVERT backend halves verified; G-SEARCH-COUNT,
G-RECORD-READ, G-EDITS-PAGE remain open pending P3.4/P3.5.
