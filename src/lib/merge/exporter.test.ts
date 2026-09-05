import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportMergeWorkbook } from "@/lib/merge/exporter";
import {
  MERGE_KEY_HEADER,
  MERGE_SHEET_NAMES,
  type MergeRow,
} from "@/lib/merge/types";

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
  it("writes the full merge plus one sheet per table, matching the system format", async () => {
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
          ["ليث عادل", "111111111"],
        ]),
      },
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([...MERGE_SHEET_NAMES]);

    const full = workbook.getWorksheet(MERGE_SHEET_NAMES[0])!;
    expect(String(full.getCell("A1").value)).toBe(MERGE_KEY_HEADER);
    expect(String(full.getCell("B1").value)).toBe("A_الاسم الثلاثي");
    expect(String(full.getCell("C1").value)).toBe("A_الرقم الوطني");
    expect(String(full.getCell("D1").value)).toBe("B_الاسم الثلاثي");
    expect(String(full.getCell("E1").value)).toBe("B_الرقم الوطني");
    // Linked pair shares one row: key, then both sides (no confirmation column).
    expect(full.getCell("A2").value).toBe("0001");
    expect(full.getCell("B2").value).toBe("محمد علي");
    expect(full.getCell("D2").value).toBe("محمد علي");
    // Unlinked rows follow with a blank counterpart side.
    expect(full.getCell("A3").value).toBe("");
    expect(full.getCell("B3").value).toBe("سامي نور");
    expect(full.getCell("D3").value).toBe("");
    expect(full.getCell("D4").value).toBe("ليث عادل");
    expect(full.getCell("B4").value).toBe("");

    for (const sheet of workbook.worksheets) {
      expect(sheet.getRow(1).font.bold).toBe(true);
      expect(sheet.getRow(2).height).toBeGreaterThan(20);
      expect(sheet.views[0]?.rightToLeft).toBe(true);
      expect(sheet.getColumn(1).width).toBeGreaterThan(5);
    }

    const tableA = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!;
    expect(tableA.getCell("A1").value).toBe(MERGE_KEY_HEADER);
    expect(tableA.getCell("B1").value).toBe("الاسم الثلاثي");
    expect(tableA.getCell("C1").value).toBe("الرقم الوطني");
    expect(tableA.getCell("A2").value).toBe("0001");
    expect(tableA.getCell("A3").value).toBe("");

    const tableB = workbook.getWorksheet(MERGE_SHEET_NAMES[2])!;
    expect(tableB.getCell("A1").value).toBe(MERGE_KEY_HEADER);
    expect(tableB.getCell("B1").value).toBe("الاسم الثلاثي");
    expect(tableB.getCell("A2").value).toBe("0001");
  });

  it("sorts every sheet by the link key with unlinked rows last", async () => {
    const shuffled: MergeRow[] = [
      { rowNumber: 4, cells: ["ج"], key: "0003", rule: "phone", confirmed: true },
      { rowNumber: 2, cells: ["أ"], key: null, rule: null, confirmed: false },
      { rowNumber: 3, cells: ["ب"], key: "0001", rule: "phone", confirmed: true },
    ];
    const buffer = await exportMergeWorkbook(
      { headers: ["الاسم"], rows: shuffled },
      {
        headers: ["الاسم"],
        rows: shuffled.map((row) => ({ ...row, cells: [...row.cells] })),
      },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    for (const sheetName of MERGE_SHEET_NAMES) {
      const sheet = workbook.getWorksheet(sheetName)!;
      expect(sheet.getCell("A2").value).toBe("0001");
      expect(sheet.getCell("A3").value).toBe("0003");
      expect(sheet.getCell("A4").value).toBe("");
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
    const cell = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!.getCell("B2");
    expect(cell.value).toBeInstanceOf(Date);
    // parseStoredDate normalizes to UTC midnight (Excel dates carry no
    // timezone), so compare UTC components instead of the local timestamp.
    const exported = cell.value as Date;
    expect([exported.getUTCFullYear(), exported.getUTCMonth(), exported.getUTCDate()]).toEqual([
      2025, 0, 31,
    ]);
  });

  it("makes duplicate or blank headers unique so Excel opens the file without repair", async () => {
    const buffer = await exportMergeWorkbook(
      { headers: ["الاسم", "الرقم"], rows: [] },
      {
        headers: ["الاسم", "الاسم", "   "],
        rows: [{ rowNumber: 2, cells: ["أ", "ب", "ج"], key: null, rule: null, confirmed: false }],
      },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    for (const sheet of workbook.worksheets) {
      const names: string[] = [];
      sheet.getRow(1).eachCell((cell) => names.push(String(cell.value)));
      // Every table column name must be non-blank and unique (case-insensitive),
      // otherwise Excel shows "Repaired Records: Table ... part (Table)".
      expect(names.every((name) => name.trim() !== "")).toBe(true);
      expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
    }
    const tableB = workbook.getWorksheet(MERGE_SHEET_NAMES[2])!;
    expect(String(tableB.getCell("B1").value)).toBe("الاسم");
    expect(String(tableB.getCell("C1").value)).toBe("الاسم (2)");
  });

  it("flattens line breaks in headers so Excel keeps the tables", async () => {
    const buffer = await exportMergeWorkbook(
      { headers: ["كود الموظف\n(يترك فارغا)", " الكنية"], rows: [] },
      { headers: ["السوية التنظيمية الرابعة\n(المديرية)"], rows: [] },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    for (const sheet of workbook.worksheets) {
      sheet.getRow(1).eachCell((cell) => {
        expect(String(cell.value)).not.toMatch(/[\r\n\t]/);
      });
    }
    const tableA = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!;
    expect(String(tableA.getCell("B1").value)).toBe("كود الموظف (يترك فارغا)");
    expect(String(tableA.getCell("C1").value)).toBe(" الكنية");
    const full = workbook.getWorksheet(MERGE_SHEET_NAMES[0])!;
    expect(String(full.getCell("B1").value)).toBe("A_كود الموظف (يترك فارغا)");
  });
});
