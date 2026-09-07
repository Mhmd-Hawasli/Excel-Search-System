import ExcelJS from "exceljs";
import { applyRowFormats, THIN_CELL_BORDER, type RowFormats } from "@/lib/excel/cell-style";
import { uniqueTableColumnNames } from "@/lib/excel/table-columns";
import { parseStoredDate } from "@/lib/format/date";
import { MERGE_KEY_HEADER, MERGE_SHEET_NAMES, type MergeRow } from "@/lib/merge/types";

/**
 * Exports the merge result as one workbook with three sheets:
 *
 * 1. "الدمج الكامل" — one row per linked pair (left cells + right cells side
 *    by side), followed by the unlinked rows of each table with a blank
 *    counterpart. Columns: link key, then every column of table A renamed as
 *    `A_<header>` and every column of table B renamed as `B_<header>`.
 * 2. "الجدول A" — all rows of the first table with the link key first.
 * 3. "الجدول B" — all rows of the second table with the link key first.
 *
 * Every sheet is sorted by the link key (unlinked rows last, keeping their
 * original order). Visual formatting matches the rest of the system: blue
 * Table Style Light 9, right-to-left views, fit-content column widths and
 * 30pt rows.
 */

const TABLE_THEME = "TableStyleLight9";
const ROW_HEIGHT_POINTS = 30;
const MAX_COLUMN_WIDTH = 200 / 7;
const MIN_COLUMN_WIDTH = 10;
const DATE_NUMBER_FORMAT = "DD/MM/YYYY";

function displayLength(value: string | number | Date): number {
  const text = value instanceof Date ? "31/12/2025" : String(value);
  let length = 0;
  for (const char of text) {
    length += char.charCodeAt(0) > 255 ? 1.6 : 1;
  }
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
  // on large tables (millions of cell styles otherwise). Borders must touch
  // every cell ("all borders"), so they are painted per cell in the row loop.
  for (let rowIndex = 1; rowIndex <= rowCount + 1; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    row.height = ROW_HEIGHT_POINTS;
    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex++) {
      row.getCell(columnIndex).border = THIN_CELL_BORDER;
    }
  }
  for (let columnIndex = 1; columnIndex <= columnCount; columnIndex++) {
    sheet.getColumn(columnIndex).alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  }
}

/**
 * Excel opens files with a repair warning ("Repaired Records: Table ...")
 * whenever a table contains blank or repeated column names — and line breaks
 * inside a column name break the table as well (proven with a diagnostic
 * workbook: only the sheet with `\n` headers was repaired). Source sheets
 * often have duplicate, empty or multi-line headers, so every table column
 * name is flattened to a single line, made non-blank and unique
 * (case-insensitively) the way Excel itself renames them when converting such
 * a range into a table.
 *
 * Shared implementation: `uniqueTableColumnNames` in `lib/excel/table-columns`.
 */

function writeTable(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  rows: Array<{ cells: string[]; formats: RowFormats | null }>,
) {
  const sheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  const exportHeaders = uniqueTableColumnNames(headers);
  const dateCells: Array<{ row: number; col: number }> = [];
  const exportRows: Array<Array<string | number | Date>> = rows.map(({ cells }, rowIndex) =>
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
    name: `MergeTable${workbook.worksheets.length}`,
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: TABLE_THEME, showRowStripes: false },
    columns: exportHeaders.map((header) => ({ name: header, filterButton: true })),
    rows: exportRows,
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  for (const { row, col } of dateCells) {
    sheet.getRow(row + 2).getCell(col + 1).numFmt = DATE_NUMBER_FORMAT;
  }
  // Source colors: row fill covers the whole exported row, font colors land
  // on their original columns (already expressed in export coordinates).
  rows.forEach(({ formats }, rowIndex) => {
    if (formats) applyRowFormats(sheet, rowIndex + 2, formats, exportHeaders.length);
  });
  applyColumnWidths(sheet, exportHeaders, exportRows);
  styleTableRange(sheet, exportRows.length, exportHeaders.length);
}

/** Prefixes every source header (`A_<header>`) so the two sides never collide. */
function prefixedHeaders(prefix: string, headers: string[]): string[] {
  return headers.map((header, index) =>
    `${prefix}_${header.trim() === "" ? `عمود ${index + 1}` : header}`,
  );
}

/**
 * Sorts exported grid rows by the link key (first cell, zero-padded numbers):
 * linked rows first in key order, unlinked rows last keeping their relative
 * order.
 */
