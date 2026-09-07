import { NextResponse } from "next/server";
import { ActivityAction } from "@/generated/prisma/client";
import { getSessionUser, isFileVisible } from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function personName(record: {
  sfFullName: string | null;
  sfFirstName: string | null;
  sfFatherName: string | null;
  sfLastName: string | null;
}): string {
  return (
    record.sfFullName ||
    [record.sfFirstName, record.sfFatherName, record.sfLastName].filter(Boolean).join(" ") ||
    "سجل بلا اسم"
  );
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "انتهت الجلسة." }, { status: 401 });
  const record = await prisma.record.findUnique({
    where: { id },
    select: {
      id: true,
      fileId: true,
      rowIndex: true,
      sfFullName: true,
      sfFirstName: true,
      sfFatherName: true,
      sfLastName: true,
      file: { select: { groupId: true, name: true } },
    },
  });
  if (!record) return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  if (!(await isFileVisible(actor, { id: record.fileId, groupId: record.file.groupId })))
    return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  const name = personName(record);
  try {
    await prisma.activityLog.create({
      data: {
        action: ActivityAction.RECORD_VISITED,
        targetName: name,
        details: {
          recordId: record.id,
          rowIndex: record.rowIndex,
          fileId: record.fileId,
          fileName: record.file.name,
          groupId: record.file.groupId,
          personName: name,
          visitorUsername: actor.username,
          visitorDisplayName: actor.displayName ?? actor.username,
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "تعذر تسجيل الزيارة." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
