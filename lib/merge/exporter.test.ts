import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportMergeWorkbook } from "@/lib/merge/exporter";
import { MERGE_KEY_HEADER, MERGE_SHEET_NAMES, type MergeRow } from "@/lib/merge/types";

function rows(cells: string[][]): MergeRow[] {
  return cells.map((values, index) => ({
    rowNumber: index + 2,
    cells: values,
    key: index === 0 ? "0001" : null,
    rule: index === 0 ? "full_name" : null,
    confirmed: index === 0 ? true : false,
  }));
}

describe("exportMergeWorkbook", () => {
  it("writes two sheets with the key column first, matching the system format", async () => {
    const buffer = await exportMergeWorkbook(
      {
        headers: ["الاسم الثلاثي", "الرقم الوطني"],
        rows: rows([
          ["محمد علي", "123456789"],
          ["سامي نور", "987654321"],
        ]),
      },
      {
        headers: ["الاسم الثلاثي", "الرقم الوطني"],
        rows: rows([
          ["محمد علي", "123456789"],
          ["سامي نور", "987654321"],
        ]),
      },
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([...MERGE_SHEET_NAMES]);

    for (const sheet of workbook.worksheets) {
      expect(sheet.getCell("A1").value).toBe(MERGE_KEY_HEADER);
      expect(sheet.getCell("B1").value).toBe("الاسم الثلاثي");
      expect(sheet.getCell("C1").value).toBe("الرقم الوطني");
      expect(sheet.getCell("A2").value).toBe("0001");
      expect(sheet.getCell("A3").value).toBe("");
      expect(sheet.getRow(1).font.bold).toBe(true);
      expect(sheet.getRow(2).height).toBeGreaterThan(20);
      expect(sheet.views[0]?.rightToLeft).toBe(true);
      expect(sheet.getColumn(1).width).toBeGreaterThan(5);
    }
  });

  it("converts date-like cells into Excel dates", async () => {
    const buffer = await exportMergeWorkbook(
      {
        headers: ["التاريخ", "الاسم"],
        rows: [
          { rowNumber: 2, cells: ["2025-01-31", "محمد"], key: null, rule: null, confirmed: false },
        ],
      },
      {
        headers: ["التاريخ"],
        rows: [{ rowNumber: 2, cells: ["31/01/2025"], key: null, rule: null, confirmed: false }],
      },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const cell = workbook.getWorksheet(MERGE_SHEET_NAMES[0])!.getCell("B2");
    expect(cell.value).toBeInstanceOf(Date);
    expect((cell.value as Date).getTime()).toBe(new Date(2025, 0, 31).getTime());
  });
});
