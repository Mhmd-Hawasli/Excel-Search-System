import ExcelJS from "exceljs";
import { applyRowFormats, THIN_CELL_BORDER, type RowFormats } from "@/lib/excel/cell-style";
import { uniqueTableColumnNames } from "@/lib/excel/table-columns";
import { parseStoredDate } from "@/lib/format/date";
import type { BuiltSheetMerge } from "@/lib/sheet-merge/merge";
import { MERGED_SHEET_NAME, UNLINKED_SHEET_PREFIX } from "@/lib/sheet-merge/types";

/**
 * Exports the merged sheets as one workbook, using exactly the same visual
 * format as every other Excel export in the system: blue Table Style Light 9,
 * right-to-left views, fit-content column widths, 30pt rows, real dates and
 * Excel-safe unique column names.
 *
 * Sheet "الدمج": columns of the first sheet, then the columns of the second
 * sheet without its first column (the national id), then the third sheet
 * without its first column, and so on.
 *
 * Then one sheet per source sheet that had rows which could not be linked, so
 * no value is silently lost.
 */

const TABLE_THEME = "TableStyleLight9";
const ROW_HEIGHT_POINTS = 30;
const MAX_COLUMN_WIDTH = 200 / 7;
const MIN_COLUMN_WIDTH = 10;
const DATE_NUMBER_FORMAT = "DD/MM/YYYY";
const REASON_HEADER = "سبب التعذر";
const ROW_NUMBER_HEADER = "رقم الصف";
const SHEET_NAME_HEADER = "الصفحة";

function displayLength(value: string | number | Date): number {
  const text = value instanceof Date ? "31/12/2025" : String(value);
  let length = 0;
  for (const char of text) length += char.charCodeAt(0) > 255 ? 1.6 : 1;
  return length;
}

function applyColumnWidths(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  rows: Array<Array<string | number | Date>>,
) {
  headers.forEach((header, columnIndex) => {
    let longest = displayLength(header);
    for (const row of rows) {
      const cell = row[columnIndex];
      if (cell === "" || cell == null) continue;
      const length = displayLength(cell);
      if (length > longest) longest = length;
    }
    sheet.getColumn(columnIndex + 1).width = Math.min(
      MAX_COLUMN_WIDTH,
      Math.max(MIN_COLUMN_WIDTH, longest + 2),
    );
  });
}

function styleTableRange(sheet: ExcelJS.Worksheet, rowCount: number, columnCount: number) {
  // Row heights stay per-row, but alignment is applied once per column
  // instead of once per cell: identical rendering at a fraction of the cost
  // on large tables. Borders must touch every cell ("all borders"), so they
  // are painted per cell in the row loop.
  for (let rowIndex = 1; rowIndex <= rowCount + 1; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    row.height = ROW_HEIGHT_POINTS;
    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex++) {
      row.getCell(columnIndex).border = THIN_CELL_BORDER;
    }
  }
  for (let columnIndex = 1; columnIndex <= columnCount; columnIndex++)
    sheet.getColumn(columnIndex).alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
}

/**
 * Excel shows a repair warning when a table has blank or repeated column
 * names, so every name is flattened to one line, made non-blank and unique —
 * the way Excel itself renames them. Source sheets merged side by side often
 * repeat a title ("الاسم الثلاثي" in three sheets), which is handled here.
 *
 * Shared implementation: `uniqueTableColumnNames` in `lib/excel/table-columns`.
 */

/** Excel forbids `[ ] : * ? / \` and names longer than 31 characters. */
function safeSheetName(name: string, taken: Set<string>) {
  let candidate = name.replace(/[[\]:*?/\\]/g, "-").trim() || UNLINKED_SHEET_PREFIX;
  if (candidate.length > 31) candidate = candidate.slice(0, 31);
  let suffix = 2;
  const base = candidate;
  while (taken.has(candidate.toLowerCase())) {
    const tail = ` (${suffix})`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

function writeTable(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  tableIndex: number,
  headers: string[],
  stringRows: string[][],
  rowFormats?: (RowFormats | null)[],
) {
  const sheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  const exportHeaders = uniqueTableColumnNames(headers);
  const dateCells: Array<{ row: number; col: number }> = [];
  const exportRows: Array<Array<string | number | Date>> = stringRows.map((cells, rowIndex) =>
    cells.map((cell, colIndex) => {
      const parsed = cell ? parseStoredDate(cell) : null;
      if (parsed) {
        dateCells.push({ row: rowIndex, col: colIndex });
        return parsed;
      }
      return cell;
    }),
  );

  sheet.addTable({
    name: `SheetMergeTable${tableIndex}`,
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: TABLE_THEME, showRowStripes: false },
    columns: exportHeaders.map((header) => ({ name: header, filterButton: true })),
    rows: exportRows,
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  for (const { row, col } of dateCells)
    sheet.getRow(row + 2).getCell(col + 1).numFmt = DATE_NUMBER_FORMAT;
  // Source colors travel with the rows (already in export coordinates).
  if (rowFormats) {
    rowFormats.forEach((formats, rowIndex) => {
      if (formats) applyRowFormats(sheet, rowIndex + 2, formats, exportHeaders.length);
    });
  }
  applyColumnWidths(sheet, exportHeaders, exportRows);
  styleTableRange(sheet, exportRows.length, exportHeaders.length);
}

export type SheetMergeExportProgress = (percent: number, detail: string | null) => void;

export async function exportSheetMergeWorkbook(
  merge: BuiltSheetMerge,
  onProgress?: SheetMergeExportProgress,
): Promise<Buffer> {
  onProgress?.(10, "تجهيز أعمدة الصفحات المدموجة…");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام أرشفة ملفات الإكسل";
  workbook.created = new Date();

  onProgress?.(25, `كتابة صفحة «${MERGED_SHEET_NAME}»…`);
  const taken = new Set<string>();
  writeTable(
    workbook,
    safeSheetName(MERGED_SHEET_NAME, taken),
    1,
    merge.grid.headers,
    merge.grid.rows,
    merge.formats,
  );

  const unlinkedTotal = merge.unlinkedSheets.length;
  for (const [index, sheet] of merge.unlinkedSheets.entries()) {
    onProgress?.(
      30 + Math.round(((index + 1) / unlinkedTotal) * 55),
      `كتابة الصفوف غير المرتبطة في «${sheet.sheetName}»…`,
    );
    // Source fills and fonts shift right by 3, behind the sheet/row/reason
    // prefix columns (which stay unformatted).
    const rowFormats = sheet.rows.map((row) => {
      if (!row.formats) return null;
      const shift = (values: Record<string, string>) =>
        Object.fromEntries(
          Object.entries(values)
            .map(([key, argb]) => [String(Number(key) + 3), argb] as const)
            .filter(([key]) => Number.isInteger(Number(key))),
        );
      return { fills: shift(row.formats.fills), fonts: shift(row.formats.fonts) };
    });
    writeTable(
      workbook,
      safeSheetName(`${UNLINKED_SHEET_PREFIX} - ${sheet.sheetName}`, taken),
      index + 2,
      [SHEET_NAME_HEADER, ROW_NUMBER_HEADER, REASON_HEADER, ...sheet.headers],
      sheet.rows.map((row) => [sheet.sheetName, String(row.rowNumber), row.reason, ...row.cells]),
      rowFormats,
    );
  }

  onProgress?.(90, "حفظ ملف Excel…");
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
