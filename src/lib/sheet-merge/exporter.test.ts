import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportSheetMergeWorkbook } from "@/lib/sheet-merge/exporter";
import { buildSheetMerge } from "@/lib/sheet-merge/merge";
import type { UploadedWorkbook } from "@/lib/sheet-merge/types";

function fixture(): UploadedWorkbook {
  return {
    id: "upload-1",
    createdAt: Date.now(),
    originalFilename: "الموظفون.xlsx",
    sheets: [
      {
        name: "الأساسية",
        hidden: false,
        headers: ["الاسم", "الرقم الوطني"],
        rows: [
          { rowNumber: 2, cells: ["أحمد", "123456789"] },
          { rowNumber: 3, cells: ["سامي", "123"] },
        ],
        filtersRemoved: false,
      },
      {
        name: "الرواتب",
        hidden: false,
        headers: ["الرقم الوطني", "الراتب"],
        rows: [
          { rowNumber: 2, cells: ["123456789", "5000"] },
          { rowNumber: 3, cells: ["111222333", "7000"] },
        ],
        filtersRemoved: false,
      },
      {
        name: "الحوافز",
        hidden: false,
        headers: ["الرقم الوطني", "الراتب"],
        rows: [{ rowNumber: 2, cells: ["123456789", "900"] }],
        filtersRemoved: false,
      },
    ],
  };
}

async function readBack(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe("exportSheetMergeWorkbook", () => {
  it("writes the merged sheet with the system format and one sheet per unlinked source", async () => {
    const built = buildSheetMerge(fixture(), {
      nationalIdColumn: 1,
      sheetNames: ["الرواتب", "الحوافز"],
    });
    const workbook = await readBack(await exportSheetMergeWorkbook(built));

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "الدمج",
      "غير مرتبط - الأساسية",
      "غير مرتبط - الرواتب",
    ]);

    const merged = workbook.getWorksheet("الدمج")!;
    // Columns of the first sheet, then each linked sheet without its id column.
    // ExcelJS types `values` as an array OR a keyed object, so narrow it.
    const mergedHeader = merged.getRow(1).values as unknown as Array<string | undefined>;
    expect(mergedHeader.slice(1)).toEqual(["الاسم", "الرقم الوطني", "الراتب", "الراتب (2)"]);
    expect(merged.getCell("A2").value).toBe("أحمد");
    expect(merged.getCell("C2").value).toBe("5000");
    expect(merged.getCell("D2").value).toBe("900");
    // The unlinked main row is still exported, with empty linked columns.
    expect(merged.getCell("A3").value).toBe("سامي");
    expect(merged.getCell("C3").value).toBe("");
    expect(merged.views[0]?.rightToLeft).toBe(true);
    expect(merged.getRow(2).height).toBe(30);
    // ExcelJS wraps the parsed table in a `table` property.
    const table = merged.getTable("SheetMergeTable1") as unknown as {
      table: { name: string; style: { theme: string } };
    };
    expect(table.table.name).toBe("SheetMergeTable1");
    expect(table.table.style.theme).toBe("TableStyleLight9");

    const mainUnlinked = workbook.getWorksheet("غير مرتبط - الأساسية")!;
    const unlinkedHeader = mainUnlinked.getRow(1).values as unknown as Array<string | undefined>;
    expect(unlinkedHeader.slice(1)).toEqual([
      "الصفحة",
      "رقم الصف",
      "سبب التعذر",
      "الاسم",
      "الرقم الوطني",
    ]);
    expect(mainUnlinked.getCell("A2").value).toBe("الأساسية");
    expect(mainUnlinked.getCell("B2").value).toBe("3");
    expect(String(mainUnlinked.getCell("C2").value)).toContain("7 محارف");
    expect(mainUnlinked.getCell("D2").value).toBe("سامي");
    expect(mainUnlinked.getCell("E2").value).toBe("123");

    const linkedUnlinked = workbook.getWorksheet("غير مرتبط - الرواتب")!;
    expect(String(linkedUnlinked.getCell("C2").value)).toContain("غير موجود");
    expect(linkedUnlinked.getCell("E2").value).toBe("7000");
  });

  it("reports its own progress and exports only the merged sheet when everything linked", async () => {
    const uploaded = fixture();
    uploaded.sheets[0].rows = [{ rowNumber: 2, cells: ["أحمد", "123456789"] }];
    uploaded.sheets[1].rows = [{ rowNumber: 2, cells: ["123456789", "5000"] }];
    uploaded.sheets[2].rows = [{ rowNumber: 2, cells: ["123456789", "900"] }];
    const built = buildSheetMerge(uploaded, {
      nationalIdColumn: 1,
      sheetNames: ["الرواتب", "الحوافز"],
    });
    const events: number[] = [];
    const workbook = await readBack(
      await exportSheetMergeWorkbook(built, (percent) => events.push(percent)),
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["الدمج"]);
    expect(events[0]).toBe(10);
    expect(events.at(-1)).toBe(90);
  });
});
