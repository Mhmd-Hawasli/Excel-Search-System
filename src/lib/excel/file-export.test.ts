import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildFileExportWorkbook } from "./file-export";

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

describe("buildFileExportWorkbook cell formats", () => {
  it("reapplies row fills and per-column font colors from the source", async () => {
    const buffer = await buildFileExportWorkbook({
      sheetName: "data",
      columns: ["A", "B"],
      records: [
        {
          id: "r1",
          rowIndex: 2,
          data: { A: "x", B: "y" },
          fmtFills: { A: "FFFF0000" },
          fmtFontColors: { B: "FF0000FF", missing: "FF00FF00" },
        },
        { id: "r2", rowIndex: 3, data: { A: "p", B: "q" }, fmtFills: null, fmtFontColors: null },
      ],
      edits: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(String(sheet.getCell("A2").value)).toBe("x");
    // Each cell keeps only its own fill.
    expect(fillOf(sheet.getCell("A2"))).toBe("FFFF0000");
    expect(fillOf(sheet.getCell("B2"))).toBeUndefined();
    expect(fillOf(sheet.getCell("A3"))).toBeUndefined();
    // Font color on its original column only; unknown headers ignored.
    expect(fontOf(sheet.getCell("A2"))).toBeUndefined();
    expect(fontOf(sheet.getCell("B2"))).toBe("FF0000FF");
    // Every exported cell draws all borders.
    expect(borderOf(sheet.getCell("A1"))).toEqual(["thin", "thin", "thin", "thin"]);
    expect(borderOf(sheet.getCell("A2"))).toEqual(["thin", "thin", "thin", "thin"]);
    expect(borderOf(sheet.getCell("B3"))).toEqual(["thin", "thin", "thin", "thin"]);
  });

  it("sanitizes table column names so Excel opens the file without repair", async () => {
    const buffer = await buildFileExportWorkbook({
      sheetName: "data",
      columns: ["الاسم\nالأول", "الهاتف", "الهاتف", "   "],
      records: [
        {
          id: "r1",
          rowIndex: 2,
          data: { "الاسم\nالأول": "x", الهاتف: "y", "   ": "z" },
          fmtFills: null,
          fmtFontColors: null,
        },
      ],
      edits: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const tables = sheet.getTables() as unknown as Array<{
      table?: { columns?: Array<{ name?: string }> };
    }>;
    const names = (tables[0]?.table?.columns ?? []).map((column) => column.name);
    expect(names).toEqual(["الاسم الأول", "الهاتف", "الهاتف (2)", "عمود 4"]);
    // Values still land under their original columns.
    expect(String(sheet.getCell("A2").value)).toBe("x");
    expect(String(sheet.getCell("B2").value)).toBe("y");
    expect(String(sheet.getCell("D2").value)).toBe("z");
  });
});
