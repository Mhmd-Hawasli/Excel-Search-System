import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { cellValueText } from "@/lib/excel/cell-value";
import { normalizeStored } from "@/lib/normalization/arabic";
import { suggestNationalIdColumn } from "@/lib/sheet-merge/suggest";
import {
  SHEET_MERGE_MIN_SHEETS,
  type UploadInspection,
  type UploadSheetSummary,
  type UploadedSheet,
  type UploadedWorkbook,
} from "@/lib/sheet-merge/types";

/**
 * In-memory workbook reader for this section. The uploaded bytes are parsed
 * straight from the request buffer — nothing is written to disk and nothing
 * reaches the archive database.
 */

const PREVIEW_ROWS = 6;
const SAMPLE_ROWS = 40;
/** Lets the response stream flush and keeps the event loop responsive. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * قاعدة الرفع الثانية: إلغاء عامل التصفية من جميع الأعمدة والصفوف.
 *
 * Excel keeps filtered-out records as hidden rows, and Excel tables carry
 * their own auto-filter, so removing the filter definition alone would leave
 * part of the data unusable. Here every sheet is normalized: auto-filters and
 * tables are dropped and all hidden rows and columns are shown again. The
 * change stays in memory only.
 */
export function clearWorkbookFilters(workbook: ExcelJS.Workbook) {
  const removed = new Map<string, boolean>();
  for (const worksheet of workbook.worksheets) {
    const tables = worksheet.getTables() as unknown as ExcelJS.Table[];
    let changed = Boolean(worksheet.autoFilter) || tables.length > 0;

    worksheet.autoFilter = undefined;
    for (const table of tables) worksheet.removeTable(table.name);
    worksheet.eachRow((row) => {
      if (row.hidden) {
        row.hidden = false;
        changed = true;
      }
    });
    const columnCount = Math.max(worksheet.actualColumnCount, 0);
    for (let index = 1; index <= columnCount; index += 1) {
      const column = worksheet.getColumn(index);
      if (column.hidden) {
        column.hidden = false;
        changed = true;
      }
    }
    removed.set(worksheet.name, changed);
  }
  return removed;
}

/**
 * Headers of one sheet. Unlike the archive importer this does not reject
 * duplicate names: merged workbooks often repeat a title, and the exporter
 * renames duplicates the same way Excel does when building a table.
 */
export function sheetHeaders(worksheet: ExcelJS.Worksheet): string[] {
  const row = worksheet.getRow(1);
  const columnCount = Math.max(worksheet.actualColumnCount, row.cellCount);
  return Array.from(
    { length: columnCount },
    (_, index) => cellValueText(row.getCell(index + 1)).trim() || `عمود ${index + 1}`,
  );
}

export function sheetDataRows(
  worksheet: ExcelJS.Worksheet,
  headers: string[],
): UploadedSheet["rows"] {
  const rows: UploadedSheet["rows"] = [];
  // `rowCount` is the highest row index; `actualRowCount` only counts rows
  // that hold values, so it would drop every row after a blank one.
  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const cells = headers.map((_, index) => cellValueText(row.getCell(index + 1)));
    if (cells.every((value) => normalizeStored(value) === "")) continue;
    rows.push({ rowNumber: rowIndex, cells });
  }
  return rows;
}

export async function parseUploadedWorkbook(
  buffer: Buffer,
  originalFilename: string,
  onProgress?: (percent: number, detail: string | null) => void,
): Promise<UploadedWorkbook> {
  onProgress?.(20, "قراءة المصنف…");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error(
      "تعذر قراءة المصنف. إذا كان الملف بصيغة XLS القديمة فحوّله إلى XLSX ثم أعد المحاولة.",
    );
  }
  if (workbook.worksheets.length < SHEET_MERGE_MIN_SHEETS)
    throw new Error(
      `يجب أن يحتوي الملف على أكثر من صفحة واحدة ليتم الدمج — هذا الملف يحتوي على ${workbook.worksheets.length} صفحة فقط.`,
    );

  await tick();
  onProgress?.(35, "إلغاء عامل التصفية من الأعمدة والصفوف…");
  const filtersRemoved = clearWorkbookFilters(workbook);
  await tick();

  const sheets: UploadedSheet[] = [];
  for (const [index, worksheet] of workbook.worksheets.entries()) {
    onProgress?.(
      40 + Math.round(((index + 1) / workbook.worksheets.length) * 55),
      `قراءة الصفحة «${worksheet.name}» (${index + 1} من ${workbook.worksheets.length})…`,
    );
    const headers = sheetHeaders(worksheet);
    sheets.push({
      name: worksheet.name,
      hidden: worksheet.state !== "visible",
      headers,
      rows: sheetDataRows(worksheet, headers),
      filtersRemoved: filtersRemoved.get(worksheet.name) ?? false,
    });
    await tick();
  }

  return { id: randomUUID(), createdAt: Date.now(), originalFilename, sheets };
}

export function sheetSummary(sheet: UploadedSheet): UploadSheetSummary {
  const linkable = sheet.headers.length >= 2;
  return {
    name: sheet.name,
    hidden: sheet.hidden,
    rowCount: sheet.rows.length,
    columnCount: sheet.headers.length,
    firstColumnHeader: sheet.headers[0] ?? "—",
    filtersRemoved: sheet.filtersRemoved,
    linkable,
    reason: linkable
      ? null
      : "تحتوي الصفحة على عمود واحد فقط؛ يلزم الرقم الوطني في العمود الأول وعمود معلومات واحد على الأقل بعده.",
  };
}

/** Everything the wizard needs right after the upload. */
export function buildUploadInspection(uploaded: UploadedWorkbook): UploadInspection {
  const main = uploaded.sheets[0];
  const preview = main.rows.slice(0, PREVIEW_ROWS).map((row) => row.cells);
  return {
    uploadId: uploaded.id,
    originalFilename: uploaded.originalFilename,
    sheetCount: uploaded.sheets.length,
    sheets: uploaded.sheets.map(sheetSummary),
    main: {
      name: main.name,
      headers: main.headers,
      preview,
      rowCount: main.rows.length,
    },
    suggestion: suggestNationalIdColumn(
      main.headers,
      main.rows.slice(0, SAMPLE_ROWS).map((row) => row.cells),
    ),
  };
}
