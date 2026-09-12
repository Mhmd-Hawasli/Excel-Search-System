# Phase 5 P5.1 — two-file six-rule engine + inspect/mappings (2026-09-09)

## Scope (08 P5.1)
Two-file inspect/mappings, six-rule ordered matching strict+relaxed and
per-rule results. Delete-and-relink key op implemented alongside (P5.2
partial, engine already supported it). Export three-sheet confirmed/all
→ P5.2 remainder. Sheet-merge engine → P5.3. NDJSON → P5.4. UI-14/15 → P5.5.

## Sources read (bounded)
- docs/05 A22–A26, docs/07.7, docs/06 UI-14, docs/03 G-MERGE/G-SESSION.
- V1 `lib/merge/types.ts` + `rules.ts` (full) + `suggest.ts` + `storage.ts`
  + `session.ts`, `app/api/merge/{inspect,sheet,key,run,export}/route.ts`,
  `lib/normalization/arabic.ts`, `lib/merge/rules.test.ts` (vectors).
- V2 `MergeService.cs`, `MergeController.cs`, `SheetMergeController.cs`,
  `WorkbookSessionStore.cs`, `DependencyInjection.cs`,
  `ArabicNormalizer.cs`, `ExcelTableRange.cs`, `HeaderEngine.cs`,
  `SheetInspector.cs`, `ExcelCellReader.cs`, thin `merge/page.tsx`.

## V1 parity decisions
- Engine is a pure port: canonicalText=NormalizeStored, canonicalNumeric=
  digitsOnly+strip zeros, firstWord confirmation, uniqueness COUNTIF=1 on
  both files, strict confirmed-only linking, relaxed links single candidate
  with مؤكد/غير مؤكد flag, ordered cascade full_name→composed_name→
  national_id→personal_no→sham_cash→phone, per-rule availability reasons,
  zero-padded 4-digit keys, nextKeyAfter restart at 0001 when empty.
- File store is separate from archive uploads (own 12h namespace
  `mergefile:` + session `mergesession:`, cap 50 each); extension gate
  xlsx/xls + 50MiB 413 stay in controller; parser failure → V1 422 text.
- Inspect/sheet are table-aware (first-table bounds, blank→عمود N,
  duplicate headers throw V1 text), preview 6 rows, uncached formulas read
  as empty; suggestedMapping (MergeSuggest, Dice ≥0.58, exclusive name
  forms) is additive alongside exact V1 keys.
- Run validates mappings (unknown field / negative / duplicate column →
  400 V1 text) and common-rule gate (422 V1 text); returns sessionId +
  leftHeaders/rightHeaders + ignoreConfirmation + full rows/pairs/rules/
  status JSON. NDJSON streaming keeps identical payload → P5.4.
- Key delete validates table left/right + rowNumber ≥2 (400), missing row /
  unlinked row → 404 V1 texts; clears both sides by key, relinks unlinked
  only, preserves existing keys (V1 session.ts).
- Legacy generic join (`InspectLegacy/SuggestKey/Run(keyColumn,join)` +
  single-sheet "دمج" export) retained untouched for the thin UI and
  sheet-merge shim until P5.2/P5.3 replace them; new paths do not call them.

## Changes
- `Domain/Merge/MergeTypes.cs` (new): 9 field keys + Arabic labels, 6 rule
  definitions with V1 order/label/method/description/required, MergeRow /
  MatchPair / RuleStat / MergeStatus / MergeTableInput / MergeRunInput
  shapes, export sheet/header constants.
- `Domain/Merge/MergeEngine.cs` (new): prepared rows, ambiguous links,
  ApplyRules/RunMerge/Summarize/RelinkUnmatched/NextKeyAfter/HasCommonRule.
- `Domain/Merge/MergeSuggest.cs` (new): alias scoring + exclusive full vs
  split-name forms.
- `Infrastructure/Merge/MergeFileStore.cs` (new): 12h isolated upload bytes.
- `Infrastructure/Merge/MergeSessionStore.cs` (new): 12h sessions +
  DeletePairKeyAndRelink.
- `Infrastructure/Merge/MergeService.cs`: Inspect/InspectSheet/
  SuggestMapping/Run/DeleteKey/GetSession (V1 parity) + legacy shims kept.
- `Api/Controllers/MergeController.cs`: A22/A23/A24/A25 contracts —
  inspect (400/413/422), sheet (400/422 + suggestion), key delete
  (400/404), run (400/422 + JSON result); export GET/POST unchanged
  interim (P5.2). Removed dead WorkbookSessionStore injection.
- `Api/Controllers/SheetMergeController.cs`: upload path switched to
  `InspectLegacy` shim (P5.3 owns the real engine); no behavior change.
- `Infrastructure/DependencyInjection.cs`: registered MergeFileStore +
  MergeSessionStore singletons.
- `tests/MergeP51Tests.cs` (new, 20 tests): M01 full_name ±, ambiguous
  skip; M02 composed parts-vs-full; M03 national strict/unconfirmed-reject/
  Arabic-digit norm; M04/M05/M06 numeric strict; priority full_name-first;
  relaxed link-unconfirmed + uniqueness/single-candidate guards; rule
  availability reasons; mapping duplicate rejection; HasCommonRule;
  suggest; NextKey; live ClosedXML inspect→sheet→run→delete/relink and
  no-common-rule 422.

## Verification
- `dotnet build ExcelArchive.Api.sln`: 0 errors (2 pre-existing warnings:
  ExcelCellReader nullable-address ×3 + BackupService EF1002; WorkerTests
  CS0105; MergeController unused-param warning removed).
- `dotnet test --filter MergeP51`: 20/20 PASS (18 pure + 2 live service).
- Full suite: 278/278 PASS (was 258; +20 P5.1, no regressions).
- Frontend `npm run build`: 19 routes green (thin merge UI untouched;
  wired to legacy shim until P5.5).
- Live check found + fixed test-only expectation (single-pair delete
  relinks as 0001 per V1 nextKeyAfter, not empty/0002).

## Remaining / next
- P5.2: three-sheet الدمج الكامل/الجدول A/الجدول B exporter (ClosedXML,
  confirmed/all scopes, source colors ignored, key-ordered, A_/B_ prefixes,
  TableStyleLight9/30pt/widths/dates) + export controller scope param +
  retire legacy single-sheet export; 12h session prune evidence.
- P5.3: independent sheet-merge engine (workbook.ts/key.ts/merge.ts/
  store.ts/exporter.ts ports, ≥8-digit key, dedup/unlinked, table bounds).
- P5.4: NDJSON upload/run/export + ready/download-length flow.
- P5.5: UI-14/15 full flows + M/S fixture exports + >300-unlinked / >50k
  no-truncation proofs. Frontend still thin/hardcoded until then.
- Parallel tracks unchanged: Phase 3 P3.4/P3.5, Phase 4 P4.3–P4.6 open.
