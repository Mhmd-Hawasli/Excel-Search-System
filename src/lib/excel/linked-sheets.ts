import type ExcelJS from "exceljs";
import type { LinkedSheetsConfig, SheetInspection } from "@/lib/excel/types";
import { headersForSheet, loadWorkbook } from "@/lib/excel/workbook";
import { nationalIdIssue } from "@/lib/format/national-id";
import { nationalIdDigits, normalizeStored } from "@/lib/normalization/arabic";
import { suggestStandardField } from "@/lib/excel/standard-fields";
import { cellValueText } from "@/lib/excel/cell-value";

export type ImportRow = { rowIndex: number; values: string[] };

function dataRows(sheet: ExcelJS.Worksheet, width: number): ImportRow[] {
  const rows: ImportRow[] = [];
  sheet.eachRow((row, rowIndex) => {
    if (rowIndex === 1) return;
    rows.push({
      rowIndex,
      values: Array.from({ length: width }, (_, index) => cellValueText(row.getCell(index + 1))),
    });
  });
  return rows;
}

export function mergeLinkedSheets(workbook: ExcelJS.Workbook, config: LinkedSheetsConfig) {
  const primary = workbook.worksheets[0];
  if (!primary) throw new Error("لا توجد ورقة أساسية في المصنف.");
  if (
    !config.sheetNames.length ||
    new Set(config.sheetNames).size !== config.sheetNames.length ||
    config.sheetNames.includes(primary.name)
  )
    throw new Error("اختر ورقة إضافية واحدة على الأقل، دون تكرار الورقة الأساسية.");
  const primaryHeaders = headersForSheet(primary);
  if (
    !Number.isInteger(config.nationalIdColumnIndex) ||
    config.nationalIdColumnIndex < 1 ||
    config.nationalIdColumnIndex > primaryHeaders.length
  )
    throw new Error("اختر عمود الرقم الوطني من الورقة الأساسية.");
  const additional = config.sheetNames
    .map((name) => {
      const sheet = workbook.getWorksheet(name);
      if (!sheet) throw new Error(`الورقة «${name}» غير موجودة في المصنف.`);
      return sheet;
    })
    .sort((a, b) => workbook.worksheets.indexOf(a) - workbook.worksheets.indexOf(b));
  const rows = dataRows(primary, primaryHeaders.length);
  const byNationalId = new Map<string, ImportRow>();
  for (const row of rows) {
    const raw = row.values[config.nationalIdColumnIndex - 1];
    // Invalid/missing primary IDs are preserved and reported by normal import quality.
    if (nationalIdIssue(raw) !== null) continue;
    const key = nationalIdDigits(raw)!;
    const previous = byNationalId.get(key);
    if (previous)
      throw new Error(
        `الورقة «${primary.name}»: الرقم الوطني مكرر في الصفين ${previous.rowIndex} و${row.rowIndex}؛ لا يمكن تحديد سجل الربط.`,
      );
    byNationalId.set(key, row);
  }
  const columns: SheetInspection["columns"] = primaryHeaders.map((headerRaw, index) => ({
    headerRaw,
    headerNormalized: normalizeStored(headerRaw),
    columnIndex: index + 1,
    suggestedField:
      index + 1 === config.nationalIdColumnIndex
        ? "national_id"
        : suggestStandardField(headerRaw) === "national_id"
          ? null
          : suggestStandardField(headerRaw),
    sourceSheetName: primary.name,
  }));
  const usedHeaders = new Set(columns.map((column) => column.headerNormalized));
  const linkedSummary: NonNullable<SheetInspection["linkedSummary"]> = [];
  for (const sheet of additional) {
    const headers = headersForSheet(sheet);
    if (headers.length < 2)
      throw new Error(
        `الورقة «${sheet.name}»: يلزم الرقم الوطني في العمود الأول وعمود معلومات واحد على الأقل بعده.`,
      );
    const offset = columns.length;
    for (const header of headers.slice(1)) {
      let headerRaw = header;
      let suffix = 1;
      while (usedHeaders.has(normalizeStored(headerRaw))) {
        headerRaw = `${header} [${sheet.name}]${suffix > 1 ? ` (${suffix})` : ""}`;
        suffix++;
      }
      usedHeaders.add(normalizeStored(headerRaw));
      columns.push({
        headerRaw,
        headerNormalized: normalizeStored(headerRaw),
        columnIndex: columns.length + 1,
        suggestedField:
          suggestStandardField(header) === "national_id" ? null : suggestStandardField(header),
        sourceSheetName: sheet.name,
      });
    }
    for (const row of rows) row.values.push(...Array<string>(headers.length - 1).fill(""));
    const seen = new Map<string, number>();
    for (const extraRow of dataRows(sheet, headers.length)) {
      if (extraRow.values.every((value) => !value.trim())) continue;
      if (nationalIdIssue(extraRow.values[0]) !== null) {
        const fromFormula = Boolean(sheet.getRow(extraRow.rowIndex).getCell(1).formula);
        throw new Error(
          `الورقة «${sheet.name}»، الصف ${extraRow.rowIndex}: ${fromFormula ? "نتيجة المعادلة المحفوظة في العمود الأول" : "القيمة في العمود الأول"} هي «${extraRow.values[0] || "فارغة"}». يجب أن تكون رقماً وطنياً صالحاً من 9 إلى 11 رقماً قبل تعبئة الأصفار.${fromFormula ? " تأكد أن المعادلة ترجع الرقم الوطني وليس الرقم التسلسلي، ثم أعد حساب الملف واحفظه." : ""}`,
        );
      }
      const key = nationalIdDigits(extraRow.values[0])!;
      if (seen.has(key))
        throw new Error(
          `الورقة «${sheet.name}»: الرقم الوطني مكرر في الصفين ${seen.get(key)} و${extraRow.rowIndex}؛ اجعل لكل شخص صفاً واحداً في هذه الورقة.`,
        );
      const target = byNationalId.get(key);
      if (!target)
        throw new Error(
          `الورقة «${sheet.name}»، الصف ${extraRow.rowIndex}: الرقم الوطني غير موجود في الورقة الأساسية «${primary.name}».`,
        );
      seen.set(key, extraRow.rowIndex);
      extraRow.values.slice(1).forEach((value, index) => {
        target.values[offset + index] = value;
      });
    }
    linkedSummary.push({
      sheetName: sheet.name,
      matchedRows: seen.size,
      missingRows:
        rows.filter((row) =>
          row.values.slice(0, primaryHeaders.length).some((value) => value.trim()),
        ).length - seen.size,
    });
  }
  const inspection: SheetInspection = {
    sheetName: primary.name,
    sheetIndex: 1,
    rowCount: rows.length,
    columnCount: columns.length,
    columns,
    preview: rows.slice(0, 20).map((row) => row.values),
    linkedSheets: {
      nationalIdColumnIndex: config.nationalIdColumnIndex,
      sheetNames: additional.map((sheet) => sheet.name),
    },
    linkedSummary,
  };
  return { inspection, rows };
}

export async function loadLinkedSheets(token: string, config: LinkedSheetsConfig) {
  return mergeLinkedSheets(await loadWorkbook(token), config);
}
