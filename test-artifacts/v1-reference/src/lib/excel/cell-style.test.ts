import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  applyRowFormats,
  extractRowFormats,
  normalizeArgb,
  resolveExcelColor,
  resolveThemeColor,
  type RowFormats,
} from "./cell-style";

function styledSheet() {
  const workbook = new ExcelJS.Workbook();
  return workbook.addWorksheet("s");
}

describe("normalizeArgb", () => {
  it.each([
    ["FFFF0000", "FFFF0000"],
    ["ff00ff00", "FF00FF00"],
    ["FF0000", "FFFF0000"],
    ["#00ff00", "FF00FF00"],
    ["red", null],
    ["FFF", null],
    ["FFFFFFFFF", null],
    ["", null],
    [null, null],
    [undefined, null],
    [123, null],
  ])("normalizes %s to %s", (value, expected) => {
    expect(normalizeArgb(value)).toBe(expected);
  });
});

describe("resolveThemeColor", () => {
  it("resolves plain theme colors", () => {
    expect(resolveThemeColor(0, 0)).toBe("FFFFFFFF");
    expect(resolveThemeColor(1, 0)).toBe("FF000000");
    expect(resolveThemeColor(4, 0)).toBe("FF5B9BD5");
  });
  it("applies tint and shade", () => {
    // accent1 5B9BD5 darkened by 25%: 91*.75=68, 155*.75=116, 213*.75=160.
    expect(resolveThemeColor(4, -0.25)).toBe("FF4474A0");
    // accent1 lightened by 50%: v*.5+127.5 → 173, 205, 234.
    expect(resolveThemeColor(4, 0.5)).toBe("FFADCDEA");
  });
  it("rejects unknown themes and clamps tint", () => {
    expect(resolveThemeColor(99, 0)).toBeNull();
    expect(resolveThemeColor("4", 0)).toBeNull();
    expect(resolveThemeColor(4, 5)).toBe(resolveThemeColor(4, 1));
    expect(resolveThemeColor(4, -5)).toBe(resolveThemeColor(4, -1));
  });
});

describe("resolveExcelColor", () => {
  it.each([
    [{ argb: "FFFF0000" }, "FFFF0000"],
    [{ argb: "FF0000" }, "FFFF0000"],
    [{ theme: 1 }, "FF000000"],
    [{ theme: 4, tint: -0.25 }, "FF4474A0"],
    [{ indexed: 10 }, null],
    [{}, null],
    [null, null],
    [undefined, null],
    ["FFFF0000", null],
  ])("resolves %s to %s", (color, expected) => {
    expect(resolveExcelColor(color as never)).toBe(expected);
  });
});
describe("extractRowFormats", () => {
  it("captures one fill and one font color per cell", () => {
    const sheet = styledSheet();
    const solid = (argb: string) =>
      ({ type: "pattern", pattern: "solid", fgColor: { argb } }) as const;
    sheet.getCell("A2").fill = solid("FFFF0000");
    sheet.getCell("B2").fill = solid("FFFF0000");
    sheet.getCell("C2").fill = solid("FF0000FF");
    sheet.getCell("A2").font = { color: { argb: "FF00FF00" } };
    sheet.getCell("C2").font = { color: { theme: 4 } };
    expect(extractRowFormats(sheet.getRow(2), 3)).toEqual({
      fills: { "0": "FFFF0000", "1": "FFFF0000", "2": "FF0000FF" },
      fonts: { "0": "FF00FF00", "2": "FF5B9BD5" },
    });
  });

  it("ignores empty fills and uncolored cells", () => {
    const sheet = styledSheet();
    sheet.getCell("A2").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFF0000" },
    };
    sheet.getCell("B2").fill = { type: "pattern", pattern: "none" };
    expect(extractRowFormats(sheet.getRow(2), 3)).toEqual({
      fills: { "0": "FFFF0000" },
      fonts: {},
    });
  });

  it("returns empty maps for plain rows", () => {
    const sheet = styledSheet();
    sheet.getCell("A2").value = "plain";
    expect(extractRowFormats(sheet.getRow(2), 3)).toEqual({ fills: {}, fonts: {} });
  });

  it("ignores the default automatic font color that parsers materialize", () => {
    const sheet = styledSheet();
    sheet.getCell("A2").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFF0000" },
    };
    sheet.getCell("A2").font = { color: { theme: 1 } };
    sheet.getCell("B2").font = {
      color: { theme: 1, tint: 0.5 } as unknown as { argb?: string },
    };
    sheet.getCell("C2").font = { color: { argb: "FF000000" } };
    expect(extractRowFormats(sheet.getRow(2), 3)).toEqual({
      fills: { "0": "FFFF0000" },
      fonts: { "1": "FF808080", "2": "FF000000" },
    });
  });
});

describe("applyRowFormats", () => {
  it("paints each cell fill and font color", () => {
    const sheet = styledSheet();
    const fillOf = (cell: ExcelJS.Cell) =>
      (cell.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
    const formats: RowFormats = {
      fills: { "0": "FFFFFF00", "2": "FFFF0000" },
      fonts: { "1": "FF0000FF" },
    };
    applyRowFormats(sheet, 3, formats, 3);
    const row = sheet.getRow(3);
    expect(fillOf(row.getCell(1))).toBe("FFFFFF00");
    expect(fillOf(row.getCell(2))).toBeUndefined();
    expect(fillOf(row.getCell(3))).toBe("FFFF0000");
    expect(
      (row.getCell(1).font as { color?: { argb?: string } } | undefined)?.color,
    ).toBeUndefined();
    expect((row.getCell(2).font as { color?: { argb?: string } }).color?.argb).toBe("FF0000FF");
  });

  it("preserves existing font properties and skips out-of-range entries", () => {
    const sheet = styledSheet();
    sheet.getRow(2).getCell(1).font = { bold: true, size: 14 };
    applyRowFormats(sheet, 2, { fills: {}, fonts: { "0": "FFFF0000", "9": "FF0000FF" } }, 2);
    const font = sheet.getRow(2).getCell(1).font as {
      bold?: boolean;
      size?: number;
      color?: { argb?: string };
    };
    expect(font.bold).toBe(true);
    expect(font.size).toBe(14);
    expect(font.color?.argb).toBe("FFFF0000");
  });

  it("survives an Excel write/read round trip", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("data", { views: [{ rightToLeft: true }] });
    sheet.getCell("A1").value = "name";
    sheet.getCell("A2").value = "abcdefghij";
    sheet.getCell("B2").value = "mnop";
    applyRowFormats(sheet, 2, { fills: { "0": "FFFF0000" }, fonts: { "1": "FF0000FF" } }, 2);
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load((await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer);
    const row = reloaded.worksheets[0].getRow(2);
    expect((row.getCell(1).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe(
      "FFFF0000",
    );
    expect((row.getCell(2).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBeUndefined();
    expect((row.getCell(2).font as { color?: { argb?: string } }).color?.argb).toBe("FF0000FF");
  });
});
