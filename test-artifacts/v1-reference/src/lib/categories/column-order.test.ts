import { describe, expect, it, vi } from "vitest";
import { assignColumnSortOrders, type ColumnPlacement } from "@/lib/categories/column-order";
import type { Prisma, StandardField } from "@/generated/prisma/client";

function fakeTx() {
  const aggregate = vi.fn(async ({ where }: { where: { categoryId: string | null } }) => ({
    _max: { sortOrder: where.categoryId === "cat-1" ? 10 : null },
  }));
  const findFirst = vi.fn(async ({ where }: { where: { standardField: string | null } }) =>
    where.standardField === "FIRST_NAME" ? { sortOrder: 3 } : { sortOrder: 8 },
  );
  return { fileColumn: { aggregate, findFirst } } as unknown as Prisma.TransactionClient & {
    fileColumn: { aggregate: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  };
}

const placement = (categoryId: string | null, standardField: StandardField | null): ColumnPlacement => ({
  categoryId,
  standardField,
});

describe("assignColumnSortOrders", () => {
  it("stacks free columns at the bottom of their category", async () => {
    const tx = fakeTx();
    const weights = await assignColumnSortOrders(tx, [placement("cat-1", null), placement("cat-1", null), placement(null, null)]);
    expect(weights).toEqual([11, 12, 0]);
  });

  it("reuses one weight for all columns of the same standard field", async () => {
    const tx = fakeTx();
    const weights = await assignColumnSortOrders(tx, [
      placement("cat-1", "FIRST_NAME"),
      placement("cat-1", "FIRST_NAME"),
      placement("cat-1", "FIRST_NAME"),
    ]);
    expect(weights).toEqual([3, 3, 3]);
    expect(tx.fileColumn.findFirst).toHaveBeenCalledTimes(1);
  });

  it("gives distinct standard fields distinct weights", async () => {
    const tx = fakeTx();
    const weights = await assignColumnSortOrders(tx, [placement("cat-1", "FIRST_NAME"), placement("cat-1", "PHONE")]);
    expect(new Set(weights).size).toBe(2);
  });
});
