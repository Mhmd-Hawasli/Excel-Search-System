# Excel Archive — ASP.NET 10 Web API

EF Core Code-First backend that owns all data, auth, authorization, files, and
business logic. The frontend never talks to PostgreSQL.

## Run

```bash
dotnet restore
dotnet run --project ExcelArchive.Api --urls http://0.0.0.0:5000
```

> The database is created on first boot by `DbSeeder` (`EnsureCreated` +
> search/cache SQL); three EF migrations exist in
> `ExcelArchive.Infrastructure/Migrations` but the runtime still boots via
> `EnsureCreated`, **not** `Migrate()` — so do **not** run
> `dotnet ef database update` on a live database. Design-time tooling:
> `ExcelArchive.Api/AppDbContextFactory.cs`; e.g.
> `dotnet tool run dotnet-ef migrations script --project ExcelArchive.Infrastructure --startup-project ExcelArchive.Api`
> (review only, isolated environment).

## Configuration

- `ConnectionStrings:Default` or `DATABASE_URL`
- `SESSION_SECRET` (>= 32 chars; in non-Development builds it is required)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — created on first startup by the seeder
- `AllowedOrigins` — CORS origins for the Next.js frontend

## Layout (Mandoob-style layered architecture)

- `ExcelArchive.Api/` — HTTP only: `Controllers/`, `Middlewares/`, `Common/` (context, authorization, HTTP),
  `AppDbContextFactory.cs`, and `Program.cs` (the single composition root: DbContext, repositories,
  `IUnitOfWork`, security/storage/cache/excel adapters, application services, background worker).
- `ExcelArchive.Application/` — use cases: `Services/` (incl. `UploadJobProcessor`, `ScopedArchiveQuery`,
  `ColumnOrderService`), `DTOs/<Feature>Dto/`, `Interfaces/` (`Services/`, `Repositories/`, `Storage/`,
  `Security/`, `Excel/`, `Caching/`, `IUnitOfWork`), `Common/` (`Result`, `ApiResponse`, `Conflicts/`, `Backup/`, `Context/`).
- `ExcelArchive.Domain/` — `Entities/`, `Enums/`, `Common/`, `Text/`, `Conflicts/`, `Merge/`, `SheetMerge/`,
  `Records/` (shadow/quality rules), `Repositories/` (`IRepositoryBase`).
- `ExcelArchive.Infrastructure/` — `Implementations/` (`Persistence/` incl. `Sql/` + `UnitOfWork`,
  `Repositories/`, `Security/`, `Storage/`, `Excel/`, `Caching/`, `BackgroundServices/`, `HealthChecks/`),
  `Migrations/`, `GlobalUsings.cs`. No `DependencyInjection.cs`: composition lives in API.
- `tests/ExcelArchive.Foundation.Tests/` — unit/behavior/HTTP/storage/integration/performance tests.

Dependency direction: `Api → {Application, Infrastructure} → Domain`; `Infrastructure → Application`.
Controllers consume Application contracts only (plus domain value types); no EF/Npgsql/ClosedXML in
`Application`; no `DbContext` in controllers. SQL sources live in
`ExcelArchive.Infrastructure/Implementations/Persistence/Sql/` and are linked into both API and
Infrastructure outputs as `Data/*.sql`.
