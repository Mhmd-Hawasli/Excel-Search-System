ALTER TYPE "activity_action" ADD VALUE IF NOT EXISTS 'column_reordered';
ALTER TYPE "activity_action" ADD VALUE IF NOT EXISTS 'column_recategorized';

ALTER TABLE "file_columns" ADD COLUMN "sort_order" INTEGER;

WITH ranked_columns AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "category_id"
      ORDER BY "created_at" ASC, "column_index" ASC, id ASC
    ) - 1 AS weight
  FROM "file_columns"
)
UPDATE "file_columns" AS target
SET "sort_order" = ranked_columns.weight
FROM ranked_columns
WHERE target.id = ranked_columns.id;

ALTER TABLE "file_columns"
  ALTER COLUMN "sort_order" SET DEFAULT 0,
  ALTER COLUMN "sort_order" SET NOT NULL,
  ADD CONSTRAINT "file_columns_sort_order_nonnegative_check" CHECK ("sort_order" >= 0);

CREATE INDEX "file_columns_category_id_sort_order_idx"
ON "file_columns" ("category_id", "sort_order");
