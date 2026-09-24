@AGENTS.md

# Frontend agent operating contract (V2)

All frontend work follows the root `AGENTS.md` rules. The following
constraints are restated for frontend-only sessions.

## 1) Environment Configuration

- Use only the development Docker configuration in `@/docker-compose.dev.yml`
  (project `v2-exp`). All development, testing, and verification must run
  against that compose environment.
- Frontend dev/test ports: `http://localhost:3300` (container `3000`),
  backend API: `http://localhost:5005` (container `5000`).
- Never run a bare `docker compose ...` command without
  `-f docker-compose.dev.yml -p v2-exp`; it targets the production
  environment.

## 2) System Integrity

- The production/system Docker environment (`docker-compose.yml`,
  containers `excel-archive-2-*`, port `5432`) is **frozen**.
  Do not start, stop, restart, build, exec, log, inspect, or otherwise
  interact with it unless explicitly instructed.
- Do not run `pg_dump`, `pg_restore`, `psql`, or any read/write command
  against the system database.
- Accounts `mhmd` and `admin` are out of scope entirely. Only the `test`
  account (`test` / `test123`) may be used for experiments.

## 3) Data Synchronization

- The dev database (`localhost:5434`, volume `excel_archive_exp_data`)
  must be a formal, immutable backup/snapshot of the system database.
  Snapshots are created only by an authorized operator, never by AI agents.
- AI agents are forbidden to run any snapshot/restore/psql command against
  the system environment. The system environment must remain Up and untouched
  at all times.
- Before any data-dependent development or testing, the dev database must be
  re-initialized from that approved snapshot. If no approved snapshot is
  available, only seed/generated data tests are permitted and are considered
  non-representative; do not fabricate synchronization from the live system.
- Restore targets only the dev volume `excel_archive_exp_data`. Never
  restore, overwrite, or delete the production volume
  `v2_excel_archive_2_data` or any system container.
- All snapshot/restore operations run exclusively through the dev Docker:
  `docker compose -f docker-compose.dev.yml -p v2-exp ...`

## 4) Workflow & Testing

- For every modification or addition, run all necessary tests exclusively
  within the development Docker environment.
- Never stop or interrupt the system Docker environment during this process.
- After every change, rebuild and verify in dev Docker:
  `docker compose -f docker-compose.dev.yml -p v2-exp up -d --build`
  then check `docker compose -f docker-compose.dev.yml -p v2-exp ps`,
  `docker compose -f docker-compose.dev.yml -p v2-exp logs`,
  and the live endpoints `http://localhost:3300` and
  `http://localhost:5005/health/ready`.