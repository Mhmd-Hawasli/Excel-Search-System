import { NextResponse } from "next/server";
import { z } from "zod";
import { CONFLICT_RULES } from "@/lib/conflicts/catalog";
import { apiNotFound, isFileVisible, requireApiPermission } from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

const schema = z.object({
  rule: z.string().min(1),
  recordId: z.string().uuid(),
});

const RULE_KEYS: Set<string> = new Set(CONFLICT_RULES.map((rule) => rule.key));

export async function POST(request: Request) {
  const auth = await requireApiPermission("conflicts.filters");
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !RULE_KEYS.has(parsed.data.rule))
    return NextResponse.json({ error: "بيانات التجاهل غير صالحة." }, { status: 400 });
  const record = await prisma.record.findUnique({
    where: { id: parsed.data.recordId },
    select: { id: true, fileId: true, file: { select: { groupId: true } } },
  });
  if (!record) return apiNotFound();
  // Scoped accounts must not dismiss problems in files they cannot browse.
  if (!(await isFileVisible(auth.user, { id: record.fileId, groupId: record.file.groupId })))
    return apiNotFound();
  try {
    await prisma.ignoredConflict.upsert({
      where: { rule_recordId: { rule: parsed.data.rule, recordId: parsed.data.recordId } },
      update: {},
      create: { rule: parsed.data.rule, recordId: parsed.data.recordId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "تعذر حفظ التجاهل." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
