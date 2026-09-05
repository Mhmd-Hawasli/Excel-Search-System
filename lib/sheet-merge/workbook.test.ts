import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildUploadInspection,
  clearWorkbookFilters,
  parseUploadedWorkbook,
} from "@/lib/sheet-merge/workbook";

async function workbookBuffer(build: (workbook: ExcelJS.Workbook) => void) {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return Buffer.from((await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer);
}

function sheetsFixture(workbook: ExcelJS.Workbook) {
  const main = workbook.addWorksheet("الأساسية");
  main.addRows([
    ["الاسم", "الرقم الوطني", "المدينة"],
    ["أحمد", "123456789", "دمشق"],
    ["ليلى", "987654321", "حلب"],
    ["سامي", "112233445", "حمص"],
  ]);
  // An auto-filter with a filtered-out (hidden) row.
  main.autoFilter = "A1:C1";
  main.getRow(4).hidden = true;

  const extra = workbook.addWorksheet("الرواتب");
  extra.addRows([
    ["الرقم الوطني", "الراتب"],
    ["123456789", 5000],
    ["987654321", 7000],
  ]);
  extra.getColumn(2).hidden = true;
}

describe("parseUploadedWorkbook", () => {
  it("requires more than one sheet", async () => {
    const buffer = await workbookBuffer((workbook) => {
      workbook.addWorksheet("وحيدة").addRows([["الرقم الوطني"], ["123456789"]]);
    });
    await expect(parseUploadedWorkbook(buffer, "ملف.xlsx")).rejects.toThrow("أكثر من صفحة واحدة");
  });

  it("removes the filter from every column and row and reads all sheets in memory", async () => {
    const buffer = await workbookBuffer(sheetsFixture);
    const uploaded = await parseUploadedWorkbook(buffer, "الموظفون.xlsx");

    expect(uploaded.sheets.map((sheet) => sheet.name)).toEqual(["الأساسية", "الرواتب"]);
    expect(uploaded.sheets[0].filtersRemoved).toBe(true);
    expect(uploaded.sheets[1].filtersRemoved).toBe(true);
    // The hidden row and the hidden column are visible again.
    expect(uploaded.sheets[0].rows).toHaveLength(3);
    expect(uploaded.sheets[0].rows[2].cells).toEqual(["سامي", "112233445", "حمص"]);
    expect(uploaded.sheets[1].rows[0].cells).toEqual(["123456789", "5000"]);
    expect(uploaded.sheets[0].headers).toEqual(["الاسم", "الرقم الوطني", "المدينة"]);
    expect(uploaded.originalFilename).toBe("الموظفون.xlsx");
  });

  it("fills blank headers and skips empty rows", async () => {
    const buffer = await workbookBuffer((workbook) => {
      const main = workbook.addWorksheet("الأولى");
      main.getCell("A1").value = "الرقم الوطني";
      main.getCell("C1").value = "  ";
      main.getCell("A2").value = "123456789";
      main.getCell("C2").value = "قيمة";
      main.getCell("A4").value = "987654321";
      workbook.addWorksheet("الثانية").addRows([
        ["الرقم الوطني", "حقل"],
        ["123456789", "س"],
      ]);
    });
    const uploaded = await parseUploadedWorkbook(buffer, "ملف.xlsx");
    expect(uploaded.sheets[0].headers).toEqual(["الرقم الوطني", "عمود 2", "عمود 3"]);
    expect(uploaded.sheets[0].rows.map((row) => row.rowNumber)).toEqual([2, 4]);
  });

  it("rejects an unreadable workbook", async () => {
    await expect(parseUploadedWorkbook(Buffer.from("not excel"), "ملف.xlsx")).rejects.toThrow(
      "تعذر قراءة المصنف",
    );
  });

  it("treats formulas without a saved result as empty and skips fully empty rows", async () => {
    const buffer = await workbookBuffer((workbook) => {
      const main = workbook.addWorksheet("المؤهلات");
      main.addRows([
        ["الاسم", "الرقم الوطني"],
        ["أحمد", "123456789"],
      ]);
      // A formula with no cached result: reads as "" instead of failing the upload.
      main.getCell("A3").value = { formula: "A2" };
      main.getCell("B3").value = { formula: "B2" };
      main.getCell("A4").value = "ليلى";
      main.getCell("B4").value = { formula: "B2" };
      workbook.addWorksheet("الثانية").addRows([
        ["الرقم الوطني", "حقل"],
        ["123456789", "س"],
      ]);
    });
    const uploaded = await parseUploadedWorkbook(buffer, "ملف.xlsx");
    const sheet = uploaded.sheets[0];
    expect(sheet.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(sheet.rows[1].cells).toEqual(["ليلى", ""]);
  });
});

describe("clearWorkbookFilters", () => {
  it("reports which sheet had something to remove", async () => {
    const workbook = new ExcelJS.Workbook();
    sheetsFixture(workbook);
    workbook.addWorksheet("نظيفة").addRows([
      ["الرقم الوطني", "حقل"],
      ["123456789", "س"],
    ]);
    const removed = clearWorkbookFilters(workbook);
    expect(removed.get("الأساسية")).toBe(true);
    expect(removed.get("الرواتب")).toBe(true);
    expect(removed.get("نظيفة")).toBe(false);
    expect(workbook.getWorksheet("الأساسية")!.autoFilter).toBeUndefined();
    expect(workbook.getWorksheet("الأساسية")!.getRow(4).hidden).toBe(false);
    expect(workbook.getWorksheet("الرواتب")!.getColumn(2).hidden).toBe(false);
  });
});

describe("buildUploadInspection", () => {
  it("describes every sheet and suggests the national id column", async () => {
    const buffer = await workbookBuffer(sheetsFixture);
    const inspection = buildUploadInspection(await parseUploadedWorkbook(buffer, "الموظفون.xlsx"));

    expect(inspection.sheetCount).toBe(2);
    expect(inspection.main.name).toBe("الأساسية");
    expect(inspection.main.rowCount).toBe(3);
    expect(inspection.suggestion.index).toBe(1);
    expect(inspection.sheets).toEqual([
      {
        name: "الأساسية",
        hidden: false,
        rowCount: 3,
        columnCount: 3,
        firstColumnHeader: "الاسم",
        filtersRemoved: true,
        linkable: true,
        reason: null,
      },
      {
        name: "الرواتب",
        hidden: false,
        rowCount: 2,
        columnCount: 2,
        firstColumnHeader: "الرقم الوطني",
        filtersRemoved: true,
        linkable: true,
        reason: null,
      },
    ]);
  });

  it("marks a single-column sheet as unlinkable", async () => {
    const buffer = await workbookBuffer((workbook) => {
      workbook.addWorksheet("الأولى").addRows([
        ["الرقم الوطني", "الاسم"],
        ["123456789", "أحمد"],
      ]);
      workbook.addWorksheet("عمود واحد").addRows([["الرقم الوطني"], ["123456789"]]);
    });
    const inspection = buildUploadInspection(await parseUploadedWorkbook(buffer, "ملف.xlsx"));
    expect(inspection.sheets[1].linkable).toBe(false);
    expect(inspection.sheets[1].reason).toContain("عمود واحد فقط");
  });
});
