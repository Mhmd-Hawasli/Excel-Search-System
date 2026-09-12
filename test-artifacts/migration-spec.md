# Full-system migration specification (P6.4) — archive + accounts transfer

Status: rehearsal artifact proven in-suite 2026-09-09
(`MigrationPhase6Tests`: archive restore + accounts import, preserved IDs,
login-compatible hashes, resolvable scopes). Production cutover requires the
concrete deployment/data authorization in docs/10; V1 stays read-only and is
never modified or decommissioned by this plan.

## Why two artifacts

The V1 archive backup (`schemaVersion`/`exportedAt`/`application`/`data`,
ten arrays) deliberately omits user accounts, permission grants and ignored
conflicts (docs/07.9). Ordinary archive restore therefore:

- replaces the ten archive tables transactionally, preserving current user
  accounts (password hashes untouched, login still works);
- drops scoped permission grants and ignored conflicts through the same
  CASCADE semantics as V1's group deleteMany (accounts keep global grants).

The separate protected accounts transfer carries the rest:

- `excel-archive-accounts-*.json`: `schemaVersion: 1`, `exportedAt`,
  `application: "excel-archive-search-accounts"`, `data` with `users`
  (including compatible scrypt/PBKDF2 password hashes — never reset),
  `userPermissions` (explicit grants with source IDs) and `ignoredConflicts`.
- Endpoints: `GET /api/backup/migration-export` (backup.export),
  `POST /api/backup/migration-import` with a `.json` file (backup.restore).
  Import is additive and idempotent for grants/ignores; colliding user IDs or
  usernames are rejected 409 with the account named — never merged or
  overwritten. Dangling group/file/record references are rejected 422 before
  any write; the import is all-or-nothing.

## Rehearsal procedure (disposable target)

1. Snapshot the source database (read-only replica/snapshot; record snapshot
   time, row counts per table, `MAX(updated_at)` watermarks).
2. Freeze source writes at the operational level for the transfer window.
3. `GET /api/backup/export` → archive JSON; `GET /api/backup/migration-export`
   → accounts JSON. Store both under `V2/private migration artifacts`
   (never in chat, docs or the repo).
4. On a disposable target: `POST /api/backup/restore` (confirmation
   `استعادة`) → expect `{groups, files, records}` counts matching source.
5. `POST /api/backup/migration-import` → expect `{users, userPermissions,
   ignoredConflicts}` counts matching the accounts file.
6. Verify: row/key counts per table; every migrated user can log in
   (no password reset); scoped users see exactly their snapshot files
   (a file added after a grant save stays invisible); conflict ignores apply
   to the same rules+records; sample workbook exports byte-compare by
   semantics (docs/09); conflict cache rebuilds (revision bumped).
7. Rollback: keep the pre-cutover target snapshot until the retention date;
   rollback is restore-previous-snapshot, never a reverse transfer.

## Production cutover (after explicit authorization)

Announce window → freeze → transfer → verify (step 6) → monitor auth failures,
job states and cache hit rates → retain rollback snapshot per the agreed
retention. Session carryover: password verification is compatible; existing
sessions are NOT carried — users log in again (documented re-login, docs/10).
Decommissioning V1 is outside every phase's authorization.

## Accepted boundaries

- Pre-`version`/`generatedAt` V2-shape exports are not importable; only the
  V1-compatible archive shape and the accounts shape are supported.
- Cached conflict reports are derived and rebuilt, never migrated.
- Session cookies are never migrated.
