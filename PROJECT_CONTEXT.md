# PROJECT_CONTEXT

> Update 2026-09-02 (linked sheets): upload and replacement now share `components/workbook-sheet-selector.tsx`, offering a single sheet or any selected supplemental sheets joined to the first worksheet. The primary national-ID column is selectable; supplemental keys must be in column 1. `/api/workbooks/linked` and the importer reuse `lib/excel/linked-sheets.ts`; numeric normalization joins padded/Arabic IDs, while duplicates, invalid supplemental keys and orphan rows produce sheet/row errors. Merged columns flow through normal mapping, categories, preview, quality, search and details; duplicate headers get a source-sheet suffix. Optional `UploadConfig.linkedSheets` is stored in job JSON; no schema migration is needed. `npm run test:linked-import` exercises the live API with a uniquely named group and cleans it up. The original single-sheet architecture notes below are historical where superseded by this update.

> Update 2026-09-02 (national IDs): `sf_national_id` is now BIGINT, with original Excel text retained in `records.data`. `lib/format/national-id.ts` unifies numeric conversion, integrity and display. Count numeric digits before left padding: 9–11 valid, <=8 or >=12 invalid. Whitespace and Arabic/Persian digits normalize; other characters remain invalid. Search, conflicts and detail views show at least 11 digits (`123456789` → `00123456789`) without truncating oversized values. `national_id_num` links valid IDs only; `d_national_id` remains the indexed display/search text. Migration `20260902140000_national_id_bigint` backfills existing records and rebuilds national quality findings. Backup schema version 1 remains compatible and normalizes old backups before restoration. `npm run test:national-id-migration` tests the migration using temporary tables.

> Onboarding + visual map for this repository. Written 2026-09-01 from a read-only study pass, a full route-by-route screenshot sweep, and a light smoke test.
> Purpose: any future session should be able to read this file, understand the project, and match a screenshot the user sends to the right route and source files.

> Update 2026-09-02: a new **تضارب البيانات** section is available at `/conflicts`, powered by `components/conflicts-interface.tsx`, `app/api/conflicts/route.ts`, and `lib/conflicts/{catalog,request,query}.ts`. Four categories contain 31 filterable rules; source/file/record links and server pagination share a single table. The read-only report validates original values, compares mapped full names with first + father + last (confirmed by the user), and defines a person as normalized full name + mother name. The query covers all completed files, including Excel date/title columns, without relying on old import quality issues. `npm run test:conflicts` verifies all rules in PostgreSQL temporary tables without modifying the archive. The original study below is a historical snapshot; see the latest PROGRESS entry for current verification.

---

## 1. Project overview

| | |
|---|---|
| **Name** | `excel-archive-search` — «نظام أرشفة والبحث في ملفات الإكسل» (Excel Archive & Search System) |
| **What it does** | Internal Arabic tool that imports variable-column Excel workbooks (HR-style person data) into PostgreSQL, keeps every original cell value untouched, and lets an admin search people across all files by name / national ID / phone / any standard field. |
| **Who it's for** | A single administrator on a local PC or LAN server. No multi-user accounts, no roles, no registration — one admin from env vars. |
| **UI language** | 100% Arabic, `lang="ar" dir="rtl"`, Cairo font, light + dark themes. Displayed digits are Latin 0–9. |
| **Deployment target** | Local machine / local server only. Not cloud-deployable by design (needs PostgreSQL over TCP + local temp files for Excel streaming). |

### Core idea (why the schema looks the way it does)

1. Columns differ per file → each row is stored as **JSONB** (`records.data`) plus a per-file **column definition** table (`file_columns`).
2. Eleven **standard fields** are mapped per file at upload time and copied into flat `sf_*` columns so they are searchable.
3. Arabic search is fuzzy in a controlled way: original values are never modified; **normalized shadow columns** (`n_*` for text, `d_*` for digits) are written alongside and indexed with **`pg_trgm` GIN** indexes (11 of them).
4. `national_id_num` (BIGINT) links the *same person* across different files — this powers "ملفات أخرى لهذا الشخص" on the record page.

### Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15.5.24 App Router, React 19, TypeScript 5.9 **strict** (no `any` in app code) |
| Server logic | Route Handlers + Server Actions only — no separate backend service |
| DB | PostgreSQL 16+ (currently a **local PostgreSQL 17.5 Windows service**, not Docker), Prisma 6.19 ORM + raw parameterized SQL for search |
| Excel | ExcelJS 4.4 only, streaming reader, every cell read as **text** (protects leading zeros / long IDs) |
| UI | Tailwind 3.4 + shadcn-style primitives (Radix), TanStack Table 8, lucide-react, next-themes, sonner |
| Validation / auth | Zod 3.25, `jose` signed HMAC session cookie |
| Tests | Vitest 3.2 (`fileParallelism: false` — ExcelJS uses process-wide temp cleanup) |

### Architecture / data flow

```
browser → /api/workbooks/inspect      (sheets, headers, preview; file saved to tmp/uploads/<uuid>.xlsx)
       → upload wizard collects mapping (standard fields + categories)
       → POST /api/upload-jobs        (creates upload_jobs row, starts in-process worker)
       → lib/excel/import-worker.ts   (streams the chosen sheet, normalizes, inserts in ~1000-row batches)
       → GET /api/upload-jobs/[id]    (wizard polls persisted progress; safe to navigate away)
search → GET /api/search → lib/search/plan.ts (classify numeric vs text) → lib/search/query.ts (raw SQL over n_*/d_* trigram indexes)
detail → app/(protected)/records/[id] reads ONLY original sf_*/data values; related people found via national_id_num
```

### Repo layout

| Path | Contents |
|---|---|
| `app/(auth)/login/` | Arabic sign-in page |
| `app/(protected)/` | Everything behind the session gate; `layout.tsx` wraps children in `AppShell` |
| `app/api/` | auth, workbook inspection, upload jobs, search, file replace, backup export/restore |
| `components/` | `app-shell`, `search-interface`, `upload-wizard`, `file-update-wizard`, `record-details`, `backup-manager`, `typed-delete-button`, + `components/ui/*` primitives |
| `lib/normalization/arabic.ts` | The normalization contract (hamza, ta marbuta, alef maqsura, tatweel, عبد rule, Arabic-Indic digits, `ال` stripping on queries only) |
| `lib/excel/` | `workbook` (temp storage/inspect), `streaming` (archive-order-safe worksheet pick), `import-worker`, `replacement-worker`, `mapping`, `standard-fields`, `config` |
| `lib/search/` | `fields` (whitelist), `plan` (query classification), `query` (raw SQL, rank, pagination) |
| `lib/actions/` | Server Actions: `groups`, `categories`, `files` |
| `lib/backup/` | Versioned full-JSON export + transactional replace-all restore |
| `prisma/` | `schema.prisma`, migrations (pg_trgm + 11 GIN indexes), `search-indexes.sql` (idempotent), `seed.ts` |
| `middleware.ts` | Protects every page and `/api/*` except `/login` and `/api/auth/login` |
| `PLAN.md` / `PROGRESS.md` | Canonical spec (§2 is the full requirement text) and the build/decision log |

### Setup & commands

