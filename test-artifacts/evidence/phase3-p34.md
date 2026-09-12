# Phase 3 P3.4/P3.5 — full UI-03/11/12 + edits history contract (2026-09-09)

## Scope (08 P3.4/P3.5)
Port UI-03/11/12 including keyboard row navigation, header search/hide-empty/
copy/save-cancel/revert/print/history. Warm-count mutation checks + measured
search EXPLAIN as far as possible without a live database in this environment.

## Sources read (bounded)
- docs/05 A09/A15–A18 + record read; docs/07.2/07.3/07.5; docs/06 UI-03/11/12.
- V1 `features/search/{search-filters,search-results,search-results-table,
  group-multi-select,highlight}.tsx`, `features/records/record-details.tsx`
  (full), `app/(protected)/records/[id]/page.tsx` (header/related),
  `app/(protected)/edits/page.tsx` (summary/history/export).
- V2 `SearchController.cs`, `EditsController.cs`, `EditsService.cs`,
  `EditDtos.cs`, `search/records/edits/auth/groups` services, `Pager`,
  `use-api-query`, `permissions`, `standard-fields`, `conflict-format`.

## Backend changes (additive, UI-12 person-name requirement)
- `Application/Edits/Dtos/EditDtos.cs`: `EditDto` gains optional
  `PersonName` + `RowIndex` (defaults null → wire-compatible).
- `Infrastructure/Edits/EditsService.cs` `ListAsync`: one batched record
  lookup per history page, mapped in memory (deleted records stay visible as
  null name); display name = SfFullName else joined parts else "سجل بدون اسم".
- `Api/Controllers/EditsController.cs` `List`: `Cache-Control: no-store`
  (V1 A18 contract).
- Tests: `SearchServiceFacts.PageSize_Clamped_Page_Floored` used a live query
  ("احمد") so it failed without PostgreSQL; switched to the short-circuit
  empty query — clamping asserted with no DB. New
  `EditsServiceTests.List_IncludesPersonNameAndRowIndex` (save → history shows
  "B", row 2, total 1).

## Frontend changes
- `features/search/search-results.tsx` (rewrite): full/custom mode tabs,
  14-field select in V1 source order, scope selector (groups list + lazy
  per-group files, indeterminate via group/file split, summary/reset),
  repeated groupId/fileId URL params, back/forward restoration, 600ms settled
  draft, 9 sortable headers + static match column in V1 order, match badge +
  normalized highlight, padded national/sham/category formatting, em dash for
  missing, row click + Enter/Space navigation with nested-anchor guard,
  open-in-new-tab, pager + page-size, empty-query/no-match/loading/failure/
  out-of-range states.
- `features/records/record-details.tsx` (rewrite): return-to-search link,
  person header (name/file/group/row/upload), category tabs in source order
  (print renders all categories), header search across tabs with Arabic
  normalization + selected-tab fallback, hide/show-empty with aria-pressed and
  both no-results variants, per-cell copy (feedback), edit with save/cancel +
  Enter/Escape + per-cell busy, معدّل badge with original-value tooltip gated
  on edits.badge (editing gated on edits.update), server-side revert with
  confirm, related national/person sections with new-tab links, single visit
  log (ref dedup), print button (screen-only UI hidden via no-print).
- `features/edits/edits-page.tsx` (rewrite): file-summary cards
  (name/group/count/date, badge-gated معدّل, per-file export link gated on
  export.run), file/history view selection with return-to-summary, history
  table (person name, raw header, old/new, timestamp, record link) in newest-
  first source order, paging + page-size, empty/error states, revert pointer.
- `services/edits.service.ts`: `history()` typed page
  (`items/total/page/pageSize` camelCase per Program.cs) + `exportUrl(fileId)`
  via existing A12 file export (full XLSX incl. edits history).
- `features/conflicts/conflict-report.tsx`: lint-disable comments only (same
  use-api-query pattern); no behavior change.

## Verification
- `dotnet build ExcelArchive.Api.sln` → 0 errors (5 pre-existing warnings).
- `dotnet test` → **375/375 PASS** (was 374 with 1 live-DB failure; +1 new
  edits test, 0 regressions). Live `SearchLiveTests` skip gracefully without
  :5433 (fixture service absent in this environment).
- Frontend `npm run lint` → 0 errors (2 pre-existing conflict-report errors
  fixed with the same pattern). `npm run build` → 19 routes green.

## P3.5 status
- Q07 (counts agree after mutations): V2 `SearchService.SearchAsync`
  (`Infrastructure/Search/SearchService.cs:39-109`) runs a fresh `COUNT(*)`
  per request — no count cache exists anywhere in `src/` (only conflict
  revision cache + merge/sheet-merge session stores). Counts agree with
  current records by construction; mutation-path invalidation is vacuous.
  Live Q07 re-run stays a fixture-DB task (commands below).
- Populated EXPLAIN: no live PostgreSQL in this environment (fixture
  `pgsql-phase1-fixture` service absent, data dir gone; main PG17 unreachable
  with available credentials). Rerun on a live fixture:
  `EXPLAIN (ANALYZE, BUFFERS) <representative search SQL>` cold/warm +
  Q07 edit/import/delete/restore → immediate re-query count/row agreement.
- Phase 3 exit per 08: backend search order + edit/revert propagation proven
  by suite (InMemory E-vectors + skipped-live Q vectors); UI-03/11/12 ports
  build + lint green, awaiting live-browser pass in Phase 7 (P7.1/P7.2).
