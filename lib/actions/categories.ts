"use server";

import { ActivityAction, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MutationResult } from "@/lib/actions/result";
import { CATEGORY_LIMIT_MESSAGE, MAX_CUSTOM_CATEGORIES } from "@/lib/categories/config";
import { prisma } from "@/lib/db/prisma";
import { assignColumnSortOrders } from "@/lib/categories/column-order";

const nameSchema = z.string().trim().min(2, "اسم الفئة قصير جدًا.").max(100, "اسم الفئة طويل جدًا.");
const text = (formData: FormData, key: string) => {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
};
const dbMessage = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "توجد فئة بهذا الاسم بالفعل." : "تعذر حفظ الفئة. حاول مرة أخرى.";
class CategoryLimitError extends Error {}

export async function createCategory(formData: FormData): Promise<MutationResult> {
  const parsed = nameSchema.safeParse(text(formData, "name"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "اسم الفئة غير صالح." };
  const name = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const count = await tx.category.count();
      if (count >= MAX_CUSTOM_CATEGORIES) throw new CategoryLimitError(CATEGORY_LIMIT_MESSAGE);
      const last = await tx.category.aggregate({ _max: { sortOrder: true } });
      await tx.category.create({ data: { name, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      await tx.activityLog.create({ data: { action: ActivityAction.CATEGORY_CREATED, targetName: name, details: {} } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    return { ok: false, error: error instanceof CategoryLimitError ? error.message : dbMessage(error) };
  }
  revalidatePath("/settings/categories");
  return { ok: true, message: "تم إنشاء الفئة." };
}

export async function updateCategory(formData: FormData): Promise<MutationResult> {
  const id = text(formData, "id");
  const parsed = nameSchema.safeParse(text(formData, "name"));
  if (!id) return { ok: false, error: "الفئة غير موجودة." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "اسم غير صالح." };
  const name = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { id }, data: { name } });
      await tx.activityLog.create({ data: { action: ActivityAction.CATEGORY_UPDATED, targetName: name, details: {} } });
    });
  } catch (error) { return { ok: false, error: dbMessage(error) }; }
  revalidatePath("/settings/categories");
  revalidatePath("/records/[id]", "page");
  return { ok: true, message: "تم حفظ اسم الفئة." };
}

export async function reorderCategory(formData: FormData): Promise<MutationResult> {
  const id = text(formData, "id");
  const direction = text(formData, "direction");
  const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, sortOrder: true } });
  const index = categories.findIndex((category) => category.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= categories.length) return { ok: false, error: "لا يمكن نقل الفئة في هذا الاتجاه." };
  const current = categories[index];
  const other = categories[swapIndex];
  await prisma.$transaction([
    prisma.category.update({ where: { id: current.id }, data: { sortOrder: other.sortOrder } }),
    prisma.category.update({ where: { id: other.id }, data: { sortOrder: current.sortOrder } }),
    prisma.activityLog.create({ data: { action: ActivityAction.CATEGORY_REORDERED, targetName: current.name, details: { direction } } }),
  ]);
  revalidatePath("/settings/categories");
  return { ok: true, message: "تم حفظ ترتيب الفئات." };
}

export async function deleteCategory(formData: FormData): Promise<MutationResult> {
  const id = text(formData, "id");
  const confirmName = text(formData, "confirmName");
  const category = await prisma.category.findUnique({ where: { id }, include: { columns: { select: { fileId: true } } } });
  if (!category) return { ok: false, error: "الفئة غير موجودة." };
  const foundCategory = category;
  if (confirmName !== foundCategory.name) return { ok: false, error: "اسم التأكيد لا يطابق اسم الفئة." };
  const files = new Set(foundCategory.columns.map((column) => column.fileId)).size;
  await prisma.$transaction(async (tx) => {
    const columns = await tx.fileColumn.findMany({ where: { categoryId: id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, standardField: true } });
    const sortOrders = await assignColumnSortOrders(tx, columns.map((column) => ({ categoryId: null, standardField: column.standardField })));
    for (const [index, column] of columns.entries()) {
      await tx.fileColumn.update({ where: { id: column.id }, data: { categoryId: null, sortOrder: sortOrders[index] } });
    }
    await tx.category.delete({ where: { id } });
    await tx.activityLog.create({ data: { action: ActivityAction.CATEGORY_DELETED, targetName: foundCategory.name, details: { columns: foundCategory.columns.length, files } } });
  });
  revalidatePath("/settings/categories");
  revalidatePath("/records/[id]", "page");
  return { ok: true, message: "تم حذف الفئة ونُقلت أعمدتها إلى «أخرى»." };
}

