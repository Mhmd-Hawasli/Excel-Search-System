import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { extractRowFormats, type RowFormats } from "@/lib/excel/cell-style";
import { tableRangeForSheet, type SheetTableRange } from "@/lib/excel/table-range";
import { normalizeStored } from "@/lib/normalization/arabic";
import { suggestStandardField } from "@/lib/excel/standard-fields";
import type { SheetInspection, WorkbookInspection } from "@/lib/excel/types";
import { cellValueText } from "@/lib/excel/cell-value";

const UPLOAD_DIRECTORY = path.join(process.cwd(), "tmp", "uploads");
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function workbookPath(token: string) {
  if (!TOKEN_PATTERN.test(token)) throw new Error("رمز الملف غير صالح.");
  return path.join(UPLOAD_DIRECTORY, `${token}.xlsx`);
}

/**
 * Compact formatting sidecar written at inspection time: the inspection
 * already parses the whole workbook, so extracting colors then costs only
 * iteration — the import itself (streaming or document) never re-parses for
 * styles. Only rows carrying at least one color are stored.
 */
export type FormatSidecar = {
  version: 1;
  order: string[];
  sheets: Record<string, Record<string, RowFormats>>;
  /** Active Excel Table per sheet (null = plain sheet, import everything). */
  tables: Record<string, SheetTableRange | null>;
};

export function formatSidecarPath(token: string) {
  if (!TOKEN_PATTERN.test(token)) throw new Error("رمز الملف غير صالح.");
  return path.join(UPLOAD_DIRECTORY, `${token}.styles.json`);
}

/** Pure extraction of every sheet's row formats (no I/O, unit-testable). */
export function extractWorkbookFormats(workbook: ExcelJS.Workbook): {
  order: string[];
  sheets: Record<string, Record<string, RowFormats>>;
  tables: Record<string, SheetTableRange | null>;
} {
  const sheets: Record<string, Record<string, RowFormats>> = {};
  const tables: Record<string, SheetTableRange | null> = {};
  const order: string[] = [];
  for (const worksheet of workbook.worksheets) {
    order.push(worksheet.name);
    tables[worksheet.name] = tableRangeForSheet(worksheet);
    const table = tables[worksheet.name];
    const firstCol = table ? table.firstCol : 1;
    const width = table
      ? table.lastCol - table.firstCol + 1
      : Math.max(worksheet.columnCount, 1);
    const last = Math.max(worksheet.actualRowCount, 1);
    const rows: Record<string, RowFormats> = {};
    for (let rowIndex = 2; rowIndex <= last; rowIndex += 1) {
      const formats = extractRowFormats(worksheet.getRow(rowIndex), width, firstCol);
      if (Object.keys(formats.fills).length > 0 || Object.keys(formats.fonts).length > 0)
        rows[String(rowIndex)] = formats;
    }
    sheets[worksheet.name] = rows;
  }
  return { order, sheets, tables };
}

export async function writeFormatSidecar(token: string, workbook: ExcelJS.Workbook) {
  try {
    await writeFile(
      formatSidecarPath(token),
      JSON.stringify({ version: 1, ...extractWorkbookFormats(workbook) }),
    );
  } catch {
    // Styles are best-effort; the import works without them.
  }
}

