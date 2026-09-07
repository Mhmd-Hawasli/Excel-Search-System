import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportMergeWorkbook } from "@/lib/merge/exporter";
import {
  MERGE_CONFIRM_HEADER,
  MERGE_CONFIRMED_TEXT,
  MERGE_KEY_HEADER,
  MERGE_SHEET_NAMES,
  MERGE_UNCONFIRMED_TEXT,
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

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

const left = {
  headers: ["الاسم الثلاثي", "الرقم الوطني"],
  rows: rows([
    ["محمد علي", "123456789"],
    ["سامي نور", "987654321"],
  ]),
};
const right = {
  headers: ["الاسم الثلاثي", "الرقم الوطني"],
  rows: rows([
    ["محمد علي", "123456789"],
    ["ليث عادل", "111111111"],
  ]),
};

describe("exportMergeWorkbook", () => {
  it("confirmed scope exports linked rows only, matching the system format", async () => {
    const workbook = await load(await exportMergeWorkbook(left, right, "confirmed"));
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
    // No unlinked rows in the confirmed file.
    expect(full.rowCount).toBe(2);

    for (const sheet of workbook.worksheets) {
      expect(sheet.getRow(1).font.bold).toBe(true);
      expect(sheet.getRow(2).height).toBeGreaterThan(20);
      expect(sheet.views[0]?.rightToLeft).toBe(true);
      expect(sheet.getColumn(1).width).toBeGreaterThan(5);
    }

    const tableA = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!;
    expect(tableA.getCell("A2").value).toBe("0001");
    expect(tableA.rowCount).toBe(2);

    const tableB = workbook.getWorksheet(MERGE_SHEET_NAMES[2])!;
    expect(tableB.getCell("A2").value).toBe("0001");
    expect(tableB.rowCount).toBe(2);
  });

  it("all scope exports every row with the confirmation as the second column", async () => {
    const workbook = await load(await exportMergeWorkbook(left, right, "all"));

    const full = workbook.getWorksheet(MERGE_SHEET_NAMES[0])!;
    expect(String(full.getCell("A1").value)).toBe(MERGE_KEY_HEADER);
    expect(String(full.getCell("B1").value)).toBe(MERGE_CONFIRM_HEADER);
    expect(String(full.getCell("C1").value)).toBe("A_الاسم الثلاثي");
    expect(String(full.getCell("E1").value)).toBe("B_الاسم الثلاثي");
    expect(full.getCell("A2").value).toBe("0001");
    expect(String(full.getCell("B2").value)).toBe(MERGE_CONFIRMED_TEXT);
    // Unlinked rows follow with a blank counterpart side, marked unconfirmed.
    expect(full.getCell("A3").value).toBe("");
    expect(String(full.getCell("B3").value)).toBe(MERGE_UNCONFIRMED_TEXT);
    expect(full.getCell("C3").value).toBe("سامي نور");
    expect(full.getCell("D3").value).toBe("987654321");
    expect(full.getCell("F3").value).toBe("");
    expect(full.getCell("E4").value).toBe("ليث عادل");
    expect(full.getCell("F4").value).toBe("111111111");
    expect(full.getCell("C4").value).toBe("");

    const tableA = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!;
    expect(String(tableA.getCell("B1").value)).toBe(MERGE_CONFIRM_HEADER);
    expect(tableA.getCell("A2").value).toBe("0001");
    expect(String(tableA.getCell("B2").value)).toBe(MERGE_CONFIRMED_TEXT);
    expect(tableA.getCell("A3").value).toBe("");
    expect(String(tableA.getCell("B3").value)).toBe(MERGE_UNCONFIRMED_TEXT);
  });

  it("confirmed scope excludes linked-but-unconfirmed rows (relaxed sessions)", async () => {
    const looseLeft = {
      headers: ["الاسم"],
      rows: [
        { rowNumber: 2, cells: ["أ"], key: "0001", rule: "full_name", confirmed: true },
        { rowNumber: 3, cells: ["ب"], key: "0002", rule: "national_id", confirmed: false },
      ] as MergeRow[],
    };
    const looseRight = {
      headers: ["الاسم"],
      rows: [
        { rowNumber: 2, cells: ["أ"], key: "0001", rule: "full_name", confirmed: true },
        { rowNumber: 3, cells: ["ج"], key: "0002", rule: "national_id", confirmed: false },
      ] as MergeRow[],
    };
    const confirmed = await load(await exportMergeWorkbook(looseLeft, looseRight, "confirmed"));
    const fullConfirmed = confirmed.getWorksheet(MERGE_SHEET_NAMES[0])!;
    expect(fullConfirmed.getCell("A2").value).toBe("0001");
    expect(fullConfirmed.rowCount).toBe(2);

    const every = await load(await exportMergeWorkbook(looseLeft, looseRight, "all"));
    const fullAll = every.getWorksheet(MERGE_SHEET_NAMES[0])!;
    expect(fullAll.getCell("A2").value).toBe("0001");
    expect(String(fullAll.getCell("B2").value)).toBe(MERGE_CONFIRMED_TEXT);
    expect(fullAll.getCell("A3").value).toBe("0002");
    expect(String(fullAll.getCell("B3").value)).toBe(MERGE_UNCONFIRMED_TEXT);
    expect(fullAll.getCell("C3").value).toBe("ب");
    expect(fullAll.getCell("D3").value).toBe("ج");
  });

  it("sorts every sheet by the link key with unlinked rows last", async () => {
    const shuffled: MergeRow[] = [
      { rowNumber: 4, cells: ["ج"], key: "0003", rule: "phone", confirmed: true },
      { rowNumber: 2, cells: ["أ"], key: null, rule: null, confirmed: false },
      { rowNumber: 3, cells: ["ب"], key: "0001", rule: "phone", confirmed: true },
    ];
    const workbook = await load(
      await exportMergeWorkbook(
        { headers: ["الاسم"], rows: shuffled },
        {
          headers: ["الاسم"],
          rows: shuffled.map((row) => ({ ...row, cells: [...row.cells] })),
        },
        "all",
      ),
    );
    for (const sheetName of MERGE_SHEET_NAMES) {
      const sheet = workbook.getWorksheet(sheetName)!;
      expect(sheet.getCell("A2").value).toBe("0001");
      expect(sheet.getCell("A3").value).toBe("0003");
      expect(sheet.getCell("A4").value).toBe("");
    }
  });

  it("converts date-like cells into Excel dates", async () => {
    const workbook = await load(
      await exportMergeWorkbook(
        {
          headers: ["التاريخ", "الاسم"],
          rows: [
            {
              rowNumber: 2,
              cells: ["2025-01-31", "محمد"],
              key: null,
              rule: null,
              confirmed: false,
            },
          ],
        },
        {
          headers: ["التاريخ"],
          rows: [{ rowNumber: 2, cells: ["31/01/2025"], key: null, rule: null, confirmed: false }],
        },
        "all",
      ),
    );
    const cell = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!.getCell("C2");
    expect(cell.value).toBeInstanceOf(Date);
    // parseStoredDate normalizes to UTC midnight (Excel dates carry no
    // timezone), so compare UTC components instead of the local timestamp.
    const exported = cell.value as Date;
    expect([exported.getUTCFullYear(), exported.getUTCMonth(), exported.getUTCDate()]).toEqual([
      2025, 0, 31,
    ]);
  });

  it("makes duplicate or blank headers unique so Excel opens the file without repair", async () => {
    const workbook = await load(
      await exportMergeWorkbook(
        { headers: ["الاسم", "الرقم"], rows: [] },
        {
          headers: ["الاسم", "الاسم", "   "],
          rows: [{ rowNumber: 2, cells: ["أ", "ب", "ج"], key: null, rule: null, confirmed: false }],
        },
        "all",
      ),
    );
    for (const sheet of workbook.worksheets) {
      const names: string[] = [];
      sheet.getRow(1).eachCell((cell) => names.push(String(cell.value)));
      // Every table column name must be non-blank and unique (case-insensitive),
      // otherwise Excel shows "Repaired Records: Table ... part (Table)".
      expect(names.every((name) => name.trim() !== "")).toBe(true);
      expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
    }
    const tableB = workbook.getWorksheet(MERGE_SHEET_NAMES[2])!;
    expect(String(tableB.getCell("C1").value)).toBe("الاسم");
    expect(String(tableB.getCell("D1").value)).toBe("الاسم (2)");
  });

  it("flattens line breaks in headers so Excel keeps the tables", async () => {
    const workbook = await load(
      await exportMergeWorkbook(
        { headers: ["كود الموظف\n(يترك فارغا)", " الكنية"], rows: [] },
        { headers: ["السوية التنظيمية الرابعة\n(المديرية)"], rows: [] },
        "all",
      ),
    );
    for (const sheet of workbook.worksheets) {
      sheet.getRow(1).eachCell((cell) => {
        expect(String(cell.value)).not.toMatch(/[\r\n\t]/);
      });
    }
    const tableA = workbook.getWorksheet(MERGE_SHEET_NAMES[1])!;
    expect(String(tableA.getCell("C1").value)).toBe("كود الموظف (يترك فارغا)");
    expect(String(tableA.getCell("D1").value)).toBe(" الكنية");
    const full = workbook.getWorksheet(MERGE_SHEET_NAMES[0])!;
    expect(String(full.getCell("C1").value)).toBe("A_كود الموظف (يترك فارغا)");
  });
});
