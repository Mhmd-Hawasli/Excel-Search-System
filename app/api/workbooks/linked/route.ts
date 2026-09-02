import { NextResponse } from "next/server";
import { z } from "zod";
import { uploadConfigSchema } from "@/lib/excel/config";
import { loadLinkedSheets } from "@/lib/excel/linked-sheets";

export const runtime = "nodejs";
const schema = z.object({
  token: z.string().uuid(),
  linkedSheets: uploadConfigSchema.shape.linkedSheets.unwrap(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "اختر الأوراق الإضافية وعمود الرقم الوطني في الورقة الأساسية." },
      { status: 400 },
    );
  try {
    const { inspection } = await loadLinkedSheets(parsed.data.token, parsed.data.linkedSheets);
    return NextResponse.json(inspection);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر ربط الأوراق." },
      { status: 422 },
    );
  }
}
