# P2.1 evidence — scoped groups/dashboard/detail (2026-09-09)

## Backend (`dotnet test` 99/99 PASS, was 86)
- New `GET /api/dashboard` (DashboardController + DashboardService): scoped
  group/file/record counts, latest 5 visible files (group, rows/columns, version,
  date, edited badge only with edits.badge). Any authenticated user; sections gated
  client-side from /api/auth/me like V1.
- GroupService rewritten: scope-filtered list/get (counts intersect scope — no
  hidden-file leak), GetDetailAsync (group + uploadedAt-desc files + column counts +
  badge-gated hasEdits), V1 validation/messages (name 2–120, desc ≤500, duplicate,
  reorder boundary, confirm mismatch, missing group), unique-race catch (23505),
  group+activity atomic via relational-guarded transactions, unscoped list cache
  removed (scope-unsafe).
- GroupsController: reads open to signed-in users (V1 groups page has no view gate;
  invisible → hidden 404); mutations stay behind global groups.view. Found live that
  scoped users got 404 on list → fixed + covered by updated controller test.
- New tests: GroupsTests (validation matrix, reorder/delete incl. cascade counts,
  scoped list/get/detail + badge gating), DashboardTests (global/scoped/empty scope,
  recent-5 order, 401 branch).

## Frontend (`tsc` pass, Phase-2 eslint pass)
- Ported verbatim: button (cva+Slot), badge, alert-dialog, flash-message, file-card,
  empty-state (now with action), lib/format/date.ts.
- New/adapted: lib/mutation.ts + mutation-form + typed-delete-button (HTTP toast flow;
  documented onSuccess addition replacing revalidatePath), lib/permissions.ts
  (client mirror of V1 session-user checks).
- Rewrote dashboard (stats, recent files, quick actions, backup card, search
  guidance, empty state), groups list (create card, badges, up/down, inline edit,
  typed delete), group detail (file cards, upload link, flash, empty state).
  Removed invented refetch button. One Phase-6 caller fixed for required description.
- Deps added: @radix-ui/react-alert-dialog, @radix-ui/react-slot.

## Live proof (fixture :5433 + backend :5000 + frontend :3000, then all stopped/parked)
- Groups CRUD: create 201, duplicate 422 (V1 message), short-name 400 (V1 message),
  update 200, single-group reorder-up 422 (V1 boundary message), wrong confirm 422
  (malformed id 400 by framework binding — understood, V1 form always posts real id),
  delete 200, dashboard 1/0/0 → 0/0/0 after delete.
- Scoped user (file-scoped grant): dashboard 1/0/0, groups list 1 row, create → 404
  hidden. No all-data leak.
- Pages / /groups /groups/[id] serve 200; /login markup: RTL/Cairo/contract intact;
  unauthenticated / renders guard text only (no flash).
- Fixture DB cleaned to admin-only (0/0/0). Known Phase-6 gap observed, not fixed:
  duplicate username → 500 (no dup handling in Users flow). Found for later phases:
  poll default 1500ms vs V1 1200ms (P2.3), restore lacks endpoint size limits for
  true 250MB (P6.3).
