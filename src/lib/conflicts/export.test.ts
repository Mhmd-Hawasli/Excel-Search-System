import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildConflictsExportWorkbook } from "./export";
import type { ConflictRow } from "./catalog";

function row(partial: Partial<ConflictRow>): ConflictRow {
  return {
    id: "rec-1",
    fileId: "file-1",
    groupId: "group-1",
    fileName: "file.xlsx",
    originalFilename: "file.xlsx",
    rowIndex: 5,
    fullName: "full",
    motherName: "mother",
    nationalId: "00123456789",
    shamCash: "1",
    personalNo: "2",
    phone: "0937000000",
    functionalCategory: "1",
    issueNumber: 1,
    groupKey: "g",
    issues: [
      { rule: "pair_national_phone", label: "rule label", explanation: "why why" },
    ],
    ...partial,
  };
}

describe("buildConflictsExportWorkbook", () => {
  it("writes one detailed row per record with all borders", async () => {
    const buffer = await buildConflictsExportWorkbook([
      row({}),
      row({ id: "rec-2", rowIndex: 6, fullName: "other" }),
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    expect(String(sheet.getCell("A1").value)).toBe("رقم المشكلة");
    expect(String(sheet.getCell("A2").value)).toBe("1");
    expect(String(sheet.getCell("B2").value)).toBe("file.xlsx");
    expect(String(sheet.getCell("C2").value)).toBe("5");
    expect(String(sheet.getCell("D2").value)).toBe("full");
    expect(String(sheet.getCell("I2").value)).toBe("0937000000");
    expect(String(sheet.getCell("A3").value)).toBe("1");
    expect(String(sheet.getCell("D3").value)).toBe("other");
    const border = sheet.getCell("D2").border as Record<string, { style?: string } | undefined>;
    expect([border.top?.style, border.left?.style, border.bottom?.style, border.right?.style]).toEqual([
      "thin",
      "thin",
      "thin",
      "thin",
    ]);
  });

  it("exports an empty table without failing", async () => {
    const buffer = await buildConflictsExportWorkbook([]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets[0].getCell("A1").value).toBe("رقم المشكلة");
  });
});
