"use server";

import { ActivityAction, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MutationResult } from "@/lib/actions/result";
import { prisma } from "@/lib/db/prisma";

const groupSchema = z.object({
  name: z.string().trim().min(2, "اسم المجموعة قصير جدًا.").max(120, "اسم المجموعة طويل جدًا."),
  description: z.string().trim().max(500, "الوصف طويل جدًا."),
});

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function databaseMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "يوجد اسم مجموعة مطابق بالفعل.";
  return "تعذر حفظ المجموعة. تحقق من اتصال قاعدة البيانات وحاول مرة أخرى.";
}

export async function createGroup(formData: FormData): Promise<MutationResult> {
  const parsed = groupSchema.safeParse({ name: value(formData, "name"), description: value(formData, "description") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات المجموعة غير صالحة." };
  try {
    const last = await prisma.group.aggregate({ _max: { sortOrder: true } });
    await prisma.$transaction(async (tx) => {
      await tx.group.create({ data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      await tx.activityLog.create({ data: { action: ActivityAction.GROUP_CREATED, targetName: parsed.data.name, details: {} } });
    });
  } catch (error) {
    return { ok: false, error: databaseMessage(error) };
  }
  revalidatePath("/groups");
  return { ok: true, message: "تم إنشاء المجموعة." };
}

export async function updateGroup(formData: FormData): Promise<MutationResult> {
  const id = value(formData, "id");
  const parsed = groupSchema.safeParse({ name: value(formData, "name"), description: value(formData, "description") });
  if (!id || !parsed.success) return { ok: false, error: parsed.success ? "المجموعة غير موجودة." : parsed.error.issues[0]?.message ?? "بيانات غير صالحة." };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.group.update({ where: { id }, data: parsed.data });
      await tx.activityLog.create({ data: { action: ActivityAction.GROUP_UPDATED, targetName: parsed.data.name, details: {} } });
    });
  } catch (error) {
    return { ok: false, error: databaseMessage(error) };
  }
  revalidatePath("/groups");
  revalidatePath(`/groups/${id}`);
  return { ok: true, message: "تم حفظ تعديلات المجموعة." };
}

export async function reorderGroup(formData: FormData): Promise<MutationResult> {
  const id = value(formData, "id");
  const direction = value(formData, "direction");
  const groups = await prisma.group.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, sortOrder: true } });
  const index = groups.findIndex((group) => group.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= groups.length) return { ok: false, error: "لا يمكن نقل المجموعة في هذا الاتجاه." };
  const current = groups[index];
  const other = groups[swapIndex];
  try {
    await prisma.$transaction([
      prisma.group.update({ where: { id: current.id }, data: { sortOrder: other.sortOrder } }),
      prisma.group.update({ where: { id: other.id }, data: { sortOrder: current.sortOrder } }),
      prisma.activityLog.create({ data: { action: ActivityAction.GROUP_REORDERED, targetName: current.name, details: { direction } } }),
    ]);
  } catch {
    return { ok: false, error: "تعذر حفظ ترتيب المجموعات." };
  }
  revalidatePath("/groups");
  return { ok: true, message: "تم حفظ ترتيب المجموعات." };
}

export async function deleteGroup(formData: FormData): Promise<MutationResult> {
  const id = value(formData, "id");
  const confirmName = value(formData, "confirmName");
  const group = await prisma.group.findUnique({ where: { id }, include: { files: { select: { rowCount: true } } } });
  if (!group) return { ok: false, error: "المجموعة غير موجودة." };
  if (confirmName !== group.name) return { ok: false, error: "اسم التأكيد لا يطابق اسم المجموعة." };
  const recordCount = group.files.reduce((sum, file) => sum + file.rowCount, 0);
  await prisma.$transaction(async (tx) => {
    await tx.group.delete({ where: { id } });
    await tx.activityLog.create({ data: { action: ActivityAction.GROUP_DELETED, targetName: group.name, details: { files: group.files.length, records: recordCount } } });
  });
  revalidatePath("/groups");
  return { ok: true, message: "تم حذف المجموعة وكل ملفاتها وسجلاتها." };
}
