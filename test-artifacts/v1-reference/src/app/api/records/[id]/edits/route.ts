import { NextResponse } from "next/server";
import { z } from "zod";
import { apiNotFound, isFileVisible, requireApiPermission } from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";
import { getRecordEdits, revertRecordEdit, saveRecordEdit } from "@/lib/edits/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    fileColumnId: z.string().uuid().optional(),
    headerRaw: z.string().min(1).max(500).optional(),
    newValue: z.string().max(5000).optional(),
    revert: z.boolean().optional(),
  })
  .refine((v) => v.fileColumnId || v.headerRaw, { message: "حدد العمود المراد تعديله." });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApiPermission("edits.view");
  if (auth instanceof NextResponse) return auth;
  const record = await prisma.record.findUnique({
    where: { id },
    select: { fileId: true, file: { select: { groupId: true } } },
  });
  if (!record) return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  if (!(await isFileVisible(auth.user, { id: record.fileId, groupId: record.file.groupId })))
    return apiNotFound();
  try {
    return NextResponse.json(await getRecordEdits(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل التعديلات." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApiPermission("edits.update");
  if (auth instanceof NextResponse) return auth;
  const record = await prisma.record.findUnique({
    where: { id },
    select: { fileId: true, file: { select: { groupId: true } } },
  });
  if (!record) return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  if (!(await isFileVisible(auth.user, { id: record.fileId, groupId: record.file.groupId })))
    return apiNotFound();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "جسم الطلب غير صالح." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات التعديل غير صالحة." },
      { status: 400 },
    );
  }
  if (!parsed.data.revert && parsed.data.newValue === undefined) {
    return NextResponse.json({ error: "حدد القيمة الجديدة." }, { status: 400 });
  }
  try {
    const result = parsed.data.revert
      ? await revertRecordEdit({
          recordId: id,
          fileColumnId: parsed.data.fileColumnId,
          headerRaw: parsed.data.headerRaw,
        })
      : await saveRecordEdit({
          recordId: id,
          fileColumnId: parsed.data.fileColumnId,
          headerRaw: parsed.data.headerRaw,
          newValue: parsed.data.newValue ?? "",
        });
    if (!result.changed) {
      return NextResponse.json({ ok: true, changed: false, message: "لا يوجد تغيير للحفظ." });
    }
    const edits = await getRecordEdits(id);
    return NextResponse.json({ ok: true, ...result, edits: edits.editedHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر حفظ التعديل.";
    const status =
      message.includes("غير موجود") ||
      message.includes("طويلة") ||
      message.includes("لا يوجد تعديل")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
