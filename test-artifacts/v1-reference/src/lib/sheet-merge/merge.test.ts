import { describe, expect, it } from "vitest";
import { buildSheetMerge, resolveLinkedSheets } from "@/lib/sheet-merge/merge";
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
        headers: ["الاسم", "الرقم الوطني", "المدينة"],
        rows: [
          { rowNumber: 2, cells: ["أحمد", "123456789", "دمشق"] },
          { rowNumber: 3, cells: ["ليلى", "٠٠٩٨٧٦٥٤٣٢١", "حلب"] },
          { rowNumber: 4, cells: ["سامي", "123", "حمص"] },
          { rowNumber: 5, cells: ["مروة", "123456789", "اللاذقية"] },
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
          { rowNumber: 4, cells: ["", "9000"] },
        ],
        filtersRemoved: true,
      },
      {
        name: "العناوين",
        hidden: false,
        headers: ["الرقم الوطني", "العنوان", "الهاتف"],
        rows: [{ rowNumber: 2, cells: ["987654321", "شارع النيل", "0999"] }],
        filtersRemoved: false,
      },
    ],
  };
}

describe("buildSheetMerge", () => {
  it("keeps the main sheet columns and appends each linked sheet without its id column", () => {
    const built = buildSheetMerge(fixture(), {
      nationalIdColumn: 1,
      sheetNames: ["الرواتب", "العناوين"],
    });

    expect(built.grid.headers).toEqual([
      "الاسم",
      "الرقم الوطني",
      "المدينة",
      "الراتب",
      "العنوان",
      "الهاتف",
    ]);
    expect(built.grid.rows).toHaveLength(4);
    expect(built.grid.rows[0]).toEqual(["أحمد", "123456789", "دمشق", "5000", "", ""]);
    expect(built.grid.rows[1]).toEqual(["ليلى", "٠٠٩٨٧٦٥٤٣٢١", "حلب", "", "شارع النيل", "0999"]);
    // Rows that could not be linked stay in the export with empty extra columns.
    expect(built.grid.rows[2]).toEqual(["سامي", "123", "حمص", "", "", ""]);
    expect(built.grid.rows[3]).toEqual(["مروة", "123456789", "اللاذقية", "", "", ""]);
    expect(built.stats.exportHeaders).toEqual(built.grid.headers);
    expect(built.stats.exportRowCount).toBe(4);
  });

  it("reports row counts, link percentages and the unlinked values of every sheet", () => {
    const built = buildSheetMerge(fixture(), {
      nationalIdColumn: 1,
      sheetNames: ["الرواتب", "العناوين"],
    });
    const [main, salaries, addresses] = built.stats.sheets;

    expect(main.role).toBe("main");
    expect(main.rowCount).toBe(4);
    expect(main.validKeyCount).toBe(2);
    expect(main.invalidCount).toBe(1);
    expect(main.duplicateCount).toBe(1);
    expect(main.linkedCount).toBe(2);
    expect(main.percent).toBe(50);
    expect(main.unlinkedTotal).toBe(2);
    expect(main.unlinked.map((row) => row.rowNumber)).toEqual([4, 5]);
    expect(main.unlinked[0].reason).toContain("7 محارف");
    expect(main.unlinked[1].reason).toContain("مكرر");
    expect(main.unlinked[1].cells).toEqual(["مروة", "123456789", "اللاذقية"]);
    expect(main.unlinkedHeaders).toEqual(["الاسم", "الرقم الوطني", "المدينة"]);

    expect(salaries.role).toBe("linked");
    expect(salaries.sheetName).toBe("الرواتب");
    expect(salaries.rowCount).toBe(3);
    expect(salaries.linkedCount).toBe(1);
    expect(salaries.percent).toBe(33.3);
    expect(salaries.invalidCount).toBe(1);
    expect(salaries.missingCount).toBe(1);
    expect(salaries.headers).toEqual(["الراتب"]);
    expect(salaries.unlinked.map((row) => row.reason)).toEqual([
      expect.stringContaining("غير موجود في الصفحة الرئيسية"),
      expect.stringContaining("فارغ"),
    ]);

    expect(addresses.linkedCount).toBe(1);
    expect(addresses.percent).toBe(100);
    expect(addresses.unlinkedTotal).toBe(0);

    // Weighted percentage across the linked sheets: 2 linked of 4 rows.
    expect(built.stats.linkPercent).toBe(50);
  });

  it("exports in workbook order whatever the selection order was", () => {
    const built = buildSheetMerge(fixture(), {
      nationalIdColumn: 1,
      sheetNames: ["العناوين", "الرواتب"],
    });
    expect(built.stats.sheets.map((sheet) => sheet.sheetName)).toEqual([
      "الأساسية",
      "الرواتب",
      "العناوين",
    ]);
    expect(built.grid.headers.slice(3)).toEqual(["الراتب", "العنوان", "الهاتف"]);
  });

  it("collects the unlinked rows per sheet for the export", () => {
    const built = buildSheetMerge(fixture(), {
      nationalIdColumn: 1,
      sheetNames: ["الرواتب", "العناوين"],
    });
    expect(built.unlinkedSheets.map((sheet) => sheet.sheetName)).toEqual(["الأساسية", "الرواتب"]);
    expect(built.unlinkedSheets[0].headers).toEqual(["الاسم", "الرقم الوطني", "المدينة"]);
    expect(built.unlinkedSheets[1].headers).toEqual(["الرقم الوطني", "الراتب"]);
  });

  it("supports an unlimited number of linked sheets", () => {
    const uploaded = fixture();
    for (let index = 1; index <= 5; index += 1)
      uploaded.sheets.push({
        name: `إضافية ${index}`,
        hidden: false,
        headers: ["الرقم الوطني", `حقل ${index}`],
        rows: [{ rowNumber: 2, cells: ["123456789", `قيمة ${index}`] }],
        filtersRemoved: false,
      });
    const built = buildSheetMerge(uploaded, {
      nationalIdColumn: 1,
      sheetNames: uploaded.sheets.slice(1).map((sheet) => sheet.name),
    });
    expect(built.stats.sheets).toHaveLength(8);
    expect(built.grid.headers).toEqual([
      "الاسم",
      "الرقم الوطني",
      "المدينة",
      "الراتب",
      "العنوان",
      "الهاتف",
      "حقل 1",
      "حقل 2",
      "حقل 3",
      "حقل 4",
      "حقل 5",
    ]);
    expect(built.grid.rows[0].slice(6)).toEqual(["قيمة 1", "قيمة 2", "قيمة 3", "قيمة 4", "قيمة 5"]);
  });

  it("rejects an invalid configuration", () => {
    expect(() =>
      buildSheetMerge(fixture(), { nationalIdColumn: 9, sheetNames: ["الرواتب"] }),
    ).toThrow("اختر عمود الرقم الوطني");
    expect(() => buildSheetMerge(fixture(), { nationalIdColumn: 1, sheetNames: [] })).toThrow(
      "صفحة واحدة على الأقل",
    );
    expect(() =>
      buildSheetMerge(fixture(), { nationalIdColumn: 1, sheetNames: ["غير موجودة"] }),
    ).toThrow("غير موجودة في المصنف");
  });

  it("rejects a linked sheet without a data column after the id", () => {
    const uploaded = fixture();
    uploaded.sheets.push({
      name: "فارغة",
      hidden: false,
      headers: ["الرقم الوطني"],
      rows: [{ rowNumber: 2, cells: ["123456789"] }],
      filtersRemoved: false,
    });
    expect(() => resolveLinkedSheets(uploaded, ["فارغة"])).toThrow("عمود معلومات واحد على الأقل");
  });

  it("reports progress while linking each sheet", () => {
    const events: Array<{ percent: number; detail: string | null }> = [];
    buildSheetMerge(
      fixture(),
      { nationalIdColumn: 1, sheetNames: ["الرواتب", "العناوين"] },
      (percent, detail) => events.push({ percent, detail }),
    );
    expect(events.length).toBeGreaterThanOrEqual(5);
    expect(events.at(-1)!.percent).toBe(98);
    expect(events.some((event) => event.detail?.includes("الرواتب"))).toBe(true);
  });
});
