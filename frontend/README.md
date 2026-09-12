# Excel Archive — Next.js 16 UI

Pure presentation layer. It does not access the database, Prisma, Excel, files,
or business logic. All data comes from the ASP.NET backend through the typed
service layer under `src/services`.

## Run

```bash
npm install
cp .env.example .env   # set BACKEND_URL if not http://localhost:5000
npm run dev
```

All `/api/*` requests are proxied by Next.js rewrites to the backend, so the
browser only ever talks to one origin.

## Layout

- `app/` — route files only
- `features/` — feature components
- `components/` — reusable UI
- `hooks/` — data fetching / interaction hooks
- `services/` — the only place that talks to the API
- `types/` — API and domain types
