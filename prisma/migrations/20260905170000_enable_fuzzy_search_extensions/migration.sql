-- Fuzzy Arabic-name search needs trigram similarity (already used by the
-- search indexes) and Levenshtein distance with a one/two-letter budget per
-- token (used by the full-name fuzzy predicate in lib/search/query.ts).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
