import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { normalizeStored } from "@/lib/normalization/arabic";
import { suggestStandardField } from "@/lib/excel/standard-fields";
import type { SheetInspection, WorkbookInspection } from "@/lib/excel/types";

const UPLOAD_DIRECTORY = path.join(process.cwd(), "tmp", "uploads");
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function workbookPath(token: string) {
  if (!TOKEN_PATTERN.test(token)) throw new Error("رمز الملف غير صالح.");
  return path.join(UPLOAD_DIRECTORY, `${token}.xlsx`);
}

export function columnSignature(headers: string[]) {
  return createHash("sha256").update(headers.map(normalizeStored).join("\u001f")).digest("hex");
}

function headersForSheet(worksheet: ExcelJS.Worksheet) {
  const row = worksheet.getRow(1);
  const columnCount = Math.max(worksheet.actualColumnCount, row.cellCount);
  const headers = Array.from({ length: columnCount }, (_, index) => row.getCell(index + 1).text.trim() || `عمود ${index + 1}`);
  const normalized = headers.map(normalizeStored);
  const duplicates = normalized.filter((header, index) => header && normalized.indexOf(header) !== index);
  if (duplicates.length) throw new Error("تحتوي الورقة على أسماء أعمدة مكررة. يرجى جعل عناوين الصف الأول فريدة ثم رفع الملف من جديد.");
  return headers;
}

function inspectWorksheet(worksheet: ExcelJS.Worksheet, sheetIndex: number): SheetInspection {
  const headers = headersForSheet(worksheet);
  const preview: string[][] = [];
  const finalRow = Math.min(worksheet.actualRowCount, 21);
  for (let rowIndex = 2; rowIndex <= finalRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    preview.push(headers.map((_, index) => row.getCell(index + 1).text ?? ""));
  }
  return {
    sheetName: worksheet.name,
    sheetIndex,
    rowCount: Math.max(0, worksheet.actualRowCount - 1),
    columnCount: headers.length,
    columns: headers.map((headerRaw, index) => ({ headerRaw, headerNormalized: normalizeStored(headerRaw), columnIndex: index + 1, suggestedField: suggestStandardField(headerRaw) })),
    preview,
  };
}

async function loadWorkbook(token: string) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(workbookPath(token));
  } catch {
    throw new Error("تعذر قراءة المصنف. إذا كان الملف بصيغة XLS القديمة فحوّله إلى XLSX ثم أعد المحاولة.");
  }
  return workbook;
}

/**
 * Excel stores filtered-out records as hidden rows. Removing only the
 * auto-filter definition therefore leaves part of the data hidden. Normalize
 * every filtered sheet before it is inspected or consumed by the streaming
 * importer so all uploaded records are available.
 */
export function removeWorkbookFilters(workbook: ExcelJS.Workbook) {
  let changed = false;

  for (const worksheet of workbook.worksheets) {
    // Excel tables have their own auto-filter definition. The uploaded copy is
    // used only for import, so converting the tables to ordinary cell ranges
    // safely removes those filters while preserving their data and cell styles.
    const tables = worksheet.getTables() as unknown as ExcelJS.Table[];
    const hasFilter = Boolean(worksheet.autoFilter) || tables.length > 0;
    if (!hasFilter) continue;

    worksheet.autoFilter = undefined;
    for (const table of tables) worksheet.removeTable(table.name);
    worksheet.eachRow((row) => {
      if (row.hidden) row.hidden = false;
    });
    changed = true;
  }

  return changed;
}

export async function saveAndInspectWorkbook(buffer: Buffer, originalFilename: string): Promise<WorkbookInspection> {
  const token = randomUUID();
  await mkdir(UPLOAD_DIRECTORY, { recursive: true });
  await writeFile(workbookPath(token), buffer);
  const workbook = await loadWorkbook(token);
  if (!workbook.worksheets.length) throw new Error("لا يحتوي المصنف على أي أوراق قابلة للقراءة.");
  if (removeWorkbookFilters(workbook)) await workbook.xlsx.writeFile(workbookPath(token));
  const selected = inspectWorksheet(workbook.worksheets[0], 1);
  return { token, originalFilename, sheets: workbook.worksheets.map((sheet) => ({ name: sheet.name, rowCount: Math.max(0, sheet.actualRowCount - 1) })), selected };
}

export async function inspectSavedSheet(token: string, sheetName: string) {
  const workbook = await loadWorkbook(token);
  const sheetIndex = workbook.worksheets.findIndex((sheet) => sheet.name === sheetName);
  const worksheet = workbook.worksheets[sheetIndex];
  if (!worksheet) throw new Error("الورقة المحددة غير موجودة في المصنف.");
  return inspectWorksheet(worksheet, sheetIndex + 1);
}