```bash
cp .env.example .env        # then set SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
docker compose up -d        # OR use a local PostgreSQL 16+ (what this machine actually does)
npm install
npm run db:push             # prisma db push + prisma/search-indexes.sql (pg_trgm + 11 GIN indexes)
npm run db:seed             # optional Arabic sample data
npm run dev                 # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / production server |
| `npm test` / `test:watch` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Schema push **plus** idempotent trigram index SQL |
| `npm run db:migrate` | `prisma migrate deploy` (preferred for a stable server) |
| `npm run db:seed` | Arabic seed data (2 groups, 2 files, 4 records, cross-file person link) |

**Env vars** (`.env`, gitignored): `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_NAME`. Defaults `admin` / `admin123` are documented as **development-only**.

---

## 2. Pages, routes & features

### Pages (all Arabic, all behind the session gate except `/login`)

| Route | Arabic name | Source | One-liner |
|---|---|---|---|
| `/login` | تسجيل الدخول | `app/(auth)/login/page.tsx` + `components/login-form.tsx` | Single-admin sign-in; posts to `/api/auth/login`, honours `?next=`. |
| `/` | الرئيسية | `app/(protected)/page.tsx` | Dashboard: hero search box, counts (groups/files/records), 5 most recent files. |
| `/search` | البحث | `app/(protected)/search/page.tsx` + `components/search-interface.tsx` | Debounced search with «البحث الكامل» / «البحث المخصص» tabs, group scope, TanStack results table, highlighting, matched-field badge, pagination. |
| `/groups` | المجموعات | `app/(protected)/groups/page.tsx` + `lib/actions/groups.ts` | Group CRUD, up/down reordering, file & record counts, typed-name cascade delete. |
| `/groups/[id]` | تفاصيل المجموعة | `app/(protected)/groups/[id]/page.tsx` | Files in the group with version badge, row/column counts, upload date, and فتح / الجودة / تحديث actions. |
| `/groups/[id]/files/[fileId]` | تفاصيل الملف | `app/(protected)/groups/[id]/files/[fileId]/page.tsx` + `lib/actions/files.ts` | File overview: 4 stat cards, full column map (Excel header → standard field → category), and the exact-count typed **delete**. |
| `/groups/[id]/files/[fileId]/quality` | تقرير الجودة | `.../quality/page.tsx` | Permanent per-file data-quality report: 5 issue counters + per-row detail table. |
| `/groups/[id]/files/[fileId]/update` | تحديث الملف | `.../update/page.tsx` + `components/file-update-wizard.tsx` | Re-upload: same structure → destructive refresh; different structure → normalized diff, remap, versioned replacement. |
| `/upload` | رفع ملف | `app/(protected)/upload/page.tsx` + `components/upload-wizard.tsx` | 5-step wizard: الملف والورقة → هوية الملف → حقول البحث → فئات الأعمدة → المعاينة والتأكيد, then background import with polled progress. |
| `/records/[id]` | تفاصيل السجل | `app/(protected)/records/[id]/page.tsx` + `components/record-details.tsx` | Person record: header (name, national ID, source file), category tabs of **original** values with copy buttons, and «ملفات أخرى لهذا الشخص». |
| `/settings/categories` | فئات البيانات | `app/(protected)/settings/categories/page.tsx` + `lib/actions/categories.ts` | Category CRUD + ordering; delete moves columns to «أخرى» (SetNull), shows affected column/file counts. |
| `/settings/backup` | النسخ الاحتياطي والاستعادة | `app/(protected)/settings/backup/page.tsx` + `components/backup-manager.tsx` | Download full JSON backup; restore requires typing «استعادة» and replaces everything. |
| `/logs` | سجل النشاط | `app/(protected)/logs/page.tsx` + `lib/activity.ts` | Reverse-chronological activity log (last 500): action badge, target, date, relative Arabic time. |
| any unknown | الصفحة غير موجودة | `app/not-found.tsx` | Global 404. Route-level `not-found.tsx` exists for groups and records. |

Also: `app/(protected)/error.tsx` (per-page error boundary), `app/global-error.tsx` (app-level crash screen), and `loading.tsx` skeletons for `/`, `/groups`, `/logs`, `/records/[id]`, `/search`, `/settings/*`, `/upload`.

### API routes

| Endpoint | Method | Source | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | `app/api/auth/login/route.ts` | Timing-safe credential check → signed `excel_archive_session` cookie (httpOnly, sameSite=lax, secure in prod, 12h). |
| `/api/auth/logout` | POST | `app/api/auth/logout/route.ts` | Clears the session (header logout button posts here). |
| `/api/workbooks/inspect` | POST | `app/api/workbooks/inspect/route.ts` | Saves upload to `tmp/uploads/<uuid>.xlsx`, returns sheet names. |
| `/api/workbooks/sheet` | POST | `app/api/workbooks/sheet/route.ts` | Headers + 20-row preview + signature for the chosen sheet. |
| `/api/upload-jobs` | POST | `app/api/upload-jobs/route.ts` | Validates config, creates the job row, starts the in-process import worker. |
| `/api/upload-jobs/[id]` | GET | `app/api/upload-jobs/[id]/route.ts` | Persisted job progress (survives navigating away). |
| `/api/upload-jobs/[id]/template` | POST | `.../template/route.ts` | Saves the mapping as a reusable `mapping_templates` row for the group. |
| `/api/search` | GET | `app/api/search/route.ts` | `q, mode(full\|custom), field, groupId, page, pageSize(10–100)` → ranked, paginated rows. |
| `/api/files/[id]/replace` | POST | `app/api/files/[id]/replace/route.ts` | Server-validated same/different-structure replacement job. |
| `/api/backup/export` | GET | `app/api/backup/export/route.ts` | Full JSON backup download. |
| `/api/backup/restore` | POST | `app/api/backup/restore/route.ts` | Schema/version-validated transactional replace-all restore. |

### Domain rules worth remembering

- **Eleven standard fields**: `first_name, father_name, last_name, full_name, national_id, sham_cash, personal_no, mother_name, phone, contract_code, secondary_contract_code`. Any subset may be left «غير مربوط». `contract_code` is labeled «رمز العقد الأساسي» and `secondary_contract_code` is labeled «رمز العقد الثانوي».
- **Search semantics**: text = all query tokens must match (AND) as substrings of the normalized value; numeric = digits-only substring (`555` matches `123555123`). Ranking: exact → prefix → substring.
- **National ID** stored three ways: original `sf_national_id`, digits-only padded to 11 `d_national_id` (displayed/searched), `national_id_num` BIGINT (or NULL if empty / >11 digits) for cross-file linking.
- **Quality issues**: `missing_national_id`, `invalid_national_id`, `duplicate_national_id`, `invalid_phone` (valid = 7–15 digits), `empty_row`.
- **Import safety**: batch inserts of ~1000 rows; failure deletes the partial file/records — never a half import. Replacement imports into a temp file row and is promoted in one transaction only after success.
- **`.xls` (legacy BIFF)** is not readable by ExcelJS — the app returns an Arabic "convert to .xlsx" message.

---

## 3. Screenshot index

All images in `docs/screenshots/`, captured 2026-09-01 against `npm run dev` at `http://localhost:3000` with the current local database (3 groups, 6 files, 15,411 records). Desktop shots are 1440px wide, full-page.

| Screenshot | Route / state | Source file(s) | What's shown |
|---|---|---|---|
| `login.png` | `/login` (logged out) | `app/(auth)/login/page.tsx`, `components/login-form.tsx` | Centered card: «مرحبًا بك في أرشيف الإكسل», username + password, green sign-in button. |
| `login-invalid-credentials.png` | `/login` after a wrong password | same as above | Red inline alert «اسم المستخدم أو كلمة المرور غير صحيحة.» |
| `dashboard-home.png` | `/` (light) | `app/(protected)/page.tsx` | Hero search band, three stat cards (3 / 6 / 15,411), «أحدث الملفات المرفوعة» list. |
| `dashboard-home-dark.png` | `/` (dark theme) | same + `components/theme-provider.tsx` | Identical layout on the dark palette — use to confirm token/contrast issues. |
| `dashboard-home-mobile.png` | `/` at 390×844 | same + `components/app-shell.tsx` | Mobile RTL layout: stacked cards, horizontally scrollable nav row under the header. |
| `search-empty.png` | `/search`, no query | `components/search-interface.tsx` | Tabs «البحث الكامل / البحث المخصص», scope select «جميع الملفات», empty prompt «ابدأ بكتابة عبارة البحث». |
| `search-results-national-id.png` | `/search?q=12345678901` | `components/search-interface.tsx`, `lib/search/query.ts` | 2 results across two different files (same person), yellow highlight + «الرقم الوطني» match badge, pagination. |
| `search-no-results.png` | `/search?q=زززززز` | same | Empty-result state «لم نعثر على نتائج مطابقة». |
| `groups-list.png` | `/groups` | `app/(protected)/groups/page.tsx` | «مجموعة جديدة» form + 3 group cards with file/record badges, فتح / up / down / حذف. |
| `group-detail.png` | `/groups/[id]` (ملفات العقود) | `app/(protected)/groups/[id]/page.tsx` | 3 file cards with «الإصدار 1» badge, row/column counts, upload timestamp, فتح / الجودة / تحديث. |
| `file-detail.png` | `/groups/[id]/files/[fileId]` (عقود تجريبية) | `.../files/[fileId]/page.tsx` | Stat cards (2 records / 6 columns / 0 issues / upload date) and the column map table with standard-field + category chips; حذف / تحديث الملف / تقرير الجودة actions. |
| `file-quality-report.png` | `.../quality` (E2E file) | `.../quality/page.tsx` | Five issue counters and the per-row issue table (row, type, column, original value). |
| `file-update-wizard.png` | `.../update` (step 1) | `components/file-update-wizard.tsx` | «اختر المصنف الجديد» file picker + «فحص الملف» before any replacement is allowed. |
| `upload-wizard-step1.png` | `/upload` (step 1) | `components/upload-wizard.tsx` | The five-step tab strip and step 1: group select + Excel file + «فحص». |
| `record-detail.png` | `/records/[id]` | `app/(protected)/records/[id]/page.tsx`, `components/record-details.tsx` | Person header with national-ID and source badges, category tabs («البيانات الذاتية» / «بيانات العمل»), copyable original values, «ملفات أخرى لهذا الشخص» with 1 linked record. |
| `settings-categories.png` | `/settings/categories` | `app/(protected)/settings/categories/page.tsx` | «فئة جديدة» form + 2 category rows with column/file counts, rename, reorder, حذف. |
| `settings-backup.png` | `/settings/backup` | `components/backup-manager.tsx` | Two panels: «تنزيل نسخة كاملة» and the red-bordered «استعادة نسخة» requiring the typed word «استعادة». |
| `logs-activity.png` | `/logs` | `app/(protected)/logs/page.tsx` | Activity table: action badge, target, absolute date, Arabic relative time. |
| `not-found.png` | `/this-route-does-not-exist` | `app/not-found.tsx` | «الصفحة غير موجودة» with a return-home button. |

**Fast screenshot → code lookup:** the persistent header with «الرئيسية / البحث / المجموعات / رفع ملف / الفئات / النسخ الاحتياطي / سجل النشاط» is `components/app-shell.tsx`; every page title block («eyebrow + h1 + description») is `components/page-header.tsx`; dashed empty-state boxes are `components/empty-state.tsx`; red typed-confirmation delete buttons are `components/typed-delete-button.tsx`.

---

## 4. Smoke test results

Environment: Node 24.12.0, npm 11.19.0, Windows 10 Pro, local PostgreSQL on `:5432` (Docker Desktop is **not** running — the app uses the local Postgres service). Not a git repository.

| Check | Result | Detail |
|---|---|---|
| `npm run build` | ✅ pass | Compiled in 6.5s, 13/13 static pages generated, all 13 page routes + 11 API routes + middleware emitted. No errors, no warnings. |
| `npm run typecheck` | ✅ pass | `tsc --noEmit` clean under strict mode. |
| `npm test` | ✅ pass | 36/36 tests in 7 files (arabic normalization 19, standard-fields 7, search plan 4, date 3, streaming 1, config 1, mapping 1). |
| `npm run dev` boot | ✅ pass | «Ready in 8.9s», no crash, no red output. Entire session log contains **zero** error/warning lines. |
| DB connectivity | ✅ pass | 3 groups, 6 files, 15,411 records, 2 categories, 7,129 quality issues, 6 upload jobs, 1 mapping template, 9 activity entries. |
| Auth gate | ✅ pass | Unauthenticated requests to every protected route redirect to `/login?next=…`. Valid credentials → 200 + session cookie; wrong password → 401 + Arabic inline error. |
| 19 route/state renders | ✅ pass | Every page returned HTTP 200 (404 only for the deliberately missing route) with real content — no blank screens, no broken layout, RTL correct in light, dark and mobile. |
| Browser console | ✅ clean | No JS exceptions and no console error/warning on any page. The only two console entries in the whole sweep are the expected HTTP status logs: 404 on `/this-route-does-not-exist` and 401 on the deliberate bad-login attempt. |
| Server request log | ✅ clean | All page and `/api/search` requests 200; search responses 34–79 ms against 15k records. |

### Not covered by this pass (deliberately)

- No real `.xlsx` upload was performed (the wizard was only opened at step 1) — the import worker, progress polling, template saving and the replacement flow were **not** re-executed. `PROGRESS.md` records a full production E2E of those flows on 2026-09-01.
- No backup download or restore was triggered.
- No mutation of any group/category/file was performed.

### Things that look off (logged, not fixed)

| # | Observation | Where | Notes |
|---|---|---|---|
| 1 | Native file inputs render English browser text «Choose File / No file chosen» inside an otherwise fully-Arabic UI. | `/upload` step 1, `.../update`, `/settings/backup` | Cosmetic localization gap; the browser controls the label unless a custom file-input wrapper is added. |
| 2 | `docs/screenshots/` now contains screenshots taken against the **live database**. | `docs/screenshots/` | Queries were chosen to hit seeded/synthetic rows only, but file names and dashboard counts of real imported files are visible. The repo is not under git today; if it ever is, consider ignoring this folder. |
| 3 | `tmp/uploads/` holds 8 leftover `.xlsx` files from earlier import runs. | `tmp/uploads/` | Gitignored. Expected to be cleaned by the worker after success/failure — worth confirming whether these are orphans from interrupted runs. |
| 4 | The dev server log shows a search for «شاكر» that this pass did not issue. | dev server log | Someone/something else had `localhost:3000` open during the sweep. Harmless, but noted so it isn't mistaken for a bug. |
| 5 | File **delete** lives on the file-detail page, not on the group-detail file cards. | `group-detail.png` vs `file-detail.png` | `PLAN.md` §2.10 lists open/update/quality/delete on `/groups/[id]`; the delete action is one click deeper. Possibly intentional. |

---

## 5. Open questions for a human

1. **Real data on this machine** — `دمج كامل أساسي` (8,185 rows) and `وزارة - تنقيب وانتاج` (7,210 rows) look like real personnel data, and there are 7,129 recorded quality issues across the archive. Is this a production dataset that must be treated as sensitive (backups, screenshots, logs), or a working copy?
2. **Version control** — the project is not a git repository despite having a `.gitignore`. Is that deliberate, or should it be initialized?
3. **Quality-issue volume** — 7,129 issues against 15,411 records is high. Is that expected for the source files (missing/short national IDs), or does it point at a mapping problem in one of the two large imports?
4. **Docker vs local Postgres** — `README.md`/`docker-compose.yml` present Docker as the primary path, but the machine actually runs a local PostgreSQL service. Should the README's default path be flipped so a future session doesn't start Docker unnecessarily?
5. **Security before LAN exposure** — `.env` still uses `admin` / `admin123`. `PLAN.md` and `README.md` both flag this; confirm it must change before the app is reachable from the network.
6. **Orphaned temp workbooks** — should `tmp/uploads/` be pruned on boot, given jobs do not auto-resume after a Node restart?

---

## 6. Notes for future sessions

- `PLAN.md` §2 is the **normative specification** (Arabic). If behaviour is in question, that text wins over inference from code.
- `PROGRESS.md` is the running build/decision log, including the ExcelJS archive-order defect and its fix, the inverted standard-field mapping UI, and the date-formatting work.
- The normalization contract in `lib/normalization/arabic.ts` has 14 mandatory bidirectional test cases in `PLAN.md` §2.4 — changing normalization means changing indexes and re-importing, so treat it as frozen.
- To reproduce this screenshot sweep: start `npm run dev`, sign in as the admin, and visit the routes in the table above (deep-link IDs change per database).
- Regenerate a smoke check quickly with: `npm test && npm run typecheck && npm run build`.
