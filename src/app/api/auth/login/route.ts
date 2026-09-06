import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const schema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });

const INVALID = { error: "اسم المستخدم أو كلمة المرور غير صحيحة." };

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور." }, { status: 400 });
  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true, username: true, passwordHash: true, isActive: true },
  });
  if (!user || !user.isActive) return NextResponse.json(INVALID, { status: 401 });
  if (!(await verifyPassword(parsed.data.password, user.passwordHash)))
    return NextResponse.json(INVALID, { status: 401 });
  const response = NextResponse.json({ ok: true, username: user.username });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(user.id, user.username),
    sessionCookieOptions(request),
  );
  return response;
}
