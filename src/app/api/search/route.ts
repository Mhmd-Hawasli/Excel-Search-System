import { NextResponse } from "next/server";
import { requireApiPermission, resolveSearchScope } from "@/lib/auth/session-user";
import { searchRecords } from "@/lib/search/query";
import { parseSearchParameters } from "@/lib/search/request";
import { applySearchScope } from "@/lib/search/scope";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiPermission("search.view");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const parsed = parseSearchParameters(url.searchParams);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "معايير البحث غير صالحة." }, { status: 400 });
  const scope = await resolveSearchScope(auth.user);
  if (!scope) return NextResponse.json({ error: "غير موجود." }, { status: 404 });
  const scoped = applySearchScope(parsed.data, scope);
  if (!scoped)
    return NextResponse.json({ rows: [], total: 0, page: parsed.data.page, pageSize: parsed.data.pageSize, pageCount: 0 });
  try {
    return NextResponse.json(
      await searchRecords({ ...parsed.data, query: parsed.data.q, ...scoped }),
    );
  } catch {
    return NextResponse.json({ error: "تعذر تنفيذ البحث الآن. تحقق من اتصال قاعدة البيانات وحاول من جديد." }, { status: 500 });
  }
}
