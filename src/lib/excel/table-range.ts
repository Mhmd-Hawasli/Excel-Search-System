/**
 * An Excel Table (Ctrl+T ListObject) found on a sheet. When a sheet carries
 * a table, every import in the system reads ONLY the table and ignores all
 * rows and columns outside it; sheets without a table import normally.
 */
export type SheetTableRange = {
  /** 1-based row number of the table header row. */
  headerRow: number;
  /** 1-based first data row (headerRow + 1). */
  firstRow: number;
  /** 1-based last data row (totals row excluded). */
  lastRow: number;
  /** 1-based first table column. */
  firstCol: number;
  /** 1-based last table column. */
  lastCol: number;
};

function columnLettersToNumber(letters: string): number | null {
  if (!/^[A-Za-z]+$/.test(letters)) return null;
  let number = 0;
  for (const char of letters.toUpperCase()) number = number * 26 + (char.charCodeAt(0) - 64);
  return number;
}

/** Parses an A1-style range ("B2:D20", "$" prefixes tolerated). */
export function parseTableRef(ref: unknown): {
  firstRow: number;
  lastRow: number;
  firstCol: number;
  lastCol: number;
} | null {
  if (typeof ref !== "string") return null;
  const match = ref.replace(/\$/g, "").match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const firstCol = columnLettersToNumber(match[1]);
  const firstRow = Number(match[2]);
  const lastCol = columnLettersToNumber(match[3]);
  const lastRow = Number(match[4]);
  if (
    firstCol === null ||
    lastCol === null ||
    !Number.isInteger(firstRow) ||
    !Number.isInteger(lastRow) ||
    firstRow < 1 ||
    lastRow < firstRow ||
    firstCol < 1 ||
    lastCol < firstCol
  ) {
    return null;
  }
  return { firstRow, lastRow, firstCol, lastCol };
}

/**
 * Returns the active table range of a worksheet (first table wins), or null
 * when the sheet has no usable table. A totals row is excluded from the data
 * range; a table without an explicit header row still treats its first row
 * as headers (imports always need headers).
 */
export function tableRangeForSheet(worksheet: {
  getTables?: () => Array<unknown>;
}): SheetTableRange | null {
  if (typeof worksheet.getTables !== "function") return null;
  const tables = worksheet.getTables() ?? [];
  if (tables.length === 0) return null;
  // At runtime ExcelJS wraps models as { table } (typings declare tuples);
  // the range lives in `tableRef` (fallback: `ref`).
  const raw = tables[0];
  const unwrapped = (
    raw && typeof raw === "object" && "table" in raw
      ? (raw as { table?: unknown }).table
      : raw
  ) as unknown;
  const entry = (Array.isArray(unwrapped) ? unwrapped[0] : unwrapped) as
    | { ref?: unknown; tableRef?: unknown; totalsRow?: unknown; headerRow?: unknown }
    | undefined;
  const parsed = parseTableRef(entry?.tableRef ?? entry?.ref);
  if (!parsed) return null;
  const totals = entry?.totalsRow === true;
  const lastRow = totals ? parsed.lastRow - 1 : parsed.lastRow;
  if (lastRow < parsed.firstRow) return null;
  return {
    headerRow: parsed.firstRow,
    firstRow: parsed.firstRow + 1,
    lastRow,
    firstCol: parsed.firstCol,
    lastCol: parsed.lastCol,
  };
}

/** Number of data rows inside the range (0 when header-only). */
export function tableDataRowCount(table: SheetTableRange): number {
  return Math.max(0, table.lastRow - table.firstRow + 1);
}

/** Number of table columns. */
export function tableColumnCount(table: SheetTableRange): number {
  return table.lastCol - table.firstCol + 1;
}

/** Reads one logical row of values inside the table (0-based across table columns). */
export function tableRowValues(
  row: { getCell(index: number): unknown },
  table: SheetTableRange,
  readCell: (cell: unknown) => string,
): string[] {
  const values: string[] = [];
  for (let column = table.firstCol; column <= table.lastCol; column += 1) {
    values.push(readCell(row.getCell(column)));
  }
  return values;
}
