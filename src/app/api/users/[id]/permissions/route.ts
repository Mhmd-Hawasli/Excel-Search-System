import { NextResponse } from "next/server";
import { ActivityAction } from "@/generated/prisma/client";
import { requireApiPermission } from "@/lib/auth/session-user";
import { unifyDataPermissions } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  dedupeAssignments,
  replacePermissionsSchema,
  validateAssignmentTargets,
  resolveFileAssignments,
} from "@/lib/users/validation";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("users.view");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      permissions: {
        select: { permission: true, groupId: true, fileId: true },
        orderBy: { permission: "asc" },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  return NextResponse.json({ userId: user.id, username: user.username, permissions: unifyDataPermissions(user.permissions) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("users.update");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (id === auth.user.id)
    return NextResponse.json({ error: "لا يمكنك تعديل صلاحيات حسابك الخاص." }, { status: 422 });
  const parsed = replacePermissionsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات الصلاحيات غير صالحة." },
      { status: 400 },
    );
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  const assignments = dedupeAssignments(parsed.data.permissions);
  const targetError = await validateAssignmentTargets(assignments);
  if (targetError) return NextResponse.json({ error: targetError }, { status: 422 });
  const fileAssignments = await resolveFileAssignments(assignments);
  const permissions = await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId: id } });
    await tx.userPermission.createMany({
      data: fileAssignments.map((row) => ({
        userId: id,
        permission: row.permission,
        groupId: row.groupId ?? null,
        fileId: row.fileId ?? null,
      })),
    });
    await tx.activityLog.create({
      data: {
        action: ActivityAction.USER_PERMISSIONS_UPDATED,
        targetName: existing.username,
        details: { by: auth.user.username, permissions: fileAssignments.map((row) => row.permission) },
      },
    });
    return tx.userPermission.findMany({
      where: { userId: id },
      select: { permission: true, groupId: true, fileId: true },
      orderBy: { permission: "asc" },
    });
  });
  return NextResponse.json({ userId: id, permissions });
}
