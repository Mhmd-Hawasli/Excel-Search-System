import type { StandardFieldKey } from "@/lib/excel/types";

export function ensureUniqueStandardFields<
  T extends { standardField: StandardFieldKey | null; columnIndex?: number },
>(columns: readonly T[], nationalIdColumnIndex?: number): T[] {
  const usedFields = new Set<StandardFieldKey>();

  return columns.map((input) => {
    const column =
      nationalIdColumnIndex === undefined
        ? input
        : {
            ...input,
            standardField:
              input.columnIndex === nationalIdColumnIndex
                ? ("national_id" as const)
                : input.standardField === "national_id"
                  ? null
                  : input.standardField,
          };
    if (!column.standardField) return column;
    if (usedFields.has(column.standardField)) return { ...column, standardField: null };
    usedFields.add(column.standardField);
    return column;
  });
}
