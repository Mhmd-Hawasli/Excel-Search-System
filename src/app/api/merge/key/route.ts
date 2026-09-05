import { NextResponse } from "next/server";
import { z } from "zod";
import { deletePairKeyAndRelink, sessionContent } from "@/lib/merge/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  table: z.enum(["left", "right"]),
  rowNumber: z.number().int().min(2),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة." }, { status: 400 });
  try {
    const result = deletePairKeyAndRelink(
      parsed.data.sessionId,
      parsed.data.table,
      parsed.data.rowNumber,
    );
    const session = sessionContent(parsed.data.sessionId);
    return NextResponse.json({
      sessionId: session.id,
      leftHeaders: session.left.headers,
      rightHeaders: session.right.headers,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر حذف المفتاح." },
      { status: 404 },
    );
  }
}
