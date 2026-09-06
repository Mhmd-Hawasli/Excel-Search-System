import { NextResponse } from "next/server";
import { ActivityAction, Prisma } from "@/generated/prisma/client";
import { requireApiPermission } from "@/lib/auth/session-user";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import {
  createUserSchema,
  dedupeAssignments,
  serializeUser,
  validateAssignmentTargets,
} from "@/lib/users/validation";

export const runtime = "nodejs";

const userSelection = {
  id: true,
  username: true,
  displayName: true,
  isActive: true,
  createdAt: true,
  permissions: { select: { permission: true, groupId: true, fileId: true } },
} as const;

export async function GET() {
  const auth = await requireApiPermission("users.view");
  if (auth instanceof NextResponse) return auth;
  const users = await prisma.user.findMany({
    select: userSelection,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users: users.map(serializeUser) });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("users.create");
  if (auth instanceof NextResponse) return auth;
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "بيانات المستخدم غير صالحة." },
      { status: 400 },
    );
  const assignments = dedupeAssignments(parsed.data.permissions);
  const targetError = await validateAssignmentTargets(assignments);
  if (targetError) return NextResponse.json({ error: targetError }, { status: 422 });
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: parsed.data.username,
          passwordHash: await hashPassword(parsed.data.password),
          displayName: parsed.data.displayName?.trim() ? parsed.data.displayName.trim() : null,
          isActive: parsed.data.isActive,
          permissions: {
            create: assignments.map((row) => ({
              permission: row.permission,
              groupId: row.groupId ?? null,
              fileId: row.fileId ?? null,
            })),
          },
        },
        select: userSelection,
      });
      await tx.activityLog.create({
        data: {
          action: ActivityAction.USER_CREATED,
          targetName: created.username,
          details: { by: auth.user.username },
        },
      });
      return created;
    });
    return NextResponse.json({ user: serializeUser(user) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json({ error: "يوجد مستخدم بهذا الاسم مسبقًا." }, { status: 409 });
    return NextResponse.json({ error: "تعذر إنشاء المستخدم." }, { status: 500 });
  }
}
