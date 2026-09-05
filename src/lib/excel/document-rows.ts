import { loadWorkbook } from "@/lib/excel/workbook";
import { cellValueText } from "@/lib/excel/cell-value";
import type { UploadConfig } from "@/lib/excel/config";
import type { ImportRow } from "@/lib/excel/linked-sheets";

/**
 * Document-model fallback for reading a single sheet. Used when the fast
 * streaming reader yields a cell it cannot resolve (e.g. an intermittent
 * shared-string resolution failure), in which case the shared strings are
 * read natively and every value resolves. Only allocated rows are visited so
 * empty-row reporting matches the streaming behavior.
 */
export async function* documentRows(config: UploadConfig): AsyncGenerator<ImportRow> {
  const workbook = await loadWorkbook(config.token);
  const byName = workbook.worksheets.find((sheet) => sheet.name === config.sheetName);
  const byIndex =
    !byName && config.sheetIndex >= 1 && config.sheetIndex <= workbook.worksheets.length
      ? workbook.worksheets[config.sheetIndex - 1]
      : undefined;
  const worksheet = byName ?? byIndex;
  if (!worksheet) throw new Error("الورقة المحددة غير موجودة عند بدء الاستيراد.");
  const width = Math.max(...config.columns.map((column) => column.columnIndex));
  // eachRow cannot yield lazily, so collect rows first (fallback path only).
  const pending: ImportRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    pending.push({
      rowIndex: rowNumber,
      values: Array.from({ length: width }, (_, index) => cellValueText(row.getCell(index + 1))),
    });
  });
  yield* pending;
}
