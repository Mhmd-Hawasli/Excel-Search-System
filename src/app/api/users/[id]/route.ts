import { NextResponse } from "next/server";
import { ActivityAction } from "@/generated/prisma/client";
import { requireApiPermission } from "@/lib/auth/session-user";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { serializeUser, updateUserSchema } from "@/lib/users/validation";

export const runtime = "nodejs";

const userSelection = {
  id: true,
  username: true,
  displayName: true,
  isActive: true,
  createdAt: true,
  permissions: { select: { permission: true, groupId: true, fileId: true } },
} as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("users.update");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات المستخدم غير صالحة." },
      { status: 400 },
    );
  if (id === auth.user.id && parsed.data.isActive === false)
    return NextResponse.json({ error: "لا يمكنك تعطيل حسابك الخاص." }, { status: 422 });
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        displayName:
          parsed.data.displayName === undefined
            ? undefined
            : parsed.data.displayName?.trim()
              ? parsed.data.displayName.trim()
              : null,
        isActive: parsed.data.isActive,
        passwordHash: parsed.data.password ? await hashPassword(parsed.data.password) : undefined,
      },
      select: userSelection,
    });
    await tx.activityLog.create({
      data: {
        action: ActivityAction.USER_UPDATED,
        targetName: updated.username,
        details: { by: auth.user.username },
      },
    });
    return updated;
  });
  return NextResponse.json({ user: serializeUser(user) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("users.delete");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (id === auth.user.id)
    return NextResponse.json({ error: "لا يمكنك حذف حسابك الخاص." }, { status: 422 });
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id } });
    await tx.activityLog.create({
      data: {
        action: ActivityAction.USER_DELETED,
        targetName: existing.username,
        details: { by: auth.user.username },
      },
    });
  });
  return NextResponse.json({ ok: true });
}
