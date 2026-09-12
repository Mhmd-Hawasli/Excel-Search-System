# Phase 4 P4.2 — invalid11/missing9/similar2 engines (2026-09-09)

## Scope (08 P4.2)
Implement invalid11, missing9, similar2 with positive/negative examples;
retire legacy six-branch rows. Conflicting36 → P4.3; ignore/cache → P4.4;
full export + UI-13 → P4.5; 58-rule suite → P4.6.

## Sources read (bounded)
- docs/05 A19–A21, docs/07.6 (58 keys + cache spec), docs/06 UI-13.
- V1 `lib/conflicts/catalog.ts` + `request.ts` (full), `query.ts`
  localRule/similar/date/group/sort/report sections, `app/api/conflicts/route.ts`,
  `app/api/conflicts/export/route.ts`, `app/api/conflicts/ignore/route.ts`,
  `lib/format/date.ts`, `lib/normalization/arabic.ts`, `lib/format/national-id.ts`,
  `lib/format/sham-cash.ts`.
- V2 `ConflictService.cs`, `ConflictsController.cs`, `ConflictCatalog.cs`,
  `ConflictRequest.cs`, `ConflictDtos.cs`, `Record.cs`, `FileColumn.cs`,
  `ArabicNormalizer.cs`, `RecordShadowMapper.cs`, `UploadBackgroundService.cs`
  (Data JSON keyed by HeaderRaw).

## V1 parity decisions
- Original trimmed cell via FileColumns mapping + Record.Data (fallback to
  Sf* when unmapped); missing/name_mismatch gated on mapping presence.
- numericInput = latin digits + strip ALL trim chars (V1 trimCharacters);
  numericKey = pure-digits → strip leading zeros else null. sham_short +
  sham_characters both flag non-numeric short input (multi-issue rows).
- name_mismatch requires all four name mappings + normalized inequality.
- category_invalid = SfFunctionalCategory == 0 only.
- Dates: FileColumns whose normalized header contains 'تاريخ'; per-cell
  parseStoredDate port (dmy/ymd/English-weekday + validDateParts);
  date_future excludes contract-end headers (نهاي/انتهاء + عقد).
- Similar: person_key NOT NULL grouping (names) and name+ national_key
  grouping (national), with MIN/MAX explanations; groupKey = name_key,
  DENSE_RANK; invalid/missing groupKey = id, ROW_NUMBER by
  name/mother/file/row/id.
- Sort mirrors sortOrderSql (nulls first asc / last desc + secondary ties
  + id); pagination returns rows/total/page/pageSize/pageCount.
- Scope: global (null) sees all; scoped bounded by visible FileIds
  (empty = nothing); files with PENDING/PARSING/INSERTING jobs excluded
  (V1 base CTE). Ignored (rule,recordId) filtered per-issue (existing
  behavior kept; full scope/rule validation → P4.4).
- Conflicting category returns empty V1-shape page until P4.3 (no wrong keys).

## Changes (all additive except legacy retirement)
- `Domain/Conflicts/ConflictEngine.cs` (new): TrimCell/NumericInput/
  NumericKey/NationalKey, EvaluateInvalidMissing (11+9 + dates),
  EvaluateSimilar (2), V1 verbatim explanations.
- `Domain/Conflicts/ConflictDateParser.cs` (new): parseStoredDate port.
- `Application/Conflicts/Dtos/ConflictDtos.cs`: removed legacy
  ConflictQueryRequest/ConflictRow/ConflictsResult (P4.1-marked for removal);
  kept ConflictIssueDto/ConflictRowDto/ConflictListResult.
- `Application/Abstractions/IConflictService.cs`: List/Export now take
  ValidConflictRequest → ConflictListResult.
- `Infrastructure/Conflicts/ConflictService.cs` (rewritten): scope +
  active-job exclusion, FileColumns + Data load, engine eval, ignore-pair
  filter, group/sort/page, V1 display (padded nationalId, trimmed raws).
  Export uses the same engine (interim 8-col ClosedXML, capped 20k;
  V1 12-col formatting → P4.5).
- `Api/Controllers/ConflictsController.cs`: List preserves validated
  sort + filters-permission effective (invalid/all/all); Export validates
  via the same schema (V1 export route) incl. sort.
- Tests `ConflictP42Tests.cs` (new, 24): 7 invalid groups, 9 missing
  theory, 2 similar, 5 service (V1 shape/pageCount, missing pagination,
  similar groupKey/dense-rank, conflicting-empty + empty-scope, ignored
  hides only that rule), 1 live jsonb smoke (:5433).

## Verification
- `dotnet build Api` → 0 errors (4 pre-existing warnings).
- New P4.2 filter → 24/24 PASS (23 InMemory + 1 live).
- Full suite → 258/258 PASS (234 + 24), no regressions.
- Frontend `npm run build` → 19 routes green (thin UI untouched by design;
  it still reads legacy `rule/description` keys and will show empty
  rule text until P4.5 ports UI-13 to `issues[]`).
- Fixture DB `pgsql-phase1-fixture` Running/Manual (:5433); V1 untouched.

## Remaining Phase 4
- P4.3: conflicting14 + directed22 engines + asymmetric fixtures.
- P4.4: rule+record ignore (known-rule 400, scope hidden-404, idempotent
  upsert) + persistent revision cache (locks/caps/invalidation).
- P4.5: full >200-row export (V1 12-col) + UI-13 filters/stats/table/ignore/pager.
- P4.6: 58-rule suite, 20-mutation cache scenario, misses, date rollover.
- Note: Phase 3 P3.4/P3.5 still open (parallel track, independent).
