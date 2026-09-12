import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { cellValueText } from "@/lib/excel/cell-value";
import { extractRowFormats, type RowFormats } from "@/lib/excel/cell-style";
import { tableRangeForSheet } from "@/lib/excel/table-range";
import { headersForSheet } from "@/lib/excel/workbook";
import { normalizeStored } from "@/lib/normalization/arabic";
import type { MergeInspection } from "@/lib/merge/types";

/**
 * Isolated file storage for the merge section. Uploads live under
 * `tmp/merge` and are never written to the archive database. Tokens are
 * UUIDs, exactly like the workbook uploads, but in their own directory so
 * the two flows cannot collide.
 */
const MERGE_DIRECTORY = path.join(process.cwd(), "tmp", "merge");
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mergeFilePath(token: string) {
  if (!TOKEN_PATTERN.test(token)) throw new Error("رمز الملف غير صالح.");
  return path.join(MERGE_DIRECTORY, `${token}.xlsx`);
}

function inspectWorksheet(
  worksheet: ExcelJS.Worksheet,
  sheetName: string,
): MergeInspection["selected"] {
  // Live table bounds: merge uploads are never normalized (no filter/table
  // removal), so tables always survive until the run reads them.
  const table = tableRangeForSheet(worksheet);
  const headers = headersForSheet(worksheet, { onUncachedFormula: "empty", ...(table ? { table } : {}) });
  const preview: string[][] = [];
  const firstDataRow = table ? table.firstRow : 2;
  const lastDataRow = table ? table.lastRow : worksheet.actualRowCount;
  const firstCol = table ? table.firstCol : 1;
  const finalRow = Math.min(lastDataRow, firstDataRow + 5);
  for (let rowIndex = firstDataRow; rowIndex <= finalRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    preview.push(
      headers.map((_, index) => cellValueText(row.getCell(firstCol + index), { onUncachedFormula: "empty" })),
    );
  }
  return {
    sheetName,
    headers,
    preview,
    rowCount: Math.max(0, lastDataRow - firstDataRow + 1),
    columnCount: headers.length,
  };
}

export async function pruneStaleMergeFiles(maxAgeMs = 12 * 60 * 60 * 1000) {
  try {
    await mkdir(MERGE_DIRECTORY, { recursive: true });
    const cutoff = Date.now() - maxAgeMs;
    const entries = await readdir(MERGE_DIRECTORY);
    await Promise.all(
      entries
        .filter((entry) => /^[0-9a-f-]{36}\.xlsx$/i.test(entry))
        .map(async (entry) => {
          const fullPath = path.join(MERGE_DIRECTORY, entry);
          try {
            if ((await stat(fullPath)).mtimeMs < cutoff) await unlink(fullPath);
          } catch {
            // Already removed or locked; ignore.
          }
        }),
    );
  } catch {
    // Pruning must never break uploads.
  }
}

export async function saveAndInspectMergeFile(
  buffer: Buffer,
  originalFilename: string,
): Promise<MergeInspection> {
  const token = randomUUID();
  await mkdir(MERGE_DIRECTORY, { recursive: true });
  await pruneStaleMergeFiles();
  await writeFile(mergeFilePath(token), buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(mergeFilePath(token));
  } catch {
    throw new Error(
      "تعذر قراءة المصنف. إذا كان الملف بصيغة XLS القديمة فحوّله إلى XLSX ثم أعد المحاولة.",
    );
  }
  if (!workbook.worksheets.length) throw new Error("لا يحتوي المصنف على أي أوراق قابلة للقراءة.");
  const first = workbook.worksheets[0];
  return {
    token,
    originalFilename,
    sheets: workbook.worksheets.map((sheet) => {
      const table = tableRangeForSheet(sheet);
      return {
        name: sheet.name,
        rowCount: table
          ? Math.max(0, table.lastRow - table.firstRow + 1)
          : Math.max(0, sheet.actualRowCount - 1),
      };
    }),
    selected: inspectWorksheet(first, first.name),
  };
}

export async function inspectMergeSheet(token: string, sheetName: string) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(mergeFilePath(token));
  } catch {
    throw new Error("تعذر قراءة المصنف. يرجى إعادة رفع الملف.");
  }
  const worksheet = workbook.worksheets.find((sheet) => sheet.name === sheetName);
  if (!worksheet) throw new Error("الورقة المحددة غير موجودة في المصنف.");
  return inspectWorksheet(worksheet, worksheet.name);
}

/** Loads every data row of one sheet (header row skipped, blank rows skipped). */
export async function readMergeSheet(token: string, sheetName: string) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(mergeFilePath(token));
  } catch {
    throw new Error("تعذر قراءة المصنف. يرجى إعادة رفع الملف.");
  }
  const worksheet = workbook.worksheets.find((sheet) => sheet.name === sheetName);
  if (!worksheet) throw new Error("الورقة المحددة غير موجودة في المصنف.");
  const table = tableRangeForSheet(worksheet);
  const headers = headersForSheet(worksheet, { onUncachedFormula: "empty", ...(table ? { table } : {}) });
  const firstCol = table ? table.firstCol : 1;
  const firstDataRow = table ? table.firstRow : 2;
  const lastDataRow = table ? table.lastRow : worksheet.actualRowCount;
  const rows: Array<{ rowNumber: number; cells: string[]; formats?: RowFormats }> = [];
  for (let rowIndex = firstDataRow; rowIndex <= lastDataRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const cells = headers.map((_, index) =>
      cellValueText(row.getCell(firstCol + index), { onUncachedFormula: "empty" }),
    );
    if (cells.every((value) => normalizeStored(value) === "")) continue;
    rows.push({
      rowNumber: rowIndex,
      cells,
      formats: extractRowFormats(row, headers.length, firstCol),
    });
  }
  return { sheetName, headers, rows };
}
