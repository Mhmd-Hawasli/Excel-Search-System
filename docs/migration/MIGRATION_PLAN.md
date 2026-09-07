# Excel Search System — Backend/Frontend Split Migration Plan

This document is the single source of truth for the refactor of the existing
Next.js + Prisma monolith into:

```
/backend   → ASP.NET 10 Web API (data + business logic + auth + file storage)
/frontend  → Next.js 16 (pure presentation, API-driven)
```

It is updated as the migration proceeds. Work is done on branch
`arena/01a07c39-excel-search-system`.

---

## 1. Existing project analysis

### 1.1 Current stack and footprint

| Area | What exists today |
|---|---|
| Runtime | Next.js `16.3.4`, React `19.2.8`, Node `>=20` |
| ORM/DB | Prisma `7.x` + PostgreSQL 16 (`@prisma/adapter-pg`) |
| Auth | Cookie-based JWT (HS256, `jose`), password hashing with Node `scrypt` |
| Data model | 16 Prisma models, 4 enums |
| API layer | 30 Next.js Route Handlers under `src/app/api` |
| Server actions | 3 files (`groups`, `files`, `categories`) |
| Domain services | ~50 TypeScript modules under `src/lib` |
| UI | Server Components + shadcn/ui, RTL Arabic |
| Tests | Vitest + Testing Library, 40+ suites |

### 1.2 Key domain capabilities to preserve

1. **Authentication / RBAC** — cookie sessions, scoped permissions
   (`groups.view`, `groups.viewScoped`, users/backup/merge/export/edit/upload/
   conflicts/categories permissions), authorization that returns 404 for hidden
   resources.
2. **Groups / Files / Categories** — CRUD, ordering, column mapping, quality
   reports, file replacement/update wizard.
3. **Excel import** — `.xlsx`/`.xls` inspection, multi-sheet linking by national
   ID, standard-field mapping, streaming single-sheet import, background upload
   jobs with progress polling.
4. **Search** — Arabic normalization (hamza, ta marbuta, alef maqsura, Arabic
   digits), fuzzy (trigram) and exact matching, standard-field filters,
   scoped-to-user, full-text plan/sort.
5. **Conflicts** — 31 data-quality/consistency rules, cache, ignore rows,
   export to `.xlsx`.
6. **Edits** — record edit history, revert, per-cell fills/font colors,
   modified-file badge, export modified workbook.
7. **Merge** — merge multiple files by national ID / name, preview, session
   storage, export.
8. **Sheet merge** — independent in-memory merge of sheets in one workbook,
   export download. Previously read/wrote no DB or disk.
9. **Backup/Restore** — full JSON backup of the archive; restore replaces the
   archive and logs activity.
10. **Activity log** — every meaningful mutation writes an `activity_log` row.

### 1.3 Target (decoupled) architecture

```
┌────────────── root ──────────────┐
│  backend/     ASP.NET 10 Web API │
│  frontend/    Next.js 16 UI      │
│  docs/        spec + migration   │
│  docker-compose.yml              │
└──────────────────────────────────┘
```

- Backend owns PostgreSQL, files, auth, authorization, validation, business
  logic, logging, and Excel/merge/backup work.
- Frontend owns rendering and communicates only through the API client layer.
- Frontend never imports Prisma, never queries the database, never contains
  business rules, and never writes files to a backend-accessible location.

---

## 2. Target backend structure (`backend`)

