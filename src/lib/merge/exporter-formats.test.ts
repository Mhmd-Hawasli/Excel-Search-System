import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { exportMergeWorkbook } from "@/lib/merge/exporter";
import { MERGE_SHEET_NAMES, type MergeRow } from "@/lib/merge/types";
import type { RowFormats } from "@/lib/excel/cell-style";

function row(
  cells: string[],
  formats?: RowFormats,
  key: string | null = null,
): MergeRow {
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

describe("exportMergeWorkbook cell formats", () => {
  it("reapplies row fills and per-half font colors on every sheet", async () => {
    const buffer = await exportMergeWorkbook(
      {
        headers: ["name", "id"],
        rows: [
          row(["n1", "1"], { fills: { "0": "FFFF0000", "1": "FFFF0000" }, fonts: { "1": "FF0000FF" } }, "0001"),
          row(["n2", "2"], { fills: {}, fonts: {} }),
        ],
      },
      {
        headers: ["name", "id"],
        rows: [
          row(["n1", "1"], { fills: { "0": "FF00FF00", "1": "FF00FF00" }, fonts: { "0": "FFFFFF00" } }, "0001"),
          row(["n9", "9"]),
        ],
      },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const full = workbook.getWorksheet(MERGE_SHEET_NAMES[0])!;
    // Paired row: each half keeps its own fill; fonts keep their halves.
    expect(fillOf(full.getCell("A2"))).toBeUndefined();
    expect(fillOf(full.getCell("B2"))).toBe("FFFF0000");
    expect(fillOf(full.getCell("D2"))).toBe("FF00FF00");
    expect(fontOf(full.getCell("C2"))).toBe("FF0000FF");
    expect(fontOf(full.getCell("D2"))).toBe("FFFFFF00");
    // Unlinked rows keep only their own colors.
    expect(fillOf(full.getCell("B3"))).toBeUndefined();
    expect(fillOf(full.getCell("D4"))).toBeUndefined();
    // Single-table sheets mirror their own side (offset by the key column).
    const tableA = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!;
    expect(fillOf(tableA.getCell("B2"))).toBe("FFFF0000");
    expect(fontOf(tableA.getCell("C2"))).toBe("FF0000FF");
    const tableB = workbook.getWorksheet(MERGE_SHEET_NAMES[2])!;
    expect(fillOf(tableB.getCell("B2"))).toBe("FF00FF00");
    expect(fontOf(tableB.getCell("B2"))).toBe("FFFFFF00");
    // Every exported cell draws all borders.
    expect(borderOf(full.getCell("A1"))).toEqual(["thin", "thin", "thin", "thin"]);
    expect(borderOf(full.getCell("E2"))).toEqual(["thin", "thin", "thin", "thin"]);
    expect(borderOf(tableA.getCell("B3"))).toEqual(["thin", "thin", "thin", "thin"]);
  });
});
