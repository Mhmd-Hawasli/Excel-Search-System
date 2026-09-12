import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { exportMergeWorkbook } from "@/lib/merge/exporter";
import { MERGE_SHEET_NAMES, type MergeRow } from "@/lib/merge/types";
import type { RowFormats } from "@/lib/excel/cell-style";

function row(cells: string[], formats?: RowFormats, key: string | null = null): MergeRow {
  return {
    rowNumber: 2,
    cells,
    formats,
    key,
    rule: key ? "full_name" : null,
    confirmed: key !== null,
  };
}

function fillOf(cell: ExcelJS.Cell) {
  return (cell.fill as { fgColor?: { argb?: string } }).fgColor?.argb;
}

function fontOf(cell: ExcelJS.Cell) {
  return (cell.font as { color?: { argb?: string } } | undefined)?.color?.argb;
}

function borderOf(cell: ExcelJS.Cell) {
  const border = (cell.border ?? {}) as Record<string, { style?: string } | undefined>;
  return [border.top?.style, border.left?.style, border.bottom?.style, border.right?.style];
}

describe("exportMergeWorkbook source formats", () => {
  it.each(["confirmed", "all"] as const)(
    "ignores source fills and fonts in %s scope (structural styling only)",
    async (scope) => {
      const buffer = await exportMergeWorkbook(
        {
          headers: ["name", "id"],
          rows: [
            row(
              ["n1", "1"],
              { fills: { "0": "FFFF0000", "1": "FFFF0000" }, fonts: { "1": "FF0000FF" } },
              "0001",
            ),
            row(["n2", "2"], { fills: {}, fonts: {} }),
          ],
        },
        {
          headers: ["name", "id"],
          rows: [
            row(
              ["n1", "1"],
              { fills: { "0": "FF00FF00", "1": "FF00FF00" }, fonts: { "0": "FFFFFF00" } },
              "0001",
            ),
            row(["n9", "9"]),
          ],
        },
        scope,
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const full = workbook.getWorksheet(MERGE_SHEET_NAMES[0])!;
      const dataColumn = scope === "all" ? 3 : 2;
      // No source colors anywhere in the data area.
      expect(fillOf(full.getCell(2, dataColumn))).toBeUndefined();
      expect(fontOf(full.getCell(2, dataColumn + 1))).toBeUndefined();
      const tableA = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!;
      expect(fillOf(tableA.getCell(2, dataColumn))).toBeUndefined();
      expect(fontOf(tableA.getCell(2, dataColumn + 1))).toBeUndefined();
      // Structural styling (header + all borders) still applies.
      expect(workbook.worksheets.every((sheet) => sheet.getRow(1).font.bold)).toBe(true);
      expect(borderOf(full.getCell("A1"))).toEqual(["thin", "thin", "thin", "thin"]);
    },
  );
});
