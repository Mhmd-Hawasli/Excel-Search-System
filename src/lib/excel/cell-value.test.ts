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
  it("reads absent formula results as empty when the caller opts in", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("المؤهلات");
    worksheet.getCell("A2").value = { formula: "C2" };
    expect(cellValueText(worksheet.getCell("A2"), { onUncachedFormula: "empty" })).toBe("");
  });
  it("retains the Excel error value for diagnostics", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("بيانات");
    worksheet.getCell("A2").value = { formula: "C2", result: { error: "#REF!" } };
    expect(cellValueText(worksheet.getCell("A2"))).toBe("#REF!");
  });
});

describe("structured values never become [object Object]", () => {
  it.each([
    ["ليلى سمير حداد", "ليلى سمير حداد"],
    ["00123456789", "00123456789"],
    [6170030229, "6170030229"],
    [0, "0"],
    [false, "false"],
    ["", ""],
  ])("reads scalar %s as-is", (value, expected) => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("بيانات");
    worksheet.getCell("A2").value = value;
    expect(cellValueText(worksheet.getCell("A2"))).toBe(expected);
  });
  it("joins rich-text runs instead of stringifying the object", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("بيانات");
    worksheet.getCell("A2").value = { richText: [{ text: "ليلى " }, { text: "سمير" }] };
    expect(cellValueText(worksheet.getCell("A2"))).toBe("ليلى سمير");
  });
  it("keeps hyperlink display text instead of the object", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("بيانات");
    worksheet.getCell("A2").value = { text: "اضغط هنا", hyperlink: "https://example.com" };
    expect(cellValueText(worksheet.getCell("A2"))).toBe("اضغط هنا");
  });
  it("fails loudly on unresolved shared strings with the cell address", () => {
    const worksheet = new ExcelJS.Workbook().addWorksheet("الموظفون");
    worksheet.getCell("B5").value = { sharedString: 7 } as unknown as ExcelJS.CellValue;
    expect(() => cellValueText(worksheet.getCell("B5"))).toThrow(/الموظفون.*B5.*تعذر قراءة/);
  });
});
