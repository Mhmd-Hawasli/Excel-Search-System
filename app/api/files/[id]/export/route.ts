import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { parseStoredDate } from "@/lib/format/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_NUMBER_FORMAT = "DD/MM/YYYY";

// Blue, Table Style Light 9: blue header, white body.
const TABLE_THEME = "TableStyleLight9";
// 40px row height -> points (96px = 72pt).
const ROW_HEIGHT_POINTS = 30;
// 200px max column width in Excel width units (~7px per unit at Calibri 11).
const MAX_COLUMN_WIDTH = 200 / 7;
const MIN_COLUMN_WIDTH = 10;

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = await prisma.file.findUnique({
    where: { id },
    include: {
      group: { select: { name: true } },
      columns: { orderBy: { columnIndex: "asc" } },
    },
  });
  if (!file) {
    return Response.json({ error: "الملف غير موجود." }, { status: 404 });
  }

  const [records, edits] = await prisma.$transaction([
    prisma.record.findMany({
      where: { fileId: id },
      orderBy: { rowIndex: "asc" },
      select: { id: true, rowIndex: true, data: true },
    }),
    prisma.recordEdit.findMany({
      where: { fileId: id },
      orderBy: { createdAt: "asc" },
      select: { headerRaw: true, oldValue: true, recordId: true },
    }),
  ]);

  // First-seen oldValue per (record, column) = true Excel original.
  const originals = new Map<string, string>();
  for (const edit of edits) {
    const key = editKey(edit.recordId, edit.headerRaw);
    if (!originals.has(key)) originals.set(key, edit.oldValue);
  }
  const editedHeaders = new Set(edits.map((e) => e.headerRaw));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام أرشفة ملفات الإكسل";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(file.sheetName.slice(0, 31) || "البيانات", {
    views: [{ rightToLeft: true }],
  });
  const headers = file.columns.map((c) => c.headerRaw);

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
  sheet.addTable({
    name: "DataTable",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: TABLE_THEME, showRowStripes: false },
    columns: headers.map((header) => ({ name: header, filterButton: true })),
    rows,
  });

  // Real dates with day/month/year display; edited-column header highlight.
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (const { row, col } of dateCells) {
    const cell = sheet.getRow(row + 2).getCell(col + 1);
    cell.numFmt = DATE_NUMBER_FORMAT;
  }
  file.columns.forEach((column, index) => {
    if (editedHeaders.has(column.headerRaw)) {
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

  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${file.name}-معدل-${date}.xlsx`;
  const encoded = encodeURIComponent(filename);
  return new Response(Buffer.from(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encoded}`,
      "cache-control": "no-store",
    },
  });
}
