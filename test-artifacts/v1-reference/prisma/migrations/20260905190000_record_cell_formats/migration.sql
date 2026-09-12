-- Cell formatting preserved from the source workbook:
-- one row-wide fill color plus one font color per cell.

ALTER TABLE "records" ADD COLUMN "fmt_row_fill" TEXT;
ALTER TABLE "records" ADD COLUMN "fmt_font_colors" JSONB;
