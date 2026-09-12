# Phase 2 evidence — groups/upload/files (2026-09-09)

## Backend (`dotnet test` 180/180, build 0/0)
- Excel engine (new `Infrastructure/Excel/`): ClosedXML cell reader (cached
  formulas incl. 0/false, uncached→422, rich text, hyperlinks, errors, dates,
  JS-number parity), table detection (first wins, totals excluded — probed),
  style reader (fills/theme fonts, default-skip verified on real files),
  format sidecar, durable token file store (UUID paths, 24h prune), headers
  (blank→عمود N, duplicates→422, sha256-\\u001f signature with Node vector),
  suggestions (alias+Dice≥0.58), uniqueness guard, linked join (strict V1 errors).
- P2.3 worker rewrite: atomic claim (UPDATE..WHERE pending), durable file input,
  config re-validation, table-aware source rowIndex, imported/processed semantics,
  V1-exact shadows (raw values, truthy n_/d_ rules, Arabic functional parser),
  fixed quality labels, bounded batches + tracking, failure cleanup + truthful
  FAILED, UPPERCASE statuses. SaveTemplate: 2–120 validation, create-only, 409.
- P2.4: stage-then-promote replacement (same keeps id/version, different bumps
  version; temp activity cleaned; failure keeps old data), full remap
  (ownership/dup/category checks, global sort orders, shadow+quality rebuild,
  updatedRecords, activity), mapping GET snake keys + visibility, check-name
  400/409/500, replace route (409 structure, temp name, inherited mapping).
- P2.5/2.6 reads: file detail (counters + mapping + badge-gated edits),
  stored-quality endpoint (7 UPPER_SNAKE types), categories/options selector
  read, templates list endpoint.
- P2.6 export: TableStyleLight9, real dates, source colors, edited-header
  highlight, fitted widths, history sheet, RTL views (OpenXML post-pass).
- Fixes found live: job-payload casing (worker rejected PascalCase), DTO
  Mode/ColumnSignature defaults, Kestrel/form caps bypassed for code-owned
  413/250MB, audit timestamps got DB defaults (new migration
  AuditTimestampDefaults — raw-SQL inserts failed without them).
- Real bugs found by tests: activity singular already Phase 1; duplicate
  functional index removed (Delta migration).

## Frontend (`tsc` pass, eslint clean on touched files, `next build` 19 routes incl. new mapping-edit)
- Ported: button/badge/alert-dialog/progress/textarea/flash/file-card/
  empty-state/date-format/normalization/standard-fields/workbook-selector/
  category-selector/polling-hook(1200ms+toasts); adapted mutation flow.
- Rewrote: dashboard, groups, group detail, file detail, quality, update +
  mapping wizards, 5-step upload wizard + page, edit route (19th page).
- Services unwrap envelopes into V1 shapes; binary/NDJSON readers kept for
  export/streaming routes.

## Live proof (fixture :5433, then cleaned to admin-only 0/0/0; all stopped)
- Journey A (10): X02 table bounds/totals/offset, X03b dup 422, X04 cached
  zeros, X07 empty/invalid/oversize-413-Arabic.
- Journey B (12): X01 import DONE → dashboard 1/1/3 → 7-type quality →
  template + dup-409 → remap swap (updatedRecords=3, quality rebuilt).
- Journey C (18): X06 dup/orphan/invalid 422s, linked import DONE with joined
  values, same-replace (keeps id), uncached-formula failure → FAILED + old
  data identical, export 200 with history sheet + disposition.
- Journey D (12): history original→current, X05 red-fill round-trip + dates,
  different-replace version 2, pages / /groups /upload /login 200.
- Fixtures: V2/test-artifacts/fixtures/X*.xlsx (+X12/X05 exports).

## Deferred (rightful owners, not blockers)
- Phase 3: search/fuzzy/record reads/edits UI; per-record related-files.
- Phase 5: merge engines rebuilt on the new Excel layer (MergeService
  temporarily adapted, not reimplemented).
- Phase 6: duplicate username → 500; full restore flow; users/categories
  management completion; 250MB live transfer (headers/config ready).
- Phase 7: pixel sweep; 500k-scale perf; ClosedXML DOM memory vs V1
  streaming (bounded batches cover DB side; workbook DOM is the known cost).
- Precision drift on pre-existing DBs (timestamptz(6) vs (3)) stays accepted;
  Migrate-switch stays Phase 7/8 ops.
