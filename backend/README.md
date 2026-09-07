# Excel Archive — ASP.NET 10 Web API

EF Core Code-First backend that owns all data, auth, authorization, files, and
business logic. The frontend never talks to PostgreSQL.

## Run

```bash
dotnet restore
dotnet ef database update
dotnet run --urls http://0.0.0.0:5000
```

## Configuration

- `ConnectionStrings:Default` or `DATABASE_URL`
- `SESSION_SECRET` (>= 32 chars; in non-Development builds it is required)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — created on first startup by the seeder
- `AllowedOrigins` — CORS origins for the Next.js frontend

## Layout

- `Controllers/` — REST endpoints
- `Services/` — business logic (auth, users, groups, files, search, etc.)
- `Repositories/` — data-access abstractions
- `Models/Entities` — EF Code-First entities matching the old Prisma schema
- `Data/` — `AppDbContext`, enum converters, SQL search indexes
- `Middleware/` — auth, request logging, global exceptions
- `DTOs/` — transport contracts shared with the frontend
