import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

/**
 * Server-action unit tests: the Prisma client and `next/cache` are mocked so
 * validation, transaction and error-mapping logic run without a database.
 */
const tx = {
  group: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  file: { count: vi.fn(async () => 0) },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    group: {
      aggregate: vi.fn(async () => ({ _max: { sortOrder: 4 } })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createGroup, deleteGroup, updateGroup } from "@/lib/actions/groups";
import { prisma } from "@/lib/db/prisma";

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("group server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGroup", () => {
    it("rejects names shorter than two characters", async () => {
      const result = await createGroup(formData({ name: "ا" }));
      expect(result).toEqual({ ok: false, error: "اسم المجموعة قصير جدًا." });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("creates the group inside a transaction with the next sort order", async () => {
      const result = await createGroup(formData({ name: "العقود", description: "ملفات العقود" }));
      expect(result).toEqual({ ok: true, message: "تم إنشاء المجموعة." });
      expect(tx.group.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: "العقود", sortOrder: 5 }) }),
      );
      expect(tx.activityLog.create).toHaveBeenCalled();
    });

    it("maps unique-constraint violations to a friendly message", async () => {
      tx.group.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }),
      );
      const result = await createGroup(formData({ name: "موجودة" }));
      expect(result).toEqual({ ok: false, error: "يوجد اسم مجموعة مطابق بالفعل." });
    });

    it("maps other failures to the generic database message", async () => {
      tx.group.create.mockRejectedValueOnce(new Error("connection refused"));
      const result = await createGroup(formData({ name: "أي مجموعة" }));
      expect(result).toEqual({ ok: false, error: "تعذر حفظ المجموعة. تحقق من اتصال قاعدة البيانات وحاول مرة أخرى." });
    });
  });

  describe("updateGroup", () => {
    it("requires an id", async () => {
      const result = await updateGroup(formData({ name: "العقود" }));
      expect(result).toEqual({ ok: false, error: "المجموعة غير موجودة." });
    });

    it("updates and revalidates", async () => {
      const { revalidatePath } = await import("next/cache");
      const result = await updateGroup(formData({ id: "g-1", name: "الجديدة" }));
      expect(result).toEqual({ ok: true, message: "تم حفظ تعديلات المجموعة." });
      expect(tx.group.update).toHaveBeenCalledWith({ where: { id: "g-1" }, data: { name: "الجديدة", description: "" } });
      expect(revalidatePath).toHaveBeenCalledWith("/groups");
      expect(revalidatePath).toHaveBeenCalledWith("/groups/g-1");
    });
  });

  describe("deleteGroup", () => {
    it("requires the exact group name as confirmation", async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
        id: "g-1", name: "مجموعة", files: [{ rowCount: 5 }],
      } as never);
      const result = await deleteGroup(formData({ id: "g-1", confirmName: "خطأ" }));
      expect(result).toEqual({ ok: false, error: "اسم التأكيد لا يطابق اسم المجموعة." });
      expect(tx.group.delete).not.toHaveBeenCalled();
    });

    it("deletes and reports the removed record count", async () => {
      vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
        id: "g-1", name: "مجموعة", files: [{ rowCount: 5 }, { rowCount: 7 }],
      } as never);
      const result = await deleteGroup(formData({ id: "g-1", confirmName: "مجموعة" }));
      expect(result).toEqual({ ok: true, message: "تم حذف المجموعة وكل ملفاتها وسجلاتها." });
      expect(tx.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ details: { files: 2, records: 12 } }) }),
      );
    });
  });
});
