# Phase 3 start — P3.1/P3.2/P3.3 backend repair + contract adapters (2026-09-09)

## Incoming state
- Docs/12: Phase 1 + Phase 2 COMPLETE, Phase 3 NOT_STARTED, next P3.1.
- Reality: backend did NOT compile. `RecordsController` called
  `IEditsService.GetRecordEditsAsync/SaveAsync/RevertAsync(id,…)` and
  `VisitAsync(id, CurrentUserDto, scope)` which did not exist on the
  interface (old `RevertAsync(editId, newValue…)` trusted client values).
  `dotnet build` → 8 errors.

## Done this packet
- `IEditsService` + `EditDtos`: added `RecordEditsResult` (newest-first
  edits + oldest-first `EditedHeaders`), `EditResult(Changed,OldValue,NewValue)`,
  `SaveAsync` / server-derived `RevertAsync` / `GetRecordEditsAsync` /
  `VisitAsync(recordId, CurrentUserDto, scope)`. Removed client-value revert.
- `EditsService` rewritten to V1 `lib/edits/service.ts` parity:
  save (length ≤5000, column ownership, no-op, shared `RecordShadowMapper`,
  `RecordQualityChecker` rebuild, targeted duplicate-national repair,
  relational-transaction with InMemory fallback, RECORD_EDITED activity);
  revert derives latest edit server-side; visit writes RECORD_VISITED with
  person/file/visitor details; scope enforced.
- `RecordsController`: added missing `Edits.Dtos` using; build green.
- Search contract (P3.1): backend `SearchService`/`SearchController` already
  had 14 fields, repeated groupId/fileId dedup, functional categories, fuzzy
  (distance×5 ≤ length), exact/prefix/substring rank, 10 sorts. Fixed the
  frontend breach: `api-client.buildQuery` now appends arrays (repeated
  params), `QueryMap` allows arrays, `search.service.ts` uses
  `ApiEnvelope<{rows,total,page,pageSize,pageCount}>` with `groupId`/`fileId`
  arrays + sort/mode/field (was comma-join + items/totalPages).
- Record read model (P3.2): `RecordService.GetDetailAsync` verified (scoped,
  badge-gated history, 4 related/conflict lookups). `records.service.ts`
  realigned to `RecordDetailDto` (columns, editedHeaders, related groups);
  `saveEdit`/`visit` unwrap the `ApiResponse` envelope.
- Minimal UI adapters to keep build green (full UI-03/11/12 port stays P3.4):
  `search-results.tsx` renders `rows` (V1 shape); `record-details.tsx`
  renders `columns` + `editedHeaders`.

## Verification
- `dotnet build Api` → succeeded, 0 errors.
- `dotnet test Foundation` → 213/213 PASS (was 180 at Phase 2 gate;
  +28 search live/facts/validation, +5 new `EditsServiceTests` E-vectors:
  A→B→C→revert, no-op, overlong, unknown column, revert-without-history,
  visit activity).
- Search live (fixture :5433): `SearchLiveTests` 8/8 green (normalization
  pairs, custom fields, fuzzy boundary, mixed text/numeric, national sort
  nulls-last, rank exact-first, out-of-scope empty, paging).
- Indexes: all 14 V1 definitions present on fixture `records`
  (13 trgm + `records_sf_functional_category_idx`); extensions pg_trgm +
  fuzzystrmatch in `SearchIndexes.sql`.
- `npm run build` frontend → 19 routes, typecheck green.
- EXPLAIN on empty fixture returns seq-scan/0 rows (fixture cleaned to
  0/0/0 per Phase 2); measured per-query EXPLAIN on populated Q-data stays
  P3.5 work alongside warm-count mutation checks.

## Remaining Phase 3 (per 08)
- P3.1 tail: Q07 warm-count mutation test (no count cache — assert counts
  agree after edit/import/delete/restore).
- P3.2 tail: formatting/category-order + related-files live assertions.
- P3.3 tail: live-DB E′ (national-identity related change, remap-after-edit,
  export-after-revert) — InMemory E01–E05 green here.
- P3.4: full UI-03/11/12 (mode tabs, 14-field select, scope selector,
  10 sorts, highlight/pager, keyboard nav; record tabs/hide-empty/copy/
  save-cancel/revert/print/history; edits file-summary/history/export).
- P3.5: populated EXPLAIN + evidence, then Phase 3 exit update in 12.
