WITH logical_groups AS (
  SELECT
    "category_id",
    CASE
      WHEN "standard_field" IS NOT NULL THEN 'standard:' || "standard_field"::TEXT
      ELSE 'column:' || id::TEXT
    END AS group_key,
    MIN("sort_order") AS previous_weight
  FROM "file_columns"
  GROUP BY "category_id", group_key
), ranked_groups AS (
  SELECT
    "category_id",
    group_key,
    ROW_NUMBER() OVER (
      PARTITION BY "category_id"
      ORDER BY previous_weight ASC, group_key ASC
    ) - 1 AS unified_weight
  FROM logical_groups
)
UPDATE "file_columns" AS target
SET "sort_order" = ranked_groups.unified_weight
FROM ranked_groups
WHERE target."category_id" IS NOT DISTINCT FROM ranked_groups."category_id"
  AND (
    CASE
      WHEN target."standard_field" IS NOT NULL THEN 'standard:' || target."standard_field"::TEXT
      ELSE 'column:' || target.id::TEXT
    END
  ) = ranked_groups.group_key;
