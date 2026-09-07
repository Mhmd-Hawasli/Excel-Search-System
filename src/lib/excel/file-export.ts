import ExcelJS from "exceljs";
import { applyRowFormats, THIN_CELL_BORDER, type RowFormats } from "@/lib/excel/cell-style";
import { uniqueTableColumnNames } from "@/lib/excel/table-columns";
import { parseStoredDate } from "@/lib/format/date";

/**
 * Shared builder for the main archive file export (used by the export API
 * route and by format round-trip checks). Source cell colors stored at import
 * are re-applied: the row fill covers the whole exported row, font colors
 * land on their original columns. Everything else (table theme, header
 * highlight of edited columns, widths, dates) matches the system format.
 */

const DATE_NUMBER_FORMAT = "DD/MM/YYYY";

// Blue, Table Style Light 9: blue header, white body.
const TABLE_THEME = "TableStyleLight9";
// 40px row height -> points (96px = 72pt).
const ROW_HEIGHT_POINTS = 30;
// 200px max column width in Excel width units (~7px per unit at Calibri 11).
const MAX_COLUMN_WIDTH = 200 / 7;
const MIN_COLUMN_WIDTH = 10;

export type FileExportRecord = {
  id: string;
  rowIndex: number;
  data: unknown;
  fmtFills: Record<string, string> | null;
  fmtFontColors: Record<string, string> | null;
};

export type FileExportEdit = {
  recordId: string;
  headerRaw: string;
  oldValue: string;
};

function displayLength(value: string | number | Date): number {
  const text = value instanceof Date ? "31/12/2025" : String(value);
  let length = 0;
  for (const char of text) {
    length += char.charCodeAt(0) > 255 ? 1.6 : 1;
  }
  return length;
}

/** Fit-content column widths capped at 200px, applied by 1-based column index. */
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
      cell.border = THIN_CELL_BORDER;
    }
  }
}

function rowData(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : item == null ? "" : String(item),
    ]),
  );
}

function editKey(recordId: string, headerRaw: string) {
  return `${recordId}::${headerRaw}`;
}

export async function buildFileExportWorkbook(input: {
  sheetName: string;
  columns: string[];
  records: FileExportRecord[];
  edits: FileExportEdit[];
}): Promise<Buffer> {
  const { sheetName, columns: headers, records, edits } = input;

  // First-seen oldValue per (record, column) = true Excel original.
  const originals = new Map<string, string>();
  for (const edit of edits) {
    const key = editKey(edit.recordId, edit.headerRaw);
    if (!originals.has(key)) originals.set(key, edit.oldValue);
  }
  const editedHeaders = new Set(edits.map((e) => e.headerRaw));
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام أرشفة ملفات الإكسل";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || "البيانات", {
    views: [{ rightToLeft: true }],
  });

  // Data rows carry current values (original Excel values + applied manual edits).
  // Date-like strings become real Excel dates so Excel recognises them as dates.
  const dateCells: Array<{ row: number; col: number }> = [];
  const rows: Array<Array<string | number | Date>> = [];
  for (const record of records) {
    const data = rowData(record.data);
    const rowIndex = rows.length;
    rows.push(
      headers.map((header, columnIndex) => {
        const raw = data[header] ?? "";
        const parsed = raw ? parseStoredDate(raw) : null;
        if (parsed) {
          dateCells.push({ row: rowIndex, col: columnIndex });
          return parsed;
        }
        return raw;
      }),
    );
  }

  // Proper Excel Table (Ctrl+T): blue header, white body, filter buttons.
  // ExcelJS derives the table range from the top-left ref plus columns/rows.
  // Column names are sanitized (unique, single-line, non-blank) or Excel
  // repairs the table on open; data lookup keeps using the original headers.
  const exportHeaders = uniqueTableColumnNames(headers);
  sheet.addTable({
    name: "DataTable",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: TABLE_THEME, showRowStripes: false },
    columns: exportHeaders.map((header) => ({ name: header, filterButton: true })),
    rows,
  });

  // Real dates with day/month/year display; edited-column header highlight.
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (const { row, col } of dateCells) {
    const cell = sheet.getRow(row + 2).getCell(col + 1);
    cell.numFmt = DATE_NUMBER_FORMAT;
  }
  // Source cell colors: each fill and font lands on its original column.
  // Explicit cell styles override the table theme for those cells only.
  records.forEach((record, index) => {
    const toIndexMap = (byHeader: Record<string, string> | null) => {
      const byIndex: Record<string, string> = {};
      if (byHeader && typeof byHeader === "object") {
        for (const [header, argb] of Object.entries(byHeader)) {
          const columnIndex = headerIndex.get(header);
          if (columnIndex !== undefined && typeof argb === "string") byIndex[String(columnIndex)] = argb;
        }
      }
      return byIndex;
    };
    const formats: RowFormats = {
      fills: toIndexMap(record.fmtFills),
      fonts: toIndexMap(record.fmtFontColors),
    };
    if (Object.keys(formats.fills).length > 0 || Object.keys(formats.fonts).length > 0)
      applyRowFormats(sheet, index + 2, formats, headers.length);
  });
  headers.forEach((header, index) => {
    if (editedHeaders.has(header)) {
      headerRow.getCell(index + 1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFC000" },
      };
    }
  });
  applyColumnWidths(sheet, headers, rows);
  styleTableRange(sheet, rows.length, headers.length);

  if (edits.length) {
    const logHeaders = ["صف Excel", "العمود", "القيمة الأصلية من Excel", "القيمة الحالية بعد التعديل"];
    // One row per (record, column): true Excel original vs current value.
    const logRows: Array<Array<string | number>> = [];
    const seen = new Set<string>();
    for (const rec of records) {
      const data = rowData(rec.data);
      for (const header of editedHeaders) {
        const key = editKey(rec.id, header);
        if (!originals.has(key) || seen.has(key)) continue;
        seen.add(key);
        logRows.push([rec.rowIndex, header, originals.get(key) ?? "", data[header] ?? ""]);
      }
    }
    const log = workbook.addWorksheet("سجل التعديلات", { views: [{ rightToLeft: true }] });
    log.addTable({
      name: "EditsTable",
      ref: "A1",
      headerRow: true,
      totalsRow: false,
      style: { theme: TABLE_THEME, showRowStripes: false },
      columns: logHeaders.map((header) => ({ name: header, filterButton: true })),
      rows: logRows,
    });
    log.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    applyColumnWidths(log, logHeaders, logRows);
    styleTableRange(log, logRows.length, logHeaders.length);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
