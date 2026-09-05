import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { documentRows } from "@/lib/excel/document-rows";
import { workbookPath } from "@/lib/excel/workbook";
import type { UploadConfig } from "@/lib/excel/config";

/** Writes a workbook to the upload directory, creating the directory if needed. */
async function writeWorkbook(filePath: string, workbook: ExcelJS.Workbook) {
  await mkdir(dirname(filePath), { recursive: true });
  await workbook.xlsx.writeFile(filePath);
}

function configFor(token: string): UploadConfig {
  return {
    token,
    groupId: randomUUID(),
    name: "اختبار",
    description: "",
    originalFilename: "test.xlsx",
    sheetName: "Sheet1",
    sheetIndex: 1,
    totalRows: 2,
    columns: [
      { headerRaw: "الاسم", headerNormalized: "الاسم", columnIndex: 1, standardField: null, categoryId: null },
      { headerRaw: "الرقم", headerNormalized: "الرقم", columnIndex: 2, standardField: null, categoryId: null },
    ],
  } satisfies UploadConfig;
}

describe("document-model row fallback", () => {
  it("reads the selected sheet with plain string values", async () => {
    const token = randomUUID();
    const filePath = workbookPath(token);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["الاسم", "الرقم"]);
    sheet.addRow(["ليلى سمير حداد", "00123456789"]);
    sheet.addRow(["سامي حداد", "12345678901"]);
    await writeWorkbook(filePath, workbook);
    try {
      const rows = [];
      for await (const row of documentRows(configFor(token))) rows.push(row);
      expect(rows).toEqual([
        { rowIndex: 2, values: ["ليلى سمير حداد", "00123456789"] },
        { rowIndex: 3, values: ["سامي حداد", "12345678901"] },
      ]);
      for (const row of rows) {
        for (const value of row.values) expect(typeof value).toBe("string");
      }
    } finally {
      await unlink(filePath).catch(() => undefined);
    }
  });

  it("rejects an unknown sheet", async () => {
    const token = randomUUID();
    const filePath = workbookPath(token);
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1").addRow(["الاسم"]);
    await writeWorkbook(filePath, workbook);
    try {
      const config = { ...configFor(token), sheetName: "غير موجودة", sheetIndex: 99 };
      await expect(async () => {
        for await (const row of documentRows(config)) void row;
      }).rejects.toThrow("الورقة المحددة غير موجودة");
    } finally {
      await unlink(filePath).catch(() => undefined);
    }
  });
});
