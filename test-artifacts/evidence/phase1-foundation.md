# Phase 1 foundation evidence (2026-09-08)

## Builds / checks (this session)
- Backend: `dotnet build ExcelArchive.Api/ExcelArchive.Api.csproj` — succeeded, 0 errors, 1 pre-existing warning (BackupService EF1002 interpolated SQL).
- Frontend: `npm run typecheck` (`tsc --noEmit`) — passed, 0 errors.
- Frontend lint (changed files only): `app-shell, theme-provider/toggle, auth-guard, login-form, layout, login page, protected layout, api-client, use-local-storage-flag/mounted` — 0 errors.
- Frontend lint (full `npm run lint`): 4 pre-existing errors in untouched files (`groups/[id]/files/[fileId]/page.tsx` unused `stats`; `use-upload-job-polling.ts` prefer-const; `misc.service.ts` unused `id`/`name`). Not introduced by Phase 1; left for owner packets.
- No backend/frontend test projects exist in V2 (matches docs/02: no test project found). No full test suite to run; targeted verification below instead.

## Crypto verification (temp console, not committed)
- Project: `Temp/opencode/ScryptCheck` (ScryptHelper.cs copied verbatim + 3 Node vectors).
- Node vectors (V1 `crypto.scrypt`, N=16384 r=8 p=1, salt 0011…eeff): `mhmd123`, `  spaced  `, `كلمة مرور 123` — all PASS, wrong-password differs PASS.
- Result: `dotnet run` 4/4 PASS. Proves UTF8/whitespace-preserving scrypt matches V1 byte-for-byte.
- Session signing: PBKDF2-SHA256 210k / salt `excel-archive-search/session-signing/v1` / 32-byte HMAC key — standard construction matching V1 WebCrypto params by inspection; live V1↔V2 token cross-check deferred until disposable Postgres + isolated V1 baseline exist (needs DB-backed user + cookie round-trip).

## Normalization
- Code inspection: NormalizeStored/Query, StripDefiniteArticle, DigitsOnly/NationalIdDigits fixed to V1 (`\s` strip, ASCII 0-9 only). 14 mandatory Arabic vectors listed in docs/07.3 preserved by construction; full golden suite (Q01–06) runs with Phase 3 search fixtures on disposable DB.

## Scope / permissions
- UnifyDataPermissions + HasPermission/ResolveDataScope mirror V1 session-user tests (global view, single-group, single-file incl. legacy `files.viewScoped`, group+file combo, retired search grants give no access). Live DB scope matrix (AUTH01–05/U01–05) deferred to disposable Postgres.

## Shell / login smoke
- `tsc` + changed-file lint prove shell/login compile; visual sweep at 5 widths/light-dark/collapsed/drawer (docs/06 protocol) deferred to Phase 7 with fixed fixtures/fonts. Cairo woff2 copied; globals.css already identical to V1.

## Remaining Phase 1 follow-ups (not hidden)
- Disposable Postgres: full migration create + clone-upgrade proof, EXPLAIN/catalog checks, 1200ms poll/cookie/large-upload streaming, readiness failure visibility for missing indexes/cache.
- EF Baseline migration file + switch seeder EnsureCreated→Migrate (DesignTime factory ready; `dotnet ef` not run without DB).
- V1↔V2 contract fixtures under test-artifacts/contracts (auth/scrypt, session, scope matrix).
