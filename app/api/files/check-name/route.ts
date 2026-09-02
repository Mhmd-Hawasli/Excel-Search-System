import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const schema = z.object({ name: z.string().trim().min(2).max(160) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ available: false, error: "يجب أن يتراوح اسم الملف بين حرفين و160 حرفًا." }, { status: 400 });
  }

  try {
    const existing = await prisma.file.findUnique({ where: { name: parsed.data.name }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ available: false, error: "اسم الملف مستخدم مسبقًا. اختر اسمًا آخر." }, { status: 409 });
    }
    return NextResponse.json({ available: true });
  } catch {
    return NextResponse.json({ available: false, error: "تعذر التحقق من اسم الملف. حاول مجددًا." }, { status: 500 });
  }
}
