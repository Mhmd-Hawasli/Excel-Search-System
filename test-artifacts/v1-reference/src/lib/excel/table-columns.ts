/**
 * Shared Excel Table column-name sanitizer.
 *
 * Excel opens files with a repair warning ("Repaired Records: Table ...")
 * whenever a table contains blank or repeated column names — and line breaks
 * inside a column name break the table as well (proven with a diagnostic
 * workbook: only the sheet with `\n` headers was repaired). Every export
 * that writes a Table must run its headers through this first.
 */
export function uniqueTableColumnNames(headers: string[]): string[] {
  const used = new Map<string, number>();
  return headers.map((header, index) => {
    const flattened = header.replace(/[\r\n\t]+/g, " ");
    const base = flattened.trim() === "" ? `عمود ${index + 1}` : flattened;
    const count = used.get(base.toLowerCase()) ?? 0;
    used.set(base.toLowerCase(), count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}