function sortByLinkKey(rows: Array<{ cells: string[]; formats: RowFormats | null }>) {
  const linked = rows.filter((row) => row.cells[0] !== "");
  const unlinked = rows.filter((row) => row.cells[0] === "");
  linked.sort((a, b) => a.cells[0].localeCompare(b.cells[0], "en", { numeric: true }));
  return [...linked, ...unlinked];
}

/** Shifts a per-column map from source-column to export-column coordinates. */
function shiftedMap(
  values: Record<string, string> | undefined,
  offset: number,
): Record<string, string> {
  const shifted: Record<string, string> = {};
  if (!values) return shifted;
  for (const [key, argb] of Object.entries(values)) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0) shifted[String(index + offset)] = argb;
  }
  return shifted;
}

function combinedFormats(
  left: RowFormats | null | undefined,
  right: RowFormats | null | undefined,
  leftWidth: number,
): RowFormats | null {
  if (!left && !right) return null;
  return {
    fills: { ...shiftedMap(left?.fills, 1), ...shiftedMap(right?.fills, 1 + leftWidth) },
    fonts: { ...shiftedMap(left?.fonts, 1), ...shiftedMap(right?.fonts, 1 + leftWidth) },
  };
}

/**
 * Builds the "full merge" grid: linked pairs first (one row per key, left
 * cells followed by right cells), then the leftover rows of each side with a
 * blank counterpart. Formats travel per half: the link-key column stays
 * unformatted, the A half keeps the left row colors, the B half the right
 * row colors.
 */
function fullMergeGrid(
  left: { headers: string[]; rows: MergeRow[] },
  right: { headers: string[]; rows: MergeRow[] },
): { headers: string[]; rows: Array<{ cells: string[]; formats: RowFormats | null }> } {
  const headers = [
    MERGE_KEY_HEADER,
    ...prefixedHeaders("A", left.headers),
    ...prefixedHeaders("B", right.headers),
  ];
  const blankLeft = new Array<string>(left.headers.length).fill("");
  const blankRight = new Array<string>(right.headers.length).fill("");

  const rightByKey = new Map<string, MergeRow>();
  for (const row of right.rows) if (row.key && !rightByKey.has(row.key)) rightByKey.set(row.key, row);
  const consumedKeys = new Set<string>();
  const gridRows: Array<{ cells: string[]; formats: RowFormats | null }> = [];

  const linkedLeft = left.rows
    .filter((row) => row.key)
    .sort((a, b) => a.key!.localeCompare(b.key!, "en", { numeric: true }));
  for (const row of linkedLeft) {
    const partner = rightByKey.get(row.key!);
    if (partner) consumedKeys.add(row.key!);
    gridRows.push({
      cells: [row.key ?? "", ...row.cells, ...(partner ? partner.cells : blankRight)],
      formats: combinedFormats(row.formats, partner?.formats, left.headers.length),
    });
  }
  for (const row of left.rows.filter((row) => !row.key))
    gridRows.push({
      cells: ["", ...row.cells, ...blankRight],
      formats: combinedFormats(row.formats, undefined, left.headers.length),
    });
  for (const row of right.rows.filter((row) => !row.key || !consumedKeys.has(row.key)))
    gridRows.push({
      cells: ["", ...blankLeft, ...row.cells],
      formats: combinedFormats(undefined, row.formats, left.headers.length),
    });

  return { headers, rows: sortByLinkKey(gridRows) };
}

function singleTableGrid(table: { headers: string[]; rows: MergeRow[] }): {
  headers: string[];
  rows: Array<{ cells: string[]; formats: RowFormats | null }>;
} {
  return {
    headers: [MERGE_KEY_HEADER, ...table.headers],
    rows: sortByLinkKey(
      table.rows.map((row) => ({
        cells: [row.key ?? "", ...row.cells],
        formats: row.formats
          ? { fills: shiftedMap(row.formats.fills, 1), fonts: shiftedMap(row.formats.fonts, 1) }
          : null,
      })),
    ),
  };
}

export async function exportMergeWorkbook(
  left: { headers: string[]; rows: MergeRow[] },
  right: { headers: string[]; rows: MergeRow[] },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام أرشفة ملفات الإكسل";
  workbook.created = new Date();
  const full = fullMergeGrid(left, right);
  writeTable(workbook, MERGE_SHEET_NAMES[0], full.headers, full.rows);
  const tableA = singleTableGrid(left);
  writeTable(workbook, MERGE_SHEET_NAMES[1], tableA.headers, tableA.rows);
  const tableB = singleTableGrid(right);
  writeTable(workbook, MERGE_SHEET_NAMES[2], tableB.headers, tableB.rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
