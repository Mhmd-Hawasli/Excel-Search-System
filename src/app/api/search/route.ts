import { NextResponse } from "next/server";
import { searchRecords } from "@/lib/search/query";
import { parseSearchParameters } from "@/lib/search/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseSearchParameters(url.searchParams);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "معايير البحث غير صالحة." }, { status: 400 });
  try { return NextResponse.json(await searchRecords({ ...parsed.data, query: parsed.data.q })); }
  catch { return NextResponse.json({ error: "تعذر تنفيذ البحث الآن. تحقق من اتصال قاعدة البيانات وحاول من جديد." }, { status: 500 }); }
}
