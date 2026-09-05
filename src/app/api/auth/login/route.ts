import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminCredentials, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/config";
import { createSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";

const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "يرجى إدخال اسم المستخدم وكلمة المرور." }, { status: 400 });
  const expected = getAdminCredentials();
  if (
    !safeEqual(parsed.data.username, expected.username) ||
    !safeEqual(parsed.data.password, expected.password)
  ) {
    return NextResponse.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(parsed.data.username),
    sessionCookieOptions(request),
  );
  return response;
}
