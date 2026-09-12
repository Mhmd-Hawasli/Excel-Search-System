import type { Prisma, StandardField } from "@/generated/prisma/client";

export type ColumnPlacement = {
  categoryId: string | null;
  standardField: StandardField | null;
};

const categoryKey = (categoryId: string | null) => categoryId ?? "other";
const standardKey = (placement: ColumnPlacement) =>
  `${categoryKey(placement.categoryId)}:${placement.standardField}`;

export async function assignColumnSortOrders(
  tx: Prisma.TransactionClient,
  placements: ColumnPlacement[],
) {
  const nextWeights = new Map<string, number>();
  const standardWeights = new Map<string, number>();

  async function takeBottomWeight(categoryId: string | null) {
    const key = categoryKey(categoryId);
    let nextWeight = nextWeights.get(key);
    if (nextWeight === undefined) {
      const maximum = await tx.fileColumn.aggregate({
        where: { categoryId },
        _max: { sortOrder: true },
      });
      nextWeight = (maximum._max.sortOrder ?? -1) + 1;
    }
    nextWeights.set(key, nextWeight + 1);
    return nextWeight;
  }

  const weights: number[] = [];
  for (const placement of placements) {
    if (!placement.standardField) {
      weights.push(await takeBottomWeight(placement.categoryId));
      continue;
    }

    const key = standardKey(placement);
    let weight = standardWeights.get(key);
    if (weight === undefined) {
      const existing = await tx.fileColumn.findFirst({
        where: {
          categoryId: placement.categoryId,
          standardField: placement.standardField,
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { sortOrder: true },
      });
      weight = existing?.sortOrder ?? await takeBottomWeight(placement.categoryId);
      standardWeights.set(key, weight);
    }
    weights.push(weight);
  }

  return weights;
}