const uuidSchema = z.string().uuid("معرّف العمود غير صالح.");
export async function moveColumnToCategory(formData: FormData): Promise<MutationResult> {
  const parsedId = uuidSchema.safeParse(text(formData, "columnId"));
  const rawCategoryId = text(formData, "categoryId");
  const targetCategoryId = rawCategoryId === "other" ? null : rawCategoryId;
  if (!parsedId.success) return { ok: false, error: parsedId.error.issues[0]?.message ?? "العمود غير موجود." };
  if (targetCategoryId && !uuidSchema.safeParse(targetCategoryId).success) return { ok: false, error: "الفئة المستهدفة غير صالحة." };
  const [column, targetCategory] = await Promise.all([
    prisma.fileColumn.findUnique({ where: { id: parsedId.data }, include: { file: { select: { name: true } }, category: { select: { name: true } } } }),
    targetCategoryId ? prisma.category.findUnique({ where: { id: targetCategoryId }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  if (!column) return { ok: false, error: "العمود غير موجود." };
  const foundColumn = column;
  if (targetCategoryId && !targetCategory) return { ok: false, error: "الفئة المستهدفة لم تعد موجودة." };
  if (foundColumn.categoryId === targetCategoryId) return { ok: true, message: "العمود موجود ضمن هذه الفئة بالفعل." };
  await prisma.$transaction(async (tx) => {
    const [sortOrder] = await assignColumnSortOrders(tx, [{ categoryId: targetCategoryId, standardField: foundColumn.standardField }]);
    await tx.fileColumn.update({ where: { id: foundColumn.id }, data: { categoryId: targetCategoryId, sortOrder } });
    await tx.activityLog.create({ data: { action: ActivityAction.COLUMN_RECATEGORIZED, targetName: `${foundColumn.headerRaw} — ${foundColumn.file.name}`, details: { columnId: foundColumn.id, from: foundColumn.category?.name ?? "أخرى", to: targetCategory?.name ?? "أخرى" } } });
  });
  revalidatePath("/settings/categories");
  revalidatePath("/records/[id]", "page");
  return { ok: true, message: foundColumn.standardField
    ? `تم نقل العمود إلى «${targetCategory?.name ?? "أخرى"}» ودمجه مع ترتيب الحقل القياسي المرتبط به.`
    : `تم نقل العمود إلى «${targetCategory?.name ?? "أخرى"}» ووضعه في نهاية القائمة.` };
}

const orderedGroupsSchema = z.array(z.string().min(1).max(100)).max(5000);

const logicalGroupKey = (column: { id: string; standardField: string | null }) =>
  column.standardField ? `standard:${column.standardField.toLowerCase()}` : `column:${column.id}`;

export async function reorderCategoryColumnGroups(
  categoryId: string | null,
  orderedGroupKeys: string[],
) {
  const parsedCategoryId = categoryId === null ? { success: true as const, data: null } : uuidSchema.safeParse(categoryId);
  const parsedGroups = orderedGroupsSchema.safeParse(orderedGroupKeys);
  if (!parsedCategoryId.success || !parsedGroups.success) return { ok: false as const, error: "ترتيب الأعمدة المرسل غير صالح." };
  const columns = await prisma.fileColumn.findMany({
    where: { categoryId: parsedCategoryId.data },
    select: { id: true, standardField: true },
  });
  const groups = new Map<string, string[]>();
  for (const column of columns) {
    const key = logicalGroupKey(column);
    groups.set(key, [...(groups.get(key) ?? []), column.id]);
  }
  const uniqueKeys = new Set(parsedGroups.data);
  if (uniqueKeys.size !== parsedGroups.data.length || uniqueKeys.size !== groups.size || parsedGroups.data.some((key) => !groups.has(key))) {
    return { ok: false as const, error: "تغيّرت أعمدة الفئة. حدّث الصفحة ثم أعد المحاولة." };
  }
  const category = parsedCategoryId.data ? await prisma.category.findUnique({ where: { id: parsedCategoryId.data }, select: { name: true } }) : null;
  if (parsedCategoryId.data && !category) return { ok: false as const, error: "الفئة لم تعد موجودة." };
  try {
    await prisma.$transaction(async (tx) => {
      for (const [sortOrder, key] of parsedGroups.data.entries()) {
        await tx.fileColumn.updateMany({
          where: { id: { in: groups.get(key) ?? [] }, categoryId: parsedCategoryId.data },
          data: { sortOrder },
        });
      }
      await tx.activityLog.create({
        data: {
          action: ActivityAction.COLUMN_REORDERED,
          targetName: category?.name ?? "أخرى",
          details: { categoryId: parsedCategoryId.data, groups: parsedGroups.data.length },
        },
      });
    });
    revalidatePath("/settings/categories");
    revalidatePath("/records/[id]", "page");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "تعذر حفظ ترتيب الأعمدة. حاول مرة أخرى." };
  }
}
