import { NextResponse } from "next/server";
import { hasPermission, requireApiPermission, resolveDataScope } from "@/lib/auth/session-user";
import { parseConflictParameters } from "@/lib/conflicts/request";
import { conflictScopeFilter, queryConflicts } from "@/lib/conflicts/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiPermission("conflicts.view");
  if (auth instanceof NextResponse) return auth;
  const parsed = parseConflictParameters(new URL(request.url).searchParams);
  if (!parsed.success)
    return NextResponse.json(
      { error: "معايير التصفية غير صالحة. اختر الحالة والحقل والحالة الفرعية من القائمة." },
      { status: 400 },
    );
  // Without the filters permission the API ignores client-supplied filters.
  const effective = hasPermission(auth.user, "conflicts.filters")
    ? parsed.data
    : { ...parsed.data, category: "invalid" as const, field: "all", rule: "all" };
  try {
    const scope = await resolveDataScope(auth.user);
    return NextResponse.json(await queryConflicts(effective, undefined, conflictScopeFilter(scope)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "تعذر فحص تضارب البيانات الآن. تحقق من اتصال قاعدة البيانات وحاول من جديد." },
      { status: 500 },
    );
  }
}
