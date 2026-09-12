# Phase 8 — Data migration and release acceptance (evidence)

Date: 2026-09-09. Scope: docs/08 P8.1–P8.5. V1 read-only (HEAD `c8f47c2`,
tree clean); all work in V2 (HEAD `11da0d5` + additive phases).
No production authorization, host, or source data access exists here
(open inputs, docs/10). **Verdict: rehearsal complete / deployment pending —
migration is NOT marked complete.**

## Changed paths

- Tests: `tests/.../CutoverRehearsalP8Tests.cs` (new, +2).
- Artifacts: `test-artifacts/release-manifest.md` (new, P8.1/P8.3),
  `test-artifacts/evidence/phase8.md` (this file, P8.2/P8.5).
- No application-code changes in Phase 8 (nothing in Phases 1–7 required a
  migration-path code fix; the transfer endpoints were proven in P6/P8.2).

## P8.1 — Release manifest

`test-artifacts/release-manifest.md`: snapshot identities (V1 `c8f47c2`
clean / V2 `11da0d5` + work), 3 EF migrations, 15 tables, 14 indexes +
5 triggers + 2 extensions, full parity surface, runtime BOM (.NET 10 :5000,
Node 24/Next 16 :3000, PG 16), required-configuration table (secrets never
defaulted), `/health/ready` traffic gate, window template (transfer time
explicitly unmeasured — needs a real-snapshot rehearsal before promising),
verification checklist, rollback procedure, authorization record.

## P8.2 — Transfer rehearsal into a disposable target

`CutoverRehearsalP8Tests` (InMemory disposable target; a live-Postgres
rehearsal needs the fixture host — `:5433` TCP closed, unchanged):

1. `FullJourney_TransferPreservesIds_LoginSearchExportVerify` — seeds a source
   (group + file + 3 mapped columns + 1 shadowed record + owner/scoped users +
   1 ignore), exports archive + accounts, restores + imports into a fresh
   target. Asserts: summary counts `{groups:1, files:1, records:1}` /
   `{users:2}`; group/file/record UUIDs preserved; **both migrated passwords
   verify and both users receive session tokens** (no reset); search shadow
   layers byte-identical (`SfFullName`, `SfNationalId`, `DNationalId`,
   `NationalIdNum`); scoped `groups.viewScoped` grant resolves to the migrated
   file; the file workbook rebuilt from migrated rows parses with the exact
   migrated values; the ignore references the live migrated record. **PASS.**
2. `Rollback_PreCutoverSnapshotRestores_TargetKeepsLogin` — proves the
   documented rollback: snapshot target, run cutover (restore is a
   **replacement**: target holds exactly the source group), re-restore the
   pre-cutover snapshot → marker group back, migrated data gone, **pre-existing
   login still verifies** (archive restore preserves accounts). **PASS.**

Full suite after: **433/433 PASS** (431 + 2), ~15 s. Frontend unchanged since
its Phase 7 green (lint + typecheck clean, 19/19 build); no re-run needed for
a docs+tests-only phase — backend suite is the affected domain and it is green.

## P8.3/P8.4 — Authorization

Rehearsal artifacts are written (no approval needed for that). Production
cutover (P8.4) is **not authorized and not performed**: missing target host,
source snapshot access, window/freeze/retention/approver, and real-dataset
baseline (docs/10). Exact target + checklist are in the manifest §4–§5 for the
approver. Report state: **rehearsal complete / deployment pending.**

## P8.5 — Accepted differences, residuals, retention

Accepted (documented, not defects):
- Two-file merge export deliberately ignores source fills/fonts (structural
  styling only); archive/sheet-merge exports preserve source formats (docs/07).
- Pre-V1-shape V2 exports are not importable; only V1-compatible archive +
  accounts shapes are supported transfer artifacts.
- Conflict cache is derived and rebuilt, never migrated; session cookies never
  migrate (documented re-login).
- `EnsureCreated` remains the startup path; the `Migrate` switch needs the
  baselining rehearsal on a clone (deferred with cause, docs/04 + phase7.md).
- `ForwardedHeaders` clears known networks/proxies (local-dev compatible);
  production must terminate TLS at the trusted proxy and verify both schemes.

Residual (optional / environment-gated, none blocking rehearsal):
- Live-Postgres rehearsal + populated EXPLAIN/Q07 + 20-mutation/rollover +
  250 MiB live transfer + browser pixel pass + V1-vs-V2 p95 (fixture host).
- Measured transfer-time estimate for the window (needs real snapshot).
- I03/I04/I06/I08/I11/I13/I14/I20 tuning proposals (docs/10) — unmeasured,
  correctly unapplied.

Rollback retention: pre-cutover snapshot kept until agreed date (proposed 30
days, needs approver); rollback = re-restore snapshot, never reverse-transfer;
V1 preserved indefinitely until separately instructed (decommission prohibited).

## Final parity tally (docs/09 definition of done)

19/19 routes, zero placeholders/hardcoded values, 38 handlers + read-model
equivalents, 14 search fields, 58 rules, two merge engines, account migration
with compatible hashes, staged replacement + atomic restore recovery, full
control ledger (phase7.md). P0/P1 code gaps: zero. Remaining items are
production inputs + live-host proofs, not code gaps.
