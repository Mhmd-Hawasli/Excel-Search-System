import type { StandardFieldKey } from "@/lib/excel/types";

export function ensureUniqueStandardFields<T extends { standardField: StandardFieldKey | null }>(columns: readonly T[]): T[] {
  const usedFields = new Set<StandardFieldKey>();

  return columns.map((column) => {
    if (!column.standardField) return column;
    if (usedFields.has(column.standardField)) return { ...column, standardField: null };
    usedFields.add(column.standardField);
    return column;
  });
}
