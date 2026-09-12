# Phase 6 — categories, users, backup, activity (2026-09-09)

## Scope (08 P6.1–P6.6)
Full settings parity: category CRUD/up-down/grouped board/global ordering;
user CRUD/permission editor/snapshot/self-protection; V1 archive format +
transactional restore; separate accounts transfer + migration rehearsal;
activity browse gate; UI-16–19; B/U round-trips.

## Sources read (bounded)
- docs/05 A31–A38 + actions/new reads; docs/07.2/07.9; docs/06 UI-16–19;
  docs/09 B/U fixtures; docs/03 G-CATEGORIES/G-USERS/G-BACKUP/G-RESTORE/
  G-ACCOUNTS-MIGRATION/G-LOGS/G-HTTP.
- V1 `lib/actions/categories.ts` (full), `lib/categories/{config,column-order}.ts`,
  `lib/users/validation.ts`, `lib/users/file-permissions.ts`,
  `lib/backup/{schema,service}.ts`, `lib/auth/permissions.ts`, `lib/activity.ts`,
  `app/api/{users,users/[id],users/[id]/permissions,backup/restore}/route.ts`,
  `app/(protected)/{settings/categories,settings/users,settings/backup,logs}/page.tsx`,
  `features/{users/users-manager,file-access-selector,backup/backup-manager,
  activity/logs-filter,categories/category-column-board,category-selector}.tsx`.
- V2 controllers/services/DTOs for categories, users, backup, activity; frontend
  settings/logs pages and users/categories services.

## Backend changes (all additive except stated contract corrections)
- Categories (`CategoryService`, `ICategoryService`, `CategoryDtos`,
  `CategoriesController`): name 2–100 validation (400), 7-custom limit (422),
  duplicate→422 with V1 message, missing→404 "الفئة غير موجودة.",
  direction validation, boundary 422; delete reassigns columns to أخرى with
  V1 sort-order algorithm; move validates/mirrors no-op + standard/custom
  success messages; NEW `POST categories/column-groups/reorder` (global
  standard-column ordering) and NEW `GET categories/board` (server-computed
  group keys/labels incl. file IDs). FIXED pre-existing no-op bug: reorder
  swap assigned each row onto itself, so up/down never changed anything.
- Users (`UserService`, `UserDtos`, `UsersController`, `ApiControllerBase`):
  username 3–64/password 6–200/display ≤120 validation (400, V1 messages),
  duplicate→409 via new `ConflictException` (also fixes the Phase-2-carryover
  dup-username 500), unknown/scope-combo permission validation (400, V1
  messages), dangling targets 422, group/all snapshot into explicit file
  grants (V1 `resolveFileAssignments`, incl. new-file-after-save test), PATCH
  presence semantics via JsonElement parsing (absent display/active untouched,
  explicit null clears display, blank password preserved by omission),
  missing→404 "غير موجود."; self-disable/delete/permission guards already
  matched V1 strings and are now covered by controller tests.
- Backup (`BackupService`, `IBackupService`, `BackupController`): export now
  emits the V1 envelope (`schemaVersion`/`exportedAt`/`application`/
  ten-array `data`, bigint JSON strings, UPPER_SNAKE enums, explicit DTO
  projections — never raw EF entities); restore validates the complete
  envelope + every row + FK references + duplicate IDs + 7-category cap
  BEFORE any write, applies historical national/category/job/org recomputes
  and national-quality rebuild, fails nonterminal jobs with the V1 message,
  replaces archive tables only (users survive; scoped grants/ignores reconcile
  via V1 cascade semantics, made explicit for all providers), invalidates the
  conflict cache, logs BACKUP_RESTORED and returns `{groups, files, records}`.
  `RequestFormLimits(260MiB)` added so the 250MiB V1 check (not framework
  defaults) produces the 413 (resolves the P1.6 P6.3 item).
- Migration transfer (P6.4): NEW `ExportAccountsAsync`/`ImportAccountsAsync`
  + `GET /api/backup/migration-export` + `POST /api/backup/migration-import`
  (additive, idempotent grants/ignores, 409 on colliding accounts, 422 on
  dangling archive references, all-or-nothing). Spec + rehearsal procedure in
  `V2/test-artifacts/migration-spec.md`.
- Activity (P6.5): data endpoint now requires `activity.browse` (hidden 404;
  `activity.view` keeps the page shell), unknown action filters fall back to
  all rows (V1 `ACTION_KEYS`), page size cap raised to the V1 latest-500.

## Frontend changes
- Verbatim V1 ports (byte-exact Arabic/labels): `lib/permission-catalog.ts`,
  `lib/users/file-permissions.ts`, `lib/activity.ts` (prisma type replaced),
  `features/users/file-access-selector.tsx`,
  `features/backup/backup-manager.tsx`; adapted ports: `features/users/
  users-manager.tsx` (transport → cookie `fetch` + envelope unwrap only),
  `features/categories/category-column-board.tsx` (server actions → JSON
  service calls + `onChanged` refresh).
- New/rewritten: `services/categories.service.ts` (CRUD/board/move/
  reorder-groups), `services/users.service.ts` (CRUD/permissions),
  `services/activity.service.ts`, `features/categories/categories-manager.tsx`
  + `settings/categories` page (UI-16: limit badge, rename, up/down,
  typed delete, dnd board, read-only chips), `settings/users` page (UI-18
  data wiring: users, group/file tree, catalog, rights, self id),
  `settings/backup` page (UI-17 rights wiring), `logs` page + `features/
  activity/logs-filter.tsx` (UI-19: URL action filter, 500 rows, badges,
  visit links/details, relative time, browse notice).
- Removed stale `categoriesService`/`activityService` stubs from
  `services/misc.service.ts`.

## Verification
- `dotnet build` → 0 errors. Full suite → **428/428 PASS** (was 375; +12
  `CategoryPhase6Tests` incl. a caught reorder no-op bug, +16
  `UserPhase6Tests` incl. snapshot-then-new-file, +10 `BackupPhase6Tests`
  incl. users-survive + malformed-untouched, +4 `MigrationPhase6Tests`
  rehearsal, +5 `ActivityPhase6Tests`, +5 `UserControllerPhase6Tests`
  self-guards). Live tests skip gracefully (no fixture host here).
- Frontend `npm run lint` → 0 errors; `npm run build` → 19 routes green.
- Deferred (no fixture/live host here, same standing note as phases 1–5):
  populated-restore timing, 250MiB live transfer, live-browser pass over
  UI-16–19 (Phase 7 P7.1/P7.2). No plan (08) changes.
