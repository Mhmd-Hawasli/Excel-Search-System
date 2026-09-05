import ExcelJS from "exceljs";
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
  // on large tables (millions of cell styles otherwise).
  for (let rowIndex = 1; rowIndex <= rowCount + 1; rowIndex++) {
    sheet.getRow(rowIndex).height = ROW_HEIGHT_POINTS;
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
 */
function uniqueTableColumnNames(headers: string[]): string[] {
  const used = new Map<string, number>();
  return headers.map((header, index) => {
    const flattened = header.replace(/[\r\n\t]+/g, " ");
    const base = flattened.trim() === "" ? `عمود ${index + 1}` : flattened;
    const count = used.get(base.toLowerCase()) ?? 0;
    used.set(base.toLowerCase(), count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function writeTable(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  stringRows: string[][],
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
function sortByLinkKey(stringRows: string[][]): string[][] {
  const linked = stringRows.filter((cells) => cells[0] !== "");
  const unlinked = stringRows.filter((cells) => cells[0] === "");
  linked.sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }));
  return [...linked, ...unlinked];
}

/**
 * Builds the "full merge" grid: linked pairs first (one row per key, left
 * cells followed by right cells), then the leftover rows of each side with a
 * blank counterpart.
 */
function fullMergeGrid(
  left: { headers: string[]; rows: MergeRow[] },
  right: { headers: string[]; rows: MergeRow[] },
): { headers: string[]; stringRows: string[][] } {
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
  const stringRows: string[][] = [];

  const linkedLeft = left.rows
    .filter((row) => row.key)
    .sort((a, b) => a.key!.localeCompare(b.key!, "en", { numeric: true }));
  for (const row of linkedLeft) {
    const partner = rightByKey.get(row.key!);
    if (partner) consumedKeys.add(row.key!);
    stringRows.push([row.key ?? "", ...row.cells, ...(partner ? partner.cells : blankRight)]);
  }
  for (const row of left.rows.filter((row) => !row.key))
    stringRows.push(["", ...row.cells, ...blankRight]);
  for (const row of right.rows.filter((row) => !row.key || !consumedKeys.has(row.key)))
    stringRows.push(["", ...blankLeft, ...row.cells]);

  return { headers, stringRows: sortByLinkKey(stringRows) };
}

function singleTableGrid(table: { headers: string[]; rows: MergeRow[] }): {
  headers: string[];
  stringRows: string[][];
} {
  return {
    headers: [MERGE_KEY_HEADER, ...table.headers],
    stringRows: sortByLinkKey(table.rows.map((row) => [row.key ?? "", ...row.cells])),
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
  writeTable(workbook, MERGE_SHEET_NAMES[0], full.headers, full.stringRows);
  const tableA = singleTableGrid(left);
  writeTable(workbook, MERGE_SHEET_NAMES[1], tableA.headers, tableA.stringRows);
  const tableB = singleTableGrid(right);
  writeTable(workbook, MERGE_SHEET_NAMES[2], tableB.headers, tableB.stringRows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
