import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { cellValueText } from "@/lib/excel/cell-value";
import { headersForSheet, removeWorkbookFilters } from "@/lib/excel/workbook";
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

function rowCount(worksheet: ExcelJS.Worksheet) {
  return Math.max(0, worksheet.actualRowCount - 1);
}

function inspectWorksheet(
  worksheet: ExcelJS.Worksheet,
  sheetName: string,
): MergeInspection["selected"] {
  const headers = headersForSheet(worksheet);
  const preview: string[][] = [];
  const finalRow = Math.min(worksheet.actualRowCount, 7);
  for (let rowIndex = 2; rowIndex <= finalRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    preview.push(headers.map((_, index) => cellValueText(row.getCell(index + 1))));
  }
  return {
    sheetName,
    headers,
    preview,
    rowCount: rowCount(worksheet),
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
  if (removeWorkbookFilters(workbook)) await workbook.xlsx.writeFile(mergeFilePath(token));
  const first = workbook.worksheets[0];
  return {
    token,
    originalFilename,
    sheets: workbook.worksheets.map((sheet) => ({
      name: sheet.name,
      rowCount: rowCount(sheet),
    })),
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
  const headers = headersForSheet(worksheet);
  const rows: Array<{ rowNumber: number; cells: string[] }> = [];
  for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const cells = headers.map((_, index) => cellValueText(row.getCell(index + 1)));
    if (cells.every((value) => normalizeStored(value) === "")) continue;
    rows.push({ rowNumber: rowIndex, cells });
  }
  return { sheetName, headers, rows };
}
