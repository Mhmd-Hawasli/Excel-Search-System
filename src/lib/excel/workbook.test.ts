import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { removeWorkbookFilters } from "@/lib/excel/workbook";

describe("removeWorkbookFilters", () => {
  it("removes worksheet and table filters and reveals filtered rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const filteredSheet = workbook.addWorksheet("مفلترة");
    filteredSheet.addRows([
      ["الاسم", "الرقم"],
      ["أحمد", 1],
      ["لينا", 2],
    ]);
    filteredSheet.autoFilter = "A1:B3";
    filteredSheet.getRow(3).hidden = true;

    const tableSheet = workbook.addWorksheet("جدول");
    tableSheet.addTable({
      name: "PeopleTable",
      ref: "A1",
      headerRow: true,
      columns: [{ name: "الاسم", filterButton: true }],
      rows: [["سارة"], ["نور"]],
    });
    tableSheet.getRow(3).hidden = true;

    const unfilteredSheet = workbook.addWorksheet("بلا فلتر");
    unfilteredSheet.addRow(["قيمة"]);
    unfilteredSheet.getRow(1).hidden = true;

    expect(removeWorkbookFilters(workbook)).toBe(true);
    expect(filteredSheet.autoFilter).toBeUndefined();
    expect(filteredSheet.getRow(3).hidden).toBe(false);
    expect(tableSheet.getTables()).toHaveLength(0);
    expect(tableSheet.getRow(3).hidden).toBe(false);
    expect(unfilteredSheet.getRow(1).hidden).toBe(true);

    const saved = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(saved);
    expect(reloaded.getWorksheet("مفلترة")?.autoFilter).toBeUndefined();
    expect(reloaded.getWorksheet("مفلترة")?.getRow(3).hidden).toBe(false);
    expect(reloaded.getWorksheet("جدول")?.getTables()).toHaveLength(0);
  });

  it("does not alter a workbook that has no filters", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("بيانات").addRow(["قيمة"]);

    expect(removeWorkbookFilters(workbook)).toBe(false);
  });
});
