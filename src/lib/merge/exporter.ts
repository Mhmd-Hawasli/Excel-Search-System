import ExcelJS from "exceljs";
import { THIN_CELL_BORDER } from "@/lib/excel/cell-style";
import { uniqueTableColumnNames } from "@/lib/excel/table-columns";
import { parseStoredDate } from "@/lib/format/date";
import {
  MERGE_CONFIRM_HEADER,
  MERGE_CONFIRMED_TEXT,
  MERGE_KEY_HEADER,
  MERGE_SHEET_NAMES,
  MERGE_UNCONFIRMED_TEXT,
  type MergeRow,
} from "@/lib/merge/types";

/**
 * Exports the merge result as one workbook with three sheets:
 *
 * 1. "الدمج الكامل" — one row per linked pair (left cells + right cells side
 *    by side), followed by the unlinked rows of each table with a blank
 *    counterpart (all-cases scope only).
 * 2. "الجدول A" — rows of the first table with the link key first.
 * 3. "الجدول B" — rows of the second table with the link key first.
 *
 * Two scopes:
 * - "confirmed" — linked (confirmed) rows only, link key first.
 * - "all" — every row, with the confirmation ("التأكد": مؤكد/غير مؤكد) as the
 *   SECOND column right after the link key.
 *
 * Source cell colors are deliberately ignored (fills/fonts from the uploaded
 * workbooks are never read): they dominate export time on large tables while
 * adding no information to a merge result. Only the workbook's own structural
 * styling (table theme, header, borders, widths, row heights) is applied.
 *
 * Every sheet is sorted by the link key (unlinked rows last, keeping their
 * original order).
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
  rows: Array<{ cells: string[] }>,
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
  applyColumnWidths(sheet, exportHeaders, exportRows);
  styleTableRange(sheet, exportRows.length, exportHeaders.length);
}

/** Prefixes every source header (`A_<header>`) so the two sides never collide. */
function prefixedHeaders(prefix: string, headers: string[]): string[] {
  return headers.map(
    (header, index) => `${prefix}_${header.trim() === "" ? `عمود ${index + 1}` : header}`,
  );
}

/**
 * Sorts exported grid rows by the link key (first cell, zero-padded numbers):
 * linked rows first in key order, unlinked rows last keeping their relative
 * order.
 */
function sortByLinkKey(rows: Array<{ cells: string[] }>) {
  const linked = rows.filter((row) => row.cells[0] !== "");
  const unlinked = rows.filter((row) => row.cells[0] === "");
  linked.sort((a, b) => a.cells[0].localeCompare(b.cells[0], "en", { numeric: true }));
  return [...linked, ...unlinked];
}

export type MergeExportScope = "confirmed" | "all";

function confirmText(row: MergeRow): string {
  return row.key && row.confirmed ? MERGE_CONFIRMED_TEXT : MERGE_UNCONFIRMED_TEXT;
}

/** Linked AND confirmed (relaxed sessions may carry linked-but-unconfirmed rows). */
function isConfirmedLink(row: MergeRow): boolean {
  return row.key !== null && row.confirmed;
}

/**
 * Builds the "full merge" grid: linked pairs first (one row per key, left
 * cells followed by right cells), then — in the "all" scope only — the
 * leftover rows of each side with a blank counterpart. In the "all" scope the
 * confirmation column sits second, right after the link key.
 */
function fullMergeGrid(
  left: { headers: string[]; rows: MergeRow[] },
  right: { headers: string[]; rows: MergeRow[] },
  scope: MergeExportScope,
): { headers: string[]; rows: Array<{ cells: string[] }> } {
  const headers =
    scope === "all"
      ? [
          MERGE_KEY_HEADER,
          MERGE_CONFIRM_HEADER,
          ...prefixedHeaders("A", left.headers),
          ...prefixedHeaders("B", right.headers),
        ]
      : [
          MERGE_KEY_HEADER,
          ...prefixedHeaders("A", left.headers),
          ...prefixedHeaders("B", right.headers),
        ];
  const blankLeft = new Array<string>(left.headers.length).fill("");
  const blankRight = new Array<string>(right.headers.length).fill("");
  const prefix = (row: MergeRow) =>
    scope === "all" ? [row.key ?? "", confirmText(row)] : [row.key ?? ""];

  // Confirmed scope pairs confirmed links only; the all scope pairs every
  // keyed row (confirmed or not) and appends the keyless leftovers.
  const pairEligible = (row: MergeRow) =>
    scope === "all" ? row.key !== null : isConfirmedLink(row);
  const rightByKey = new Map<string, MergeRow>();
  for (const row of right.rows)
    if (pairEligible(row) && !rightByKey.has(row.key!)) rightByKey.set(row.key!, row);
  const consumedKeys = new Set<string>();
  const gridRows: Array<{ cells: string[] }> = [];

  const linkedLeft = left.rows
    .filter((row) => pairEligible(row))
    .sort((a, b) => a.key!.localeCompare(b.key!, "en", { numeric: true }));
  for (const row of linkedLeft) {
    const partner = rightByKey.get(row.key!);
    if (partner) consumedKeys.add(row.key!);
    gridRows.push({
      cells: [...prefix(row), ...row.cells, ...(partner ? partner.cells : blankRight)],
    });
  }
  if (scope === "all") {
    for (const row of left.rows.filter((row) => !row.key))
      gridRows.push({ cells: [...prefix(row), ...row.cells, ...blankRight] });
    for (const row of right.rows.filter((row) => !row.key || !consumedKeys.has(row.key)))
      gridRows.push({ cells: [...prefix(row), ...blankLeft, ...row.cells] });
  }

  return { headers, rows: sortByLinkKey(gridRows) };
}

function singleTableGrid(
  table: { headers: string[]; rows: MergeRow[] },
  scope: MergeExportScope,
): {
  headers: string[];
  rows: Array<{ cells: string[] }>;
} {
  const rows = scope === "all" ? table.rows : table.rows.filter((row) => isConfirmedLink(row));
  return {
    headers:
      scope === "all"
        ? [MERGE_KEY_HEADER, MERGE_CONFIRM_HEADER, ...table.headers]
        : [MERGE_KEY_HEADER, ...table.headers],
    rows: sortByLinkKey(
      rows.map((row) => ({
        cells:
          scope === "all"
            ? [row.key ?? "", confirmText(row), ...row.cells]
            : [row.key ?? "", ...row.cells],
      })),
    ),
  };
}

export async function exportMergeWorkbook(
  left: { headers: string[]; rows: MergeRow[] },
  right: { headers: string[]; rows: MergeRow[] },
  scope: MergeExportScope = "confirmed",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام أرشفة ملفات الإكسل";
  workbook.created = new Date();
  const full = fullMergeGrid(left, right, scope);
  writeTable(workbook, MERGE_SHEET_NAMES[0], full.headers, full.rows);
  const tableA = singleTableGrid(left, scope);
  writeTable(workbook, MERGE_SHEET_NAMES[1], tableA.headers, tableA.rows);
  const tableB = singleTableGrid(right, scope);
  writeTable(workbook, MERGE_SHEET_NAMES[2], tableB.headers, tableB.rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
