import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { exportSheetMergeWorkbook } from "@/lib/sheet-merge/exporter";
import { buildSheetMerge } from "@/lib/sheet-merge/merge";
import type { UploadedWorkbook } from "@/lib/sheet-merge/types";

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

function fixture(): UploadedWorkbook {
  return {
    id: "upload-1",
    createdAt: Date.now(),
    originalFilename: "workbook.xlsx",
    sheets: [
      {
        name: "main",
        hidden: false,
        headers: ["name", "nationalId"],
        rows: [
          {
            rowNumber: 2,
            cells: ["n1", "123456789"],
            formats: { fills: { "0": "FFFF0000", "1": "FFFF0000" }, fonts: { "0": "FF0000FF" } },
          },
          { rowNumber: 3, cells: ["n2", "222222222"] },
        ],
        filtersRemoved: false,
      },
      {
        name: "extra",
        hidden: false,
        headers: ["nationalId", "city"],
        rows: [
          {
            rowNumber: 2,
            cells: ["123456789", "damascus"],
            formats: { fills: { "1": "FF00FF00" }, fonts: { "1": "FFFFFF00" } },
          },
          {
            rowNumber: 3,
            cells: ["999999999", "nowhere"],
            formats: { fills: { "0": "FF0000FF", "1": "FF0000FF" }, fonts: {} },
          },
        ],
        filtersRemoved: false,
      },
    ],
  };
}

describe("exportSheetMergeWorkbook cell formats", () => {
  it("reapplies main fills and joined font colors on the merged sheet", async () => {
    const built = buildSheetMerge(fixture(), { nationalIdColumn: 1, sheetNames: ["extra"] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportSheetMergeWorkbook(built)) as unknown as ArrayBuffer);
    const merged = workbook.worksheets[0];
    // Main row fill covers the main columns; the joined cell keeps its own fill.
    expect(fillOf(merged.getCell("A2"))).toBe("FFFF0000");
    expect(fillOf(merged.getCell("B2"))).toBe("FFFF0000");
    expect(fillOf(merged.getCell("C2"))).toBe("FF00FF00");
    expect(fontOf(merged.getCell("A2"))).toBe("FF0000FF");
    // Joined font color lands on the linked column (offset past main headers).
    expect(fontOf(merged.getCell("C2"))).toBe("FFFFFF00");
    // Plain main row stays unformatted.
    expect(fillOf(merged.getCell("A3"))).toBeUndefined();
    // Every exported cell draws all borders.
    expect(borderOf(merged.getCell("A1"))).toEqual(["thin", "thin", "thin", "thin"]);
    expect(borderOf(merged.getCell("C2"))).toEqual(["thin", "thin", "thin", "thin"]);
  });

  it("keeps unlinked rows formatted per cell behind the prefix columns", async () => {
    const built = buildSheetMerge(fixture(), { nationalIdColumn: 1, sheetNames: ["extra"] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportSheetMergeWorkbook(built)) as unknown as ArrayBuffer);
    // Unlinked sheets: only data columns carry formats; prefix columns stay plain.
    const unlinkedExtra = workbook.worksheets[1];
    expect(fillOf(unlinkedExtra.getCell("A2"))).toBeUndefined();
    expect(fillOf(unlinkedExtra.getCell("D2"))).toBe("FF0000FF");
    expect(fillOf(unlinkedExtra.getCell("E2"))).toBe("FF0000FF");
  });
});
