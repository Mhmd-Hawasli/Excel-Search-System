-- Cell fills move from one color per row to one color per cell.

ALTER TABLE "records" DROP COLUMN "fmt_row_fill";
ALTER TABLE "records" ADD COLUMN "fmt_fills" JSONB;
