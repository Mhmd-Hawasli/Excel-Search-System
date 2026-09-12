# Phase 4 remainder + Phase 5 P5.2–P5.5 — verification + merge/sheet-merge UI (2026-09-09)

## Finding on entry
Docs/12 recorded Phase 4 at P4.1/P4.2 and Phase 5 at P5.1, but the working
tree already contained the remaining backend: `ConflictEngineConflicting.cs`,
`ConflictCacheService.cs`, `ConflictExportBuilder.cs`, `MergeExportBuilder.cs`,
`SheetMerge{Engine,Key,Suggest,Types}.cs`, `SheetMergeService/Store/
ExportBuilder.cs`, NDJSON `NdjsonWriter.cs` + controller streaming, and tests
`ConflictP43/P44/P45/P46`, `MergeP52`, `SheetMergeP53`, `NdjsonP54`. All pass
(375/375). This packet therefore verified the backend against 08 exit gates,
closed the genuine gaps (frontend services + UI-14/15), and recorded evidence.

## Phase 4 verification (source-checked, no behavior change needed)
- P4.3 conflicting36: `ConflictEngineConflicting.EvaluateConflicting` —
  duplicate_*/people/person_* (incl. person_job mapped-files rule) + 22
  directed pairs with asymmetric from→to grouping; `ConflictingGroupKey`
  branch parity. Tests: `ConflictP43Tests` green.
- P4.4 ignore + cache: `ConflictService.IgnoreAsync` — known-rule 400,
  hidden 404 on missing/invisible record, idempotent rule+record upsert,
  revision bump; `ListAsync` served via `ConflictCacheService.GetOrComputeAsync`
  (persistent revision/date-aware key, per-key locks, 128-entry/2MiB caps).
  Tests: `ConflictP44Tests` green.
- P4.5 export + stats: `ExportAsync` re-lists with PageSize=20000 (bypasses the
  old first-200 cap at the validated-request layer, same filter/scope
  semantics) via 12-column `ConflictExportBuilder`; `StatsAsync` single-scan
  per-rule counts. UI-13 (`conflict-report/filters/results/stats/ignore-
  button`) already wired to `issues[]`, sort, pager, export URL, permission-
  gated filter editing. Tests: `ConflictP45Tests` green.
- P4.6 suite: `ConflictP46Tests` (58-rule semantics, mutation/cache scenarios)
  green. Exit: 58/58 keys, grouping/order, export/list agreement, no stale
  cache after writes — proven by suite; live 20-mutation + date-rollover stay
  fixture-DB tasks alongside P3.5.

## Phase 5 verification (source-checked, no behavior change needed)
- P5.2 export: `MergeExportBuilder` three-sheet الدمج الكامل/الجدول A/الجدول B,
  confirmed/all scopes, key-ordered with unlinked last, A_/B_ prefixes,
  source colors ignored per V1 policy; `MergeController.ExportGet/ExportPost`
  scope validation + Content-Disposition/Length. Tests: `MergeP52Tests` green.
- P5.3 sheet-merge engine: `SheetMergeKey` (Arabic digits, separators,
  leading zeros, ≥8-digit policy) + `SheetMergeEngine` (main/supplemental,
  dedup, unlinked, table bounds) + `SheetMergeStore` (12h sessions/15min
  export buffers) + `SheetMergeExportBuilder` (الدمج + غير مرتبط sheets, full
  rows). Tests: `SheetMergeP53Tests` green.
- P5.4 NDJSON: `NdjsonWriter` progress/result/ready/error framing; `Merge/
  SheetMergeController` stream upload/run/export with no-store; ready→download
  with content-length. Tests: `NdjsonP54Tests` green.

## Frontend changes (the actual P5.5 gap)
- `services/misc.service.ts`: `MERGE_FIELD_KEYS/LABELS` (9 fields),
  `mergeService.inspect/sheet/run(NDJSON progress)/deleteKey/exportUrl/
  downloadExport(binary)`; `sheetMergeService.upload(XHR byte 0–49% + server
  NDJSON 50–100%)/run/prepareExport/download(content-length progress)`;
  shared `NdjsonEvent` typing. Legacy generic-join `run({keyColumn,join})`
  and single-sheet assumptions removed from callers.
- `app/(protected)/merge/page.tsx` (rewrite, UI-14): independent A/B upload
  cards (extension/50MiB/422 states, sheet selector, 6-row preview), nine
  mapping selects per side with fullName↔parts exclusivity + duplicate-column
  guard, six rule cards (static descriptions pre-run; availability/reason/
  matched pairs post-run), ربط موسع بدون شرط التأكيد toggle, NDJSON run
  progress + complete/partial status, expandable per-rule result cards
  (key/rows/values/مؤكد state), independent confirmed/all exports with mutual
  disabling + recoverable errors, reset. No visible delete-key button (V1 has
  none; API capability retained server-side).
- `app/(protected)/merge-sheets/page.tsx` (rewrite, UI-15): single-workbook
  upload with real progress, ≥2-sheet gate, first-sheet national column picker
  with suggestion/reason + ≥8-digit key warnings, supplemental checkboxes with
  hidden/linkable/reason metadata in workbook order, NDJSON run progress,
  summary + per-sheet linked/invalid/duplicate/missing/unlinked stats and
  percentages, expandable unlinked preview (reason/original/value), prepare→
  download export with dual progress, reset. State fully separate from /merge.

## Verification
- `dotnet test` → 375/375 PASS (no backend change in this packet).
- `npm run lint` → 0 errors. `npm run build` → 19 routes green (merge +
  merge-sheets compile against the new service shapes; thin hardcoded
  `keyColumn/join` callers retired).
- Remaining Phase 5 per 08: >300-unlinked-row and >50k-row no-truncation
  proofs need live ClosedXML runs on a fixture host (backend paths are
  uncapped — export takes all rows; preview cap is UI-only — but the
  >50k timing proof stays a Phase 7 performance packet, P7.4).
