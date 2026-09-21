-- V2 performance indexes (idempotent). Kept separate from SearchIndexes.sql
-- so the V1 parity suite (exactly 14 definitions) stays untouched.
-- Verified missing via pg_indexes against production-shaped data.

-- 1) Record page related/conflict lookups filter NFullName equality
--    (+ NMotherName): full sequential scans without a btree.
--    Composite covers bare (n_full_name) prefix queries too.
CREATE INDEX IF NOT EXISTS records_person_lookup_idx ON records (n_full_name, n_mother_name);

-- 2) Activity feed filters by action with newest-first ordering.
CREATE INDEX IF NOT EXISTS ix_activity_log_action_created_at ON activity_log (action, created_at DESC);
