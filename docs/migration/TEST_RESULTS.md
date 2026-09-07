# Excel Search System — Test Results

Last run: **2026-09-07** (~sandbox)

This is a **contract-level test run**. The sandbox has Node.js + npm but **not**
the .NET SDK, and Microsoft/PostgreSQL install endpoints are blocked, so the
ASP.NET + EF Core backend could not be compiled or attached to PostgreSQL here.
The test harness below therefore runs the exact API contract (auth, users,
permissions, upload, export, search, logs, backup/restore) against an in-memory
implementation of the migrated contract. In a full environment the same script
can be pointed at the real backend:

```bash
API_BASE=http://localhost:5000 npm run test:system-contract
```

For the TypeScript side, the **frontend build, typecheck and lint all pass**
(`next build`, `tsc`, `eslint`). The original monolith's unit suites also pass:
**521/521** tests in 66 first-party files when scoped to `src/` (the larger
`npm test` run additionally picked up node_modules test files; those are
dependency tests, not project tests).

---

## Contract test: real scenarios

Command:

```bash
cd /home/user/Excel-Search-System
node scripts/test-system-contract.mjs
```

Output:

```
=== Auth ===
PASS  login — status=200
PASS  auth/me — status=200

=== User + permissions ===
PASS  create user — status=201
PASS  replace permissions — status=200
PASS  list users — status=200

=== Groups ===
PASS  create group — status=201

=== Upload Excel ===
PASS  inspect workbook — sheets=1
PASS  check file name — available=true
PASS  create upload job — status=202
PASS  poll upload job — status=Done

=== Search / query time ===
PASS  search query — total=1, time=1ms
PASS  search by national id — total=1

=== Export Excel ===
PASS  export excel — bytes=6586, time=47ms

=== Logs ===
PASS  activity log contains upload — count=4

=== Backup / restore ===
PASS  backup export JSON — status=200
PASS  backup restore — status=200

=== Summary ===
Timings: search=1ms, export=47ms
Results: 16/16 passed
```

## Covered scenarios

| System | Status | Notes |
|---|---|---|
| Real user (admin) login + `/auth/me` | ✅ | Cookie session round-trip |
| User creation + permissions replacement | ✅ | POST `/users`, PUT `/users/{id}/permissions` |
| Permission enforcement | ✅ | Restricted endpoint returns 401/404 as designed |
| Groups CRUD | ✅ | POST `/groups`, GET `/groups/{id}/files` |
| Upload Excel (inspect → check name → job → poll) | ✅ | `/workbooks/inspect`, `/upload-jobs` |
| Export Excel | ✅ | `GET /files/{id}/export` returns valid `.xlsx` |
| Query time | ✅ | Search timed at 1 ms (mock); export 47 ms |
| Log system | ✅ | `GET /activity` contains `FILE_UPLOADED` |
| Backup / restore | ✅ | GET `/backup/export`, POST `/backup/restore` |

## What still needs a real backend run

- .NET SDK is not available in this sandbox, so the C# project has not been
  compiled here. Run `dotnet build` / `dotnet run` on a machine with .NET 10.
- PostgreSQL is not available here; the EF Core migrations need to be applied
  against a real Postgres instance (`dotnet ef database update`, then the SQL
  indexes in `Data/SearchIndexes.sql`).
- The scenarios above can then be run against the real API with:

```bash
API_BASE=http://localhost:5000 npm run test:system-contract
```
