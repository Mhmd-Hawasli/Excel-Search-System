# Phase 4 re-verification — docs re-read + test gate (2026-09-09)

Request: `read doc folder ; check and test phase 4 and update status`.
No application code changed in this session; verification + docs only.

## Docs re-read
00, 08 (Phase 4 = P4.1–P4.6), 03 (gaps G-CONFLICT, G-CONFLICT-IGNORE,
G-CACHE, G-CONFLICT-EXPORT), 09 (C001–C063, CACHE01–05),
12 + phase4-p41.md, phase4-p42.md. Plan unchanged: no packet redefinition needed.

## Workspace state (this session)
- V1 working tree: `git status` clean — untouched (read-only boundary holds).
- V2 working tree: pre-existing restructuring modifications only; no new
  application edits in this session.
- Fixture DB services `pgsql-phase1-fixture` + `postgresql-x64-17` both
  Running during verification; P4.2 live jsonb test passed, confirming :5433.

## Test results (this session)
- `dotnet build Api` → 0 errors, 0 warnings (incremental; P4.2 recorded
  4 pre-existing warnings on a full rebuild — none introduced since).
- Phase-4 subset (`FullyQualifiedName~Conflict`) → **46/46 PASS**:
  4 catalog (58 keys, 11/9/2/36, 22 directed pairs, SelectedRules) +
  17 request (defaults invalid/all/all/1/25/issueNumber/asc, illegal combos,
  page/pageSize/sort bounds) + 24 P4.2 engine/service/live (7 invalid groups,
  9 missing theory, 2 similar, 5 service incl. V1 shape/pageCount, similar
  groupKey/dense-rank, conflicting-empty + empty-scope, ignore hides only
  that rule; 1 live :5433 jsonb smoke) + 1 ConflictCache SQL covers 5 tables.
- Full backend suite → **258/258 PASS** (36 s), no regressions.
- `npm run build` frontend → 19 routes green, typecheck clean.

## Per-packet verdict vs 08 exit criteria
- P4.1 (catalog + validated request/result/group/sort; manifest): PASS —
  21/21 + SQL cache-table test green; no drift since P4.2.
- P4.2 (invalid11/missing9/similar2 + positive/negative fixtures; retire
  legacy rows): PASS — 24/24 green incl. live jsonb; no abbreviated
  identifiers remain in the list path.
- P4.3 (conflicting14 + directed22, person/contract distinction): OPEN —
  source-confirmed: `ConflictService` returns an empty V1-shape page for
  category conflicting; covered by Service_ConflictingEmptyUntilP43.
- P4.4 (rule+record ignore validation/scope + persistent revision cache):
  OPEN — source-confirmed: ignore is per-pair filter only (no known-rule
  400 / hidden-404 scope check); no IMemoryCache or persistent query cache
  in the Conflicts path (cache tables/triggers exist via SQL, unwired).
- P4.5 (full >200-row export + UI-13): OPEN — source-confirmed: export is
  interim 8-column ClosedXML capped at 20k (not V1 12-column); frontend
  `conflict-report.tsx` still reads legacy `recordId/rule/description`
  keys, not `issues[]`; no category/field/rule selectors, stats, or pager.
- P4.6 (58-rule suite, 20-mutation cache scenario, misses, rollover): OPEN.

## Phase exit (08)
NOT met: `58/58 rule keys covered` (22/58 implemented; conflicting36
empty), `filtered/restricted exports agree with list semantics` (interim
export), `no stale cache after writes` (no query cache wired yet).
Phase 4 stays IN_PROGRESS. G-CONFLICT (partial: invalid/missing/similar
halves verified), G-CONFLICT-IGNORE, G-CACHE, G-CONFLICT-EXPORT remain open.
