import { NextResponse } from "next/server";
import { z } from "zod";
import { inspectSavedSheet } from "@/lib/excel/workbook";

export const runtime = "nodejs";
const schema = z.object({ token: z.string().uuid(), sheetName: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات الورقة غير صالحة." }, { status: 400 });
  try { return NextResponse.json(await inspectSavedSheet(parsed.data.token, parsed.data.sheetName)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر قراءة الورقة." }, { status: 422 }); }
}