export async function readFormatSidecar(token: string): Promise<FormatSidecar | null> {
  try {
    const parsed = JSON.parse(await readFile(formatSidecarPath(token), "utf8")) as FormatSidecar;
    if (!parsed || parsed.version !== 1 || typeof parsed.sheets !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Row formats of one Excel row of the selected sheet (name, else index fallback). */
export function sidecarRowFormats(
  sidecar: FormatSidecar | null,
  sheetName: string | undefined,
  sheetIndex: number,
  rowIndex: number,
): RowFormats | null {
  if (!sidecar) return null;
  const name =
    (sheetName && sidecar.sheets[sheetName] ? sheetName : undefined) ??
    sidecar.order[sheetIndex - 1];
  if (!name) return null;
  return sidecar.sheets[name]?.[String(rowIndex)] ?? null;
}

/** Active table of the selected sheet (null = plain sheet, import everything). */
export function sidecarTableRange(
  sidecar: FormatSidecar | null,
  sheetName: string | undefined,
  sheetIndex: number,
): SheetTableRange | null {
  if (!sidecar) return null;
  const name =
    (sheetName && sidecar.sheets[sheetName] ? sheetName : undefined) ??
    sidecar.order[sheetIndex - 1];
  if (!name) return null;
  return sidecar.tables?.[name] ?? null;
}

export async function removeFormatSidecar(token: string) {
  try {
    await unlink(formatSidecarPath(token));
  } catch {
    // Already removed; ignore.
  }
}

export function columnSignature(headers: string[]) {
  return createHash("sha256").update(headers.map(normalizeStored).join("\u001f")).digest("hex");
}

export function headersForSheet(
  worksheet: ExcelJS.Worksheet,
  options?: { onUncachedFormula?: "throw" | "empty"; table?: SheetTableRange | null },
) {
  const table = options?.table ?? null;
  const headerRow = table ? table.headerRow : 1;
  const firstCol = table ? table.firstCol : 1;
  const row = worksheet.getRow(headerRow);
  const columnCount = table
    ? table.lastCol - table.firstCol + 1
    : Math.max(worksheet.actualColumnCount, row.cellCount);
  const headers = Array.from({ length: columnCount }, (_, index) =>
    cellValueText(row.getCell(firstCol + index), options).trim() || `عمود ${index + 1}`,
  );
  const normalized = headers.map(normalizeStored);
  const duplicates = normalized.filter((header, index) => header && normalized.indexOf(header) !== index);
  if (duplicates.length) throw new Error("تحتوي الورقة على أسماء أعمدة مكررة. يرجى جعل عناوين الصف الأول فريدة ثم رفع الملف من جديد.");
  return headers;
}

function inspectWorksheet(
  worksheet: ExcelJS.Worksheet,
  sheetIndex: number,
  table?: SheetTableRange | null,
): SheetInspection {
  const headers = headersForSheet(worksheet, table ? { table } : undefined);
  const preview: string[][] = [];
  const firstDataRow = table ? table.firstRow : 2;
  const lastDataRow = table
    ? table.lastRow
    : worksheet.actualRowCount;
  const finalRow = Math.min(lastDataRow, firstDataRow + 19);
  for (let rowIndex = firstDataRow; rowIndex <= finalRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    preview.push(
      headers.map((_, index) =>
        cellValueText(row.getCell((table ? table.firstCol : 1) + index)),
      ),
    );
  }
  return {
    sheetName: worksheet.name,
    sheetIndex,
    rowCount: Math.max(0, lastDataRow - firstDataRow + 1),
    columnCount: headers.length,
    columns: headers.map((headerRaw, index) => ({ headerRaw, headerNormalized: normalizeStored(headerRaw), columnIndex: index + 1, suggestedField: suggestStandardField(headerRaw) })),
    preview,
  };
}

export async function loadWorkbook(token: string) {
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

/**
 * Best-effort removal of orphaned upload workbooks. The import worker deletes
 * its token file when it finishes, but on Windows the delete can fail while
 * the streaming reader still holds the file, so leftovers accumulate.
 * Only UUID-named .xlsx files older than a day are removed; an active wizard
 * session always references a fresh token.
 */
export async function pruneStaleUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    await mkdir(UPLOAD_DIRECTORY, { recursive: true });
    const cutoff = Date.now() - maxAgeMs;
    const entries = await readdir(UPLOAD_DIRECTORY);
  await Promise.all(
    entries
      .filter((entry) => /^[0-9a-f-]{36}\.xlsx$/i.test(entry))
      .map(async (entry) => {
        const fullPath = path.join(UPLOAD_DIRECTORY, entry);
        try {
          if ((await stat(fullPath)).mtimeMs < cutoff) {
            await unlink(fullPath);
            await removeFormatSidecar(entry.slice(0, 36));
          }
        } catch {
          // Locked or already removed; leave it for the next pass.
        }
      }),
  );
  } catch {
    // Pruning must never break an upload.
  }
}

export async function saveAndInspectWorkbook(buffer: Buffer, originalFilename: string): Promise<WorkbookInspection> {
  const token = randomUUID();
  await mkdir(UPLOAD_DIRECTORY, { recursive: true });
  await pruneStaleUploads();
  await writeFile(workbookPath(token), buffer);
  const workbook = await loadWorkbook(token);
  if (!workbook.worksheets.length) throw new Error("لا يحتوي المصنف على أي أوراق قابلة للقراءة.");
  const first = workbook.worksheets[0];
  const table = tableRangeForSheet(first);
  await writeFormatSidecar(token, workbook);
  if (removeWorkbookFilters(workbook)) await workbook.xlsx.writeFile(workbookPath(token));
  const selected = inspectWorksheet(first, 1, table);
  return { token, originalFilename, sheets: workbook.worksheets.map((sheet) => ({ name: sheet.name, rowCount: Math.max(0, sheet.actualRowCount - 1) })), selected };
}

export async function inspectSavedSheet(token: string, sheetName: string) {
  const workbook = await loadWorkbook(token);
  const sheetIndex = workbook.worksheets.findIndex((sheet) => sheet.name === sheetName);
  const worksheet = workbook.worksheets[sheetIndex];
  if (!worksheet) throw new Error("الورقة المحددة غير موجودة في المصنف.");
  // The saved file may already be normalized (tables converted), so bounds
  // always resolve from the sidecar captured at upload time.
  const sidecar = await readFormatSidecar(token);
  return inspectWorksheet(worksheet, sheetIndex + 1, sidecarTableRange(sidecar, worksheet.name, sheetIndex + 1));
}