```
backend/
├── ExcelArchive.Api.sln
├── src/
│   └── ExcelArchive.Api/
│       ├── ExcelArchive.Api.csproj
│       ├── Program.cs
│       ├── appsettings.json
│       ├── appsettings.Development.json
│       ├── Controllers/
│       │   ├── AuthController.cs
│       │   ├── UsersController.cs
│       │   ├── GroupsController.cs
│       │   ├── FilesController.cs
│       │   ├── CategoriesController.cs
│       │   ├── SearchController.cs
│       │   ├── ConflictsController.cs
│       │   ├── EditsController.cs
│       │   ├── ActivityController.cs
│       │   ├── BackupController.cs
│       │   ├── UploadJobsController.cs
│       │   ├── WorkbooksController.cs
│       │   ├── RecordsController.cs
│       │   ├── MergeController.cs
│       │   └── SheetMergeController.cs
│       ├── Data/
│       │   ├── AppDbContext.cs
│       │   ├── DbSeeder.cs
│       │   └── SearchIndexes.sql
│       ├── DTOs/
│       │   ├── Common/
│       │   │   ├── ApiResponse.cs
│       │   │   ├── PageResult.cs
│       │   │   └── ApiError.cs
│       │   ├── Auth/
│       │   ├── Users/
│       │   ├── Groups/
│       │   ├── Files/
│       │   ├── Categories/
│       │   ├── Search/
│       │   ├── Conflicts/
│       │   ├── Edits/
│       │   ├── Activity/
│       │   ├── Backup/
│       │   ├── Upload/
│       │   ├── Merge/
│       │   └── SheetMerge/
│       ├── Middleware/
│       │   ├── AuthMiddleware.cs
│       │   ├── ExceptionHandlingMiddleware.cs
│       │   └── RequestLoggingMiddleware.cs
│       ├── Models/
│       │   ├── Entities/
│       │   │   ├── Group.cs
│       │   │   ├── File.cs
│       │   │   ├── Category.cs
│       │   │   ├── FileColumn.cs
│       │   │   ├── Record.cs
│       │   │   ├── UploadJob.cs
│       │   │   ├── DataQualityIssue.cs
│       │   │   ├── ActivityLog.cs
│       │   │   ├── RecordEdit.cs
│       │   │   ├── MappingTemplate.cs
│       │   │   ├── IgnoredConflict.cs
│       │   │   ├── ConflictCacheState.cs
│       │   │   ├── ConflictQueryCache.cs
│       │   │   ├── User.cs
│       │   │   └── UserPermission.cs
│       │   └── Enums/
│       │       ├── StandardField.cs
│       │       ├── UploadJobStatus.cs
│       │       ├── DataQualityIssueType.cs
│       │       └── ActivityAction.cs
│       ├── Repositories/
│       │   ├── IRepository.cs
│       │   ├── RepositoryBase.cs
│       │   ├── UserRepository.cs
│       │   ├── GroupRepository.cs
│       │   ├── FileRepository.cs
│       │   ├── RecordRepository.cs
│       │   ├── SearchRepository.cs
│       │   ├── ActivityLogRepository.cs
│       │   └── UploadJobRepository.cs
│       ├── Services/
│       │   ├── Abstractions/
│       │   │   ├── IAuthService.cs
│       │   │   ├── IUserService.cs
│       │   │   ├── IGroupService.cs
│       │   │   ├── IFileService.cs
│       │   │   ├── ICategoryService.cs
│       │   │   ├── ISearchService.cs
│       │   │   ├── IConflictService.cs
│       │   │   ├── IEditsService.cs
│       │   │   ├── IActivityService.cs
│       │   │   ├── IBackupService.cs
│       │   │   ├── IUploadService.cs
│       │   │   ├── IMergeService.cs
│       │   │   └── ISheetMergeService.cs
│       │   ├── AuthService.cs
│       │   ├── UserService.cs
│       │   ├── GroupService.cs
│       │   ├── FileService.cs
│       │   ├── CategoryService.cs
│       │   ├── SearchService.cs
│       │   ├── ConflictService.cs
│       │   ├── EditsService.cs
│       │   ├── ActivityService.cs
│       │   ├── BackupService.cs
│       │   ├── UploadService.cs
│       │   ├── MergeService.cs
│       │   ├── SheetMergeService.cs
│       │   └── Smart/                       (ported domain logic, one module per feature)
│       │       ├── ArabicNormalization.cs
│       │       ├── FuzzySearch.cs
│       │       ├── ConflictCatalog.cs
│       │       ├── ConflictQueryEngine.cs
│       │       ├── EditsEngine.cs
│       │       ├── ExcelWorkbook.cs
│       │       ├── ExcelImportWorker.cs
│       │       ├── ExcelReplacementWorker.cs
│       │       ├── ExcelExport.cs
│       │       ├── MergeRules.cs
│       │       ├── SheetMergeRules.cs
│       │       └── BackupSchema.cs
│       └── Storage/
│           └── FileStorageService.cs
```

## 3. Target frontend structure (`frontend`)

```
frontend/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── globals.css
    │   ├── not-found.tsx
    │   ├── global-error.tsx
    │   ├── (auth)/
    │   │   └── login/page.tsx
    │   ├── (protected)/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx                (dashboard)
    │   │   ├── error.tsx
    │   │   ├── loading.tsx
    │   │   ├── groups/
    │   │   ├── search/
    │   │   ├── conflicts/
    │   │   ├── edits/
    │   │   ├── logs/
    │   │   ├── records/[id]/
    │   │   ├── upload/
    │   │   ├── merge/
    │   │   ├── merge-sheets/
    │   │   └── settings/{categories,users,backup}/
    │   └── api/route.ts                 (optional thin proxy; no business logic)
    ├── components/
    │   ├── app-shell.tsx
    │   ├── empty-state.tsx
    │   ├── file-card.tsx
    │   ├── mutation-form.tsx
    │   ├── pager.tsx
    │   ├── page-header.tsx
    │   ├── select-field.tsx
    │   ├── sort-icon.tsx
    │   ├── theme-*.tsx
    │   ├── ui/*.tsx
    │   └── feedback/ (error/loading/skeleton)
    ├── features/
    │   ├── auth/
    │   ├── dashboard/
    │   ├── groups/
    │   ├── files/
    │   ├── search/
    │   ├── conflicts/
    │   ├── edits/
    │   ├── records/
    │   ├── upload/
    │   ├── merge/
    │   ├── sheet-merge/
    │   ├── categories/
    │   ├── users/
    │   └── backup/
    ├── hooks/
    │   ├── use-api-query.ts
    │   ├── use-api-mutation.ts
    │   ├── use-upload-job-polling.ts
    │   ├── use-debounced-value.ts
    │   └── use-mounted.ts
    ├── services/
    │   ├── api-client.ts
    │   ├── auth.service.ts
    │   ├── groups.service.ts
    │   ├── files.service.ts
    │   ├── search.service.ts
    │   ├── conflicts.service.ts
    │   ├── edits.service.ts
    │   ├── users.service.ts
    │   ├── activity.service.ts
    │   ├── backup.service.ts
    │   ├── upload.service.ts
    │   ├── merge.service.ts
    │   └── sheet-merge.service.ts
    ├── types/
    │   ├── api.ts
    │   ├── model.ts
    │   └── domain.ts
    ├── lib/
    │   ├── cn.ts
    │   └── (format-only helpers, no DB/business logic)
    └── utils/
        ├── query-params.ts
        └── search-params.ts
```

