import { NextResponse } from "next/server";
import { parseConflictParameters } from "@/lib/conflicts/request";
import { queryConflicts } from "@/lib/conflicts/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = parseConflictParameters(new URL(request.url).searchParams);
  if (!parsed.success)
    return NextResponse.json(
      { error: "معايير التصفية غير صالحة. اختر الحالة والحقل والحالة الفرعية من القائمة." },
      { status: 400 },
    );
  try {
    return NextResponse.json(await queryConflicts(parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "تعذر فحص تضارب البيانات الآن. تحقق من اتصال قاعدة البيانات وحاول من جديد." },
      { status: 500 },
    );
  }
}
