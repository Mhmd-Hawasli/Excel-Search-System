import ExcelJS from "exceljs";
import { parseStoredDate } from "@/lib/format/date";
import { MERGE_KEY_HEADER, MERGE_SHEET_NAMES, type MergeRow } from "@/lib/merge/types";

/**
 * Exports the merge result as one workbook with two sheets (table 1, table 2),
 * using the same visual formatting as the rest of the system: blue Table Style
 * Light 9, right-to-left views, fit-content column widths and 30pt rows.
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
  for (let rowIndex = 1; rowIndex <= rowCount + 1; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    row.height = ROW_HEIGHT_POINTS;
    for (let columnIndex = 1; columnIndex <= columnCount; columnIndex++) {
      const cell = row.getCell(columnIndex);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    }
  }
}

function writeTable(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  rows: MergeRow[],
) {
  const sheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  const exportHeaders = [MERGE_KEY_HEADER, ...headers];
  const dateCells: Array<{ row: number; col: number }> = [];
  let currentRow = 0;
  const exportRows: Array<Array<string | number | Date>> = rows.map((row) => {
    const values: Array<string | number | Date> = [row.key ?? ""];
    row.cells.forEach((cell, index) => {
      const parsed = cell ? parseStoredDate(cell) : null;
      if (parsed) {
        dateCells.push({ row: currentRow, col: index + 1 });
        values.push(parsed);
      } else {
        values.push(cell);
      }
    });
    currentRow += 1;
    return values;
  });

  sheet.addTable({
    name: `MergeTable${workbook.worksheets.length + 1}`,
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

export async function exportMergeWorkbook(
  left: { headers: string[]; rows: MergeRow[] },
  right: { headers: string[]; rows: MergeRow[] },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام أرشفة ملفات الإكسل";
  workbook.created = new Date();
  writeTable(workbook, MERGE_SHEET_NAMES[0], left.headers, left.rows);
  writeTable(workbook, MERGE_SHEET_NAMES[1], right.headers, right.rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
