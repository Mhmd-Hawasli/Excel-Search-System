import { unlink } from "node:fs/promises";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { mergeLinkedSheets, loadLinkedSheets, type ImportRow } from "@/lib/excel/linked-sheets";
import { importRows } from "@/lib/excel/import-rows";
import { recordInput } from "@/lib/excel/import-worker";
import { saveAndInspectWorkbook, workbookPath } from "@/lib/excel/workbook";
import { ensureUniqueStandardFields } from "@/lib/excel/mapping";
import { linkedMappingError, type UploadConfig } from "@/lib/excel/config";

const tokens: string[] = [];
afterEach(async () => {
  for (const token of tokens.splice(0)) await unlink(workbookPath(token));
});

function fixture() {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("الأساسية").addRows([
    ["الاسم الثلاثي", "الرقم الوطني", "اسم الأم"],
    ["أحمد علي سالم", "123456789", "مريم"],
    ["ليلى عمر سالم", "9876543210", "فاطمة"],
    ["عمر علي سالم", "11223344556", "مريم"],
  ]);
  workbook.addWorksheet("العمل").addRows([
    ["الرقم الوطني", "المسمى الوظيفي", "اسم الأم"],
    ["٠٩٨٧٦٥٤٣٢١٠", "محاسب", "فاطمة أخرى"],
    [" ٠٠١٢٣\u00a0٤٥٦\t٧٨٩ ", "مهندس", "مريم أخرى"],
  ]);
  workbook.addWorksheet("التواصل").addRows([
    ["الرقم الوطني", "رقم الهاتف", "المسمى الوظيفي"],
    [123456789, "0937000000", "رئيس قسم"],
  ]);
  return workbook;
}
const linking = { sheetNames: ["العمل", "التواصل"], nationalIdColumnIndex: 2 };

