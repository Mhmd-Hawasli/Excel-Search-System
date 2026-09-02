import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { cellValueText } from "./cell-value";

describe("saved formula values", () => {
  it.each([
    [6170030229, "6170030229"],
    ["00123456789", "00123456789"],
    [0, "0"],
    [false, "false"],
    ["", ""],
  ])("reads the result %s instead of the formula", (result, expected) => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("بيانات");
    worksheet.getCell("A2").value = { formula: "'الموظفون'!A2", result };
    expect(cellValueText(worksheet.getCell("A2"))).toBe(expected);
  });
  it("reads a shared formula's own saved result", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("بيانات");
    worksheet.getCell("A2").value = { formula: "C2", result: 123456789 };
    worksheet.getCell("A3").value = { sharedFormula: "A2", result: 987654321 };
    expect(cellValueText(worksheet.getCell("A3"))).toBe("987654321");
  });
  it("reports absent results with the exact cell instead of treating them as empty IDs", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("المؤهلات");
    worksheet.getCell("A2").value = { formula: "C2" };
    expect(() => cellValueText(worksheet.getCell("A2"))).toThrow(
      /المؤهلات.*A2.*لا توجد نتيجة محفوظة/,
    );
  });
  it("retains the Excel error value for diagnostics", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("بيانات");
    worksheet.getCell("A2").value = { formula: "C2", result: { error: "#REF!" } };
    expect(cellValueText(worksheet.getCell("A2"))).toBe("#REF!");
  });
});
