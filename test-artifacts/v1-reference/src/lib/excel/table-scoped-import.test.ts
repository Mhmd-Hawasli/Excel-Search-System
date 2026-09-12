import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { headersForSheet } from "@/lib/excel/workbook";
import { mergeLinkedSheets } from "@/lib/excel/linked-sheets";
import { sheetDataRows, sheetHeaders } from "@/lib/sheet-merge/workbook";
import { tableRangeForSheet } from "@/lib/excel/table-range";

/**
 * Sheets carrying a real Excel Table: every reader must see only the table
 * (headers, values and row counts) and ignore everything outside it.
 */
function tableSheet() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("data");
  sheet.getCell("A1").value = "junk above";
  sheet.getCell("A2").value = "junk";
  sheet.getCell("B2").value = "h1";
  sheet.getCell("C2").value = "h2";
  sheet.getCell("B3").value = "v1";
  sheet.getCell("C3").value = "v2";
  sheet.getCell("B4").value = "v3";
  sheet.getCell("C4").value = "v4";
  sheet.getCell("A8").value = "junk below";
  sheet.addTable({
    name: "T",
    ref: "B2",
    headerRow: true,
    totalsRow: false,
    columns: [{ name: "h1" }, { name: "h2" }],
    rows: [
      ["v1", "v2"],
      ["v3", "v4"],
    ],
  });
  return { workbook, sheet };
}

describe("table-scoped reading", () => {
  it("detects the table range", () => {
    const { sheet } = tableSheet();
    expect(tableRangeForSheet(sheet)).toEqual({
      headerRow: 2,
      firstRow: 3,
      lastRow: 4,
      firstCol: 2,
      lastCol: 3,
    });
  });

  it("scopes headersForSheet to the table", () => {
    const { sheet } = tableSheet();
    const table = tableRangeForSheet(sheet);
    expect(table).not.toBeNull();
    expect(headersForSheet(sheet, { table })).toEqual(["h1", "h2"]);
    // Without bounds the whole sheet reads as before.
    expect(headersForSheet(sheet)).toContain("junk above");
  });

  it("scopes linked-sheet rows to the primary table", () => {
    const workbook = new ExcelJS.Workbook();
    const primary = workbook.addWorksheet("main");
    primary.getCell("A1").value = "junk";
    primary.getCell("B1").value = "nid";
    primary.getCell("C1").value = "name";
    primary.getCell("B2").value = "123456789";
    primary.getCell("C2").value = "person";
    primary.getCell("A9").value = "junk below";
    primary.addTable({
      name: "T",
      ref: "B1",
      headerRow: true,
      totalsRow: false,
      columns: [{ name: "nid" }, { name: "name" }],
      rows: [["123456789", "person"]],
    });
    const extra = workbook.addWorksheet("ex");
    extra.getCell("A1").value = "nid";
    extra.getCell("B1").value = "city";
    extra.getCell("A2").value = "123456789";
    extra.getCell("B2").value = "damascus";
    const tables = {
      main: tableRangeForSheet(primary),
      ex: tableRangeForSheet(extra),
    };
    expect(tables.ex).toBeNull();
    const { inspection, rows } = mergeLinkedSheets(
      workbook,
      { nationalIdColumnIndex: 1, sheetNames: ["ex"] },
      tables,
    );
    expect(inspection.columns.map((column) => column.headerRaw)).toEqual([
      "nid",
      "name",
      "city",
    ]);
    expect(rows.map((row) => row.values)).toEqual([["123456789", "person", "damascus"]]);
    expect(rows.map((row) => row.rowIndex)).toEqual([2]);
  });

  it("scopes sheet-merge headers and rows to the table", () => {
    const { sheet } = tableSheet();
    const table = tableRangeForSheet(sheet);
    expect(table).not.toBeNull();
    expect(sheetHeaders(sheet, table)).toEqual(["h1", "h2"]);
    expect(sheetDataRows(sheet, ["h1", "h2"], table).map((row) => row.cells)).toEqual([
      ["v1", "v2"],
      ["v3", "v4"],
    ]);
  });
});
