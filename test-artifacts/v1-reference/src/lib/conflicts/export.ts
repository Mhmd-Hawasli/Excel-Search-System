import ExcelJS from "exceljs";
import { THIN_CELL_BORDER } from "@/lib/excel/cell-style";
import { uniqueTableColumnNames } from "@/lib/excel/table-columns";
import { formatNationalId } from "@/lib/format/national-id";
import { formatShamCash } from "@/lib/format/sham-cash";
import { formatFunctionalCategory } from "@/lib/format/functional-category";
import type { ConflictRow } from "@/lib/conflicts/catalog";

const TABLE_THEME = "TableStyleLight9";
const ROW_HEIGHT_POINTS = 30;

const HEADERS = [
  "رقم المشكلة",
  "الملف",
  "صف Excel",
  "الاسم الثلاثي",
  "اسم الأم",
  "الرقم الوطني",
  "الشام كاش",
  "الرقم الذاتي",
  "الهاتف",
  "الفئة الوظيفية",
  "القاعدة",
  "الشرح",
];

const WIDTHS = [10, 28, 10, 26, 20, 18, 22, 16, 16, 18, 30, 80];

/**
 * Builds the per-case conflicts workbook: one row per flagged record with
 * every detail (file, person identifiers, rule and explanation).
 */
export async function buildConflictsExportWorkbook(rows: ConflictRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "نظام أرشفة ملفات الإكسل";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("تضارب البيانات", { views: [{ rightToLeft: true }] });
  const exportHeaders = uniqueTableColumnNames(HEADERS);
  const stringRows = rows.map((row) => [
    String(row.issueNumber),
    row.fileName,
    String(row.rowIndex),
    row.fullName,
    row.motherName,
    formatNationalId(row.nationalId) || row.nationalId,
    row.shamCash ? formatShamCash(row.shamCash) || row.shamCash : "",
    row.personalNo,
    row.phone,
    formatFunctionalCategory(row.functionalCategory) || "",
    row.issues.map((issue) => issue.label).join("؛ "),
    row.issues.map((issue) => issue.explanation).join("\n---\n"),
  ]);

  sheet.addTable({
    name: "ConflictsTable",
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: TABLE_THEME, showRowStripes: false },
    columns: exportHeaders.map((header) => ({ name: header, filterButton: true })),
    rows: stringRows,
  });

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (let rowIndex = 1; rowIndex <= stringRows.length + 1; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.height = ROW_HEIGHT_POINTS;
    for (let columnIndex = 1; columnIndex <= exportHeaders.length; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = THIN_CELL_BORDER;
    }
  }
  exportHeaders.forEach((_, columnIndex) => {
    sheet.getColumn(columnIndex + 1).width = WIDTHS[columnIndex] ?? 20;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
