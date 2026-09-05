import ExcelJS from "exceljs";

type StreamingWorksheetIdentity = { id?: number | string; name?: string };

export function createStreamingWorkbookReader(filePath: string) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "cache",
    worksheets: "emit",
  });

  // ExcelJS 4.4 can encounter worksheet entries before workbook.xml when the
  // archive was produced by ExcelJS itself. Its reader assumes model exists in
  // that ordering and otherwise throws before yielding the first worksheet.
  const internalReader = reader as unknown as { model?: { sheets: unknown[] } };
  internalReader.model ??= { sheets: [] };
  return reader;
}

export function isSelectedWorksheet(worksheet: unknown, sheetName: string, sheetIndex: number) {
  const identity = worksheet as StreamingWorksheetIdentity;
  const hasFallbackName = !identity.name || identity.name === `Sheet${identity.id}`;
  return identity.name === sheetName || (hasFallbackName && Number(identity.id) === sheetIndex);
}
