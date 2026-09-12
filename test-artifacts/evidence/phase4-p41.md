# Phase 4 P4.1 — catalog + validated request/result/group/sort contracts (2026-09-09)

## Scope (08 P4.1)
Catalog and validated request/result/group/sort contracts; fixture
coverage manifest for all 58 rules. Engine implementation stays
P4.2 (invalid/missing/similar) / P4.3 (conflicting/directed); ignore,
cache, export, UI stay P4.4/P4.5.

## Sources read (bounded)
- docs/05 A19–A21, docs/07.6 (58 keys + cache spec), docs/06 UI-13.
- V1 `lib/conflicts/catalog.ts` (full), `request.ts` (full),
  `catalog.test.ts` (intent), `query.ts` groupKey/sort/report sections
  (lines 425–624 only), `app/api/conflicts/route.ts`,
  `app/api/conflicts/ignore/route.ts`.
- V2 `ConflictService.cs`, `ConflictsController.cs`,
  `IConflictService.cs`, `ConflictDtos.cs` (full).

## V2 gaps confirmed (pre-existing, unchanged by P4.1)
- Six simplified branches with wrong identifiers (`missing_national_id`
  vs V1 `missing_national`); 52 rules absent; no category/field engine.
- No request validation; defaults category all / pageSize 50 (V1: invalid / 25).
- No sortBy/sortDir params; single-rule rows without groupKey/issueNumber;
  result lacks pageCount; ignore skips scope + rule checks; export reads
  first 200 rows; 5-min memory cache instead of persistent revision cache.

## Changes (all additive; engine untouched)
- `backend/src/ExcelArchive.Domain/Conflicts/ConflictCatalog.cs` (new):
  frozen 58-rule catalog — 4 categories, 15 fields, 6 pair sides + labels,
  58 rules with exact V1 keys/labels/pair sides, 8 sortable keys,
  `ByKey` + `SelectedRules` helper. Verbatim Arabic labels.
- `backend/src/ExcelArchive.Application/Conflicts/ConflictRequest.cs` (new):
  `ConflictRequestValidator.TryParse` mirroring V1 request.ts — defaults
  (invalid/all/all/1/25/issueNumber/asc), page 1..1M, pageSize 10..100,
  field/rule membership + category superRefine; single V1 400 message.
- `Application/Conflicts/Dtos/ConflictDtos.cs`: added V1-shape
  `ConflictIssueDto`, `ConflictRowDto` (multi-issue, groupKey/issueNumber,
  source identity/display values), `ConflictListResult`
  (rows/total/page/pageSize/pageCount). Legacy single-rule types kept and
  marked for P4.2 removal; not extended.
- `Api/Controllers/ConflictsController.cs` `List`: string page/pageSize/
  sortBy/sortDir params, V1 validation → 400 Arabic message, no-filters
  effective fixed to invalid/all/all (was null/all/all), `no-store`
  header. Service wiring unchanged.
- `test-artifacts/fixtures/conflict-rules-manifest.md` (new): 58-rule
  positive/negative coverage checklist incl. asymmetric directed examples
  + C059–C063 cross-cutting; owners P4.2/P4.3/P4.4/P4.5.
- Tests: `ConflictCatalogTests.cs` (4: 58 keys/labels, 11/9/2/36,
  22 pairs + legacy-combo integrity, SelectedRules) +
  `ConflictRequestTests.cs` (defaults, 5 illegal combos, page/pageSize/
  sort bounds, valid triple) — 21 tests.

## Verification
- `dotnet build Api` → 0 errors (4 pre-existing warnings).
- New tests → 21/21 PASS.
- Full suite → 234/234 PASS (213 + 21), no regressions.
- Frontend untouched (no P4.1 frontend changes); no rebuild needed.

## Remaining Phase 4
- P4.2: invalid11/missing9/similar2 engines + fixtures (retire legacy rows).
- P4.3: conflicting14 + directed22 engines + fixtures.
- P4.4: rule+record ignore (scope, known-rule 400, idempotent upsert,
  hidden 404) + persistent revision cache (locks/caps/invalidation).
- P4.5: full export + UI-13 filters/stats/table/ignore/pager.
- P4.6: 58-rule suite, 20-mutation cache scenario, misses, date rollover.
- Note: Phase 3 P3.4/P3.5 still open (parallel track, independent).