describe("linked workbook sheets", () => {
  it("accepts internal formula results as national IDs and explains an incorrect cached result", () => {
    const workbook = fixture();
    const cell = workbook.getWorksheet("العمل")!.getCell("A3");
    cell.value = { formula: "_xlfn.XLOOKUP(C3,الأساسية!B:B,الأساسية!B:B)", result: 123456789 };
    expect(mergeLinkedSheets(workbook, linking).rows[0].values[3]).toBe("مهندس");
    cell.value = { formula: "_xlfn.XLOOKUP(C3,الأساسية!B:B,الأساسية!A:A)", result: 1 };
    expect(() => mergeLinkedSheets(workbook, linking)).toThrow(/نتيجة المعادلة.*«1»/);
  });
  it("joins any selected sheets by canonical national ID, preserves primary order and disambiguates headers", () => {
    const result = mergeLinkedSheets(fixture(), { ...linking, sheetNames: ["التواصل", "العمل"] });
    expect(result.inspection.columns.map((column) => column.headerRaw)).toEqual([
      "الاسم الثلاثي",
      "الرقم الوطني",
      "اسم الأم",
      "المسمى الوظيفي",
      "اسم الأم [العمل]",
      "رقم الهاتف",
      "المسمى الوظيفي [التواصل]",
    ]);
    expect(result.rows.map((row) => row.values)).toEqual([
      ["أحمد علي سالم", "123456789", "مريم", "مهندس", "مريم أخرى", "0937000000", "رئيس قسم"],
      ["ليلى عمر سالم", "9876543210", "فاطمة", "محاسب", "فاطمة أخرى", "", ""],
      ["عمر علي سالم", "11223344556", "مريم", "", "", "", ""],
    ]);
    expect(result.inspection.linkedSheets?.sheetNames).toEqual(["العمل", "التواصل"]);
    expect(result.inspection.linkedSummary).toEqual([
      { sheetName: "العمل", matchedRows: 2, missingRows: 1 },
      { sheetName: "التواصل", matchedRows: 1, missingRows: 2 },
    ]);
    expect(result.rows.map((row) => row.rowIndex)).toEqual([2, 3, 4]);
  });

  it("scans supplementary rows beyond the preview and preserves sparse primary row numbers", () => {
    const workbook = fixture();
    workbook.getWorksheet("العمل")!.getRow(35).values = [11223344556, "مدير", "مريم"];
    workbook.getWorksheet("الأساسية")!.getRow(40).values = ["بلا ارتباط", "1234", "أم"];
    const result = mergeLinkedSheets(workbook, linking);
    expect(result.rows[2].values[3]).toBe("مدير");
    expect(result.rows[3].rowIndex).toBe(40);
    expect(result.rows[3].values[1]).toBe("1234");
  });

  it("supports more than two supplemental sheets and ignores unselected sheets", () => {
    const workbook = fixture();
    for (let index = 0; index < 8; index++)
      workbook.addWorksheet(`ورقة ${index}`).addRows([
        ["مفتاح", `معلومة ${index}`],
        [123456789, `قيمة ${index}`],
      ]);
    workbook.addWorksheet("غير مختارة").addRows([
      ["مفتاح", "معلومة"],
      ["خطأ", "خطأ"],
    ]);
    const result = mergeLinkedSheets(workbook, {
      ...linking,
      sheetNames: [
        ...linking.sheetNames,
        ...Array.from({ length: 8 }, (_, index) => `ورقة ${index}`),
      ],
    });
    expect(result.inspection.linkedSummary).toHaveLength(10);
    expect(result.rows[0].values.at(-1)).toBe("قيمة 7");
  });

  it.each(["", "1234", "123456789012", "123456789A"])(
    "rejects an invalid supplemental key %s with its sheet and row",
    (value) => {
      const workbook = fixture();
      workbook.getWorksheet("العمل")!.getCell("A2").value = value;
      expect(() => mergeLinkedSheets(workbook, linking)).toThrow(/العمل.*الصف 2/);
    },
  );
  it("rejects orphan rows rather than silently dropping them", () => {
    const workbook = fixture();
    workbook.getWorksheet("العمل")!.getCell("A2").value = "55566677788";
    expect(() => mergeLinkedSheets(workbook, linking)).toThrow("غير موجود في الورقة الأساسية");
  });
  it.each(["الأساسية", "العمل"])("rejects ambiguous duplicate keys in %s", (name) => {
    const workbook = fixture();
    workbook
      .getWorksheet(name)!
      .addRow(
        name === "الأساسية" ? ["شخص آخر", "00123456789", "أم"] : ["00123456789", "آخر", "أم"],
      );
    expect(() => mergeLinkedSheets(workbook, linking)).toThrow(/مكرر في الصفين/);
  });
  it("skips wholly empty supplemental rows", () => {
    const workbook = fixture();
    workbook.getWorksheet("العمل")!.addRow([" \t", "", ""]);
    expect(mergeLinkedSheets(workbook, linking).inspection.linkedSummary?.[0].matchedRows).toBe(2);
  });
  it.each([
    { sheetNames: [], nationalIdColumnIndex: 2 },
    { sheetNames: ["العمل", "العمل"], nationalIdColumnIndex: 2 },
    { sheetNames: ["الأساسية"], nationalIdColumnIndex: 2 },
    { sheetNames: ["غير موجودة"], nationalIdColumnIndex: 2 },
    { sheetNames: ["العمل"], nationalIdColumnIndex: 9 },
  ])("rejects invalid linking configuration %#", (config) => {
    expect(() => mergeLinkedSheets(fixture(), config)).toThrow();
  });

  it("uses the same merged values in preview and import, including numeric storage and raw source cells", async () => {
    const saved = await saveAndInspectWorkbook(
      Buffer.from(await fixture().xlsx.writeBuffer()),
      "linked.xlsx",
    );
    tokens.push(saved.token);
    const { inspection } = await loadLinkedSheets(saved.token, linking);
    const config: UploadConfig = {
      token: saved.token,
      groupId: "2254b5b0-065d-4846-ab8a-d5f57f7655ab",
      name: "اختبار الربط",
      description: "",
      originalFilename: "linked.xlsx",
      sheetName: inspection.sheetName,
      sheetIndex: inspection.sheetIndex,
      totalRows: inspection.rowCount,
      linkedSheets: inspection.linkedSheets,
      columns: ensureUniqueStandardFields(
        inspection.columns.map((column) => ({
          ...column,
          standardField: column.suggestedField,
          categoryId: null,
        })),
        linking.nationalIdColumnIndex,
      ),
    };
    const imported: ImportRow[] = [];
    for await (const row of importRows(config)) imported.push(row);
    expect(imported.map((row) => row.values)).toEqual(inspection.preview);
    const input = recordInput(
      "file",
      imported[0].rowIndex,
      Object.fromEntries(
        config.columns.map((column) => [
          column.headerRaw,
          imported[0].values[column.columnIndex - 1],
        ]),
      ),
      config,
    );
    expect(input).toMatchObject({
      sfNationalId: 123456789n,
      dNationalId: "00123456789",
      sfPhone: "0937000000",
      sfMotherName: "مريم",
    });
    expect(input.data).toMatchObject({
      "اسم الأم [العمل]": "مريم أخرى",
      "المسمى الوظيفي [التواصل]": "رئيس قسم",
    });
    expect(
      linkedMappingError({
        ...config,
        columns: config.columns.map((column) => ({ ...column, standardField: null })),
      }),
    ).toBeTruthy();
    const stale = importRows({ ...config, columns: config.columns.slice(0, -1) });
    await expect(stale.next()).rejects.toThrow("أعد معاينة");
    const singleRows = [];
    for await (const row of importRows({
      ...config,
      linkedSheets: undefined,
      columns: config.columns.slice(0, 3),
    }))
      singleRows.push(row);
    expect(singleRows[0].values).toEqual(["أحمد علي سالم", "123456789", "مريم"]);
  });
});
