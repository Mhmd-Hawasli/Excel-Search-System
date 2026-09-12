import { NextResponse } from "next/server";
import { hasPermission, requireApiPermission, resolveDataScope } from "@/lib/auth/session-user";
import { parseConflictParameters } from "@/lib/conflicts/request";
import { conflictScopeFilter, queryConflicts } from "@/lib/conflicts/query";
import { buildConflictsExportWorkbook } from "@/lib/conflicts/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 20000;

export async function GET(request: Request) {
  const view = await requireApiPermission("conflicts.view");
  if (view instanceof NextResponse) return view;
  const manage = await requireApiPermission("export.run");
  if (manage instanceof NextResponse) return manage;
  const parsed = parseConflictParameters(new URL(request.url).searchParams);
  if (!parsed.success)
    return NextResponse.json(
      { error: "معايير التصدير غير صالحة." },
      { status: 400 },
    );
  // Without the filters permission the export always uses default filters.
  const effective = hasPermission(view.user, "conflicts.filters")
    ? parsed.data
    : { ...parsed.data, category: "invalid" as const, field: "all", rule: "all" };
  try {
    const scope = await resolveDataScope(view.user);
    const filter = conflictScopeFilter(scope);
    // One archive scan: the paginated table query would otherwise rescan all
    // rules once per page (40 full scans for a 20k-row export).
    const result = await queryConflicts(
      { ...effective, page: 1, pageSize: MAX_ROWS },
      undefined,
      filter,
    );
    const trimmed = result.rows.slice(0, MAX_ROWS);
    const buffer = await buildConflictsExportWorkbook(trimmed);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `تضارب-البيانات-${effective.category}-${date}.xlsx`;
    return new Response(Buffer.from(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "تعذر إنشاء ملف التصدير." }, { status: 500 });
  }
}
