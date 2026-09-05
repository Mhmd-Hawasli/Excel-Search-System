import { linkedMappingError, type UploadConfig } from "@/lib/excel/config";
import { loadLinkedSheets, type ImportRow } from "@/lib/excel/linked-sheets";
import { createStreamingWorkbookReader, isSelectedWorksheet } from "@/lib/excel/streaming";
import { workbookPath } from "@/lib/excel/workbook";
import { cellValueText } from "@/lib/excel/cell-value";

export async function* importRows(config: UploadConfig): AsyncGenerator<ImportRow> {
  if (config.linkedSheets) {
    const error = linkedMappingError(config);
    if (error) throw new Error(error);
    const { inspection, rows } = await loadLinkedSheets(config.token, config.linkedSheets);
    if (
      config.sheetName !== inspection.sheetName ||
      config.columns.length !== inspection.columns.length ||
      config.columns.some(
        (column, index) =>
          column.columnIndex !== index + 1 ||
          column.headerRaw !== inspection.columns[index].headerRaw ||
          column.headerNormalized !== inspection.columns[index].headerNormalized,
      )
    )
      throw new Error("تغيرت إعدادات الأعمدة المجمّعة؛ أعد معاينة وربط الأوراق قبل الاستيراد.");
    yield* rows;
    return;
  }
  const reader = createStreamingWorkbookReader(workbookPath(config.token));
  const width = Math.max(...config.columns.map((column) => column.columnIndex));
  for await (const sheet of reader) {
    if (!isSelectedWorksheet(sheet, config.sheetName, config.sheetIndex)) continue;
    for await (const row of sheet) {
      if (row.number === 1) continue;
      yield {
        rowIndex: row.number,
        values: Array.from({ length: width }, (_, index) => cellValueText(row.getCell(index + 1))),
      };
    }
    return;
  }
  throw new Error("الورقة المحددة غير موجودة عند بدء الاستيراد.");
}