## 4. Endpoint mapping (Next.js route → ASP.NET controller)

| Existing route | New ASP.NET endpoint |
|---|---|
| `POST /api/auth/login` | `POST /api/auth/login` |
| `POST /api/auth/logout` | `POST /api/auth/logout` |
| `GET /api/backup/export` | `GET /api/backup/export` |
| `POST /api/backup/restore` | `POST /api/backup/restore` |
| `GET /api/conflicts` | `GET /api/conflicts` |
| `GET /api/conflicts/export` | `GET /api/conflicts/export` |
| `POST /api/conflicts/ignore` | `POST /api/conflicts/ignore` |
| `GET /api/edits` | `GET /api/edits` |
| `GET /api/files/check-name` | `POST /api/files/check-name` |
| `GET /api/files/{id}/export` | `GET /api/files/{id}/export` |
| `GET|POST /api/files/{id}/mapping` | `GET|POST /api/files/{id}/mapping` |
| `POST /api/files/{id}/replace` | `POST /api/files/{id}/replace` |
| `GET|POST /api/merge/...` | `GET|POST /api/merge/...` |
| `GET|POST /api/records/{id}/...` | `GET|POST /api/records/{id}/...` |
| `GET /api/search` | `GET /api/search` |
| `GET|POST /api/sheet-merge/...` | `GET|POST /api/sheet-merge/...` |
| `GET|POST /api/upload-jobs...` | `GET|POST /api/upload-jobs...` |
| `GET|POST /api/users...` | `GET|POST /api/users...` |
| `GET|POST /api/workbooks/...` | `GET|POST /api/workbooks/...` |

## 5. Migration progress

### 5.1 Backend — done / in progress
- [x] Target structure defined
- [x] EF Core entities for all Prisma models
- [x] EF Core `AppDbContext` + configuration (same table/column names + enum strings)
- [x] Response standardization + middleware + DI setup
- [x] Cookie JWT auth service/auth middleware
- [x] Repository + service abstractions
- [x] `AuthController`, `UsersController`, `GroupsController`, `FilesController`,
      `CategoriesController`, `SearchController`, `ConflictsController`,
      `EditsController`, `ActivityController`, `BackupController`, `UploadJobsController`,
      `RecordsController`, `WorkbooksController`, `MergeController`, `SheetMergeController`
- [ ] Full parity for Excel import/link/replace workers, the 31-rule conflict engine,
      merge/sheet-merge, backup schema — being ported as domain services.
- [x] `WorkbooksController.sheet`/`linked`, `MergeController`, `SheetMergeController`,
      and `FilesController.replace` are API-shaped stubs today and are the next
      files to be ported to full implementations (tracked below).

### 5.2 Frontend — done / in progress
- [x] Target structure defined
- [x] API client + typed service layer (`services/*`)
- [x] Minimal shared UI components (button, card, input, label, skeleton, header, empty-state)
- [x] API-driven login, dashboard, groups, group detail, search, records,
      conflicts, edits, upload, settings/users
- [ ] Remaining feature pages migrated to API-driven hooks
      (file update wizard, file mapping/quality, categories/backup UI, merge,
      sheet-merge, logs) — route placeholders currently exist for categories
      and backup.
- [ ] Remove all Prisma/server-action/business-logic imports — the old monolith
      is still independently present at the repository root as the migration
      reference and will be removed only after feature parity is confirmed.

## 6. How to run when complete

```bash
# Postgres
docker compose up -d

# Backend
cd backend/src/ExcelArchive.Api
dotnet restore
dotnet ef database update
dotnet run --urls http://0.0.0.0:5000

# Frontend
cd frontend
npm install
npm run dev
```
