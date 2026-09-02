"use server";

import { ActivityAction } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { MutationResult } from "@/lib/actions/result";
import { prisma } from "@/lib/db/prisma";

function text(formData: FormData, key: string) { const item = formData.get(key); return typeof item === "string" ? item : ""; }

export async function deleteFile(formData: FormData): Promise<MutationResult> {
  const id = text(formData, "id"); const confirmation = text(formData, "confirmName");
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return { ok: false, error: "الملف غير موجود." };
  if (confirmation !== file.name) return { ok: false, error: "اسم التأكيد لا يطابق اسم الملف." };
  await prisma.$transaction(async (tx) => {
    await tx.file.delete({ where: { id } });
    await tx.activityLog.create({ data: { action: ActivityAction.FILE_DELETED, targetName: file.name, details: { fileId: id, records: file.rowCount } } });
  });
  revalidatePath(`/groups/${file.groupId}`);
  return { ok: true, message: "تم حذف الملف وكل سجلاته.", navigateTo: `/groups/${file.groupId}` };
}
