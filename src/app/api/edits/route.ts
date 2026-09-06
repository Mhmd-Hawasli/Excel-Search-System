import { NextResponse } from "next/server";
import { requireApiPermission, resolveDataScope } from "@/lib/auth/session-user";
import { getEditedFilesSummary, listEdits } from "@/lib/edits/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiPermission("edits.view");
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "summary";
  const scope = await resolveDataScope(auth.user);
  const fileIds = scope.fileIds === null ? undefined : scope.fileIds;
  try {
    if (view === "summary") {
      return NextResponse.json(
        { files: await getEditedFilesSummary(fileIds) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const fileId = params.get("fileId")?.trim() || undefined;
    if (fileId && fileIds && !fileIds.includes(fileId))
      return NextResponse.json({ error: "غير موجود." }, { status: 404 });
    const page = Number(params.get("page") ?? "1");
    const pageSize = Number(params.get("pageSize") ?? "25");
    return NextResponse.json(await listEdits({ fileId, fileIds: fileId ? undefined : fileIds, page, pageSize }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل سجل التعديلات." }, { status: 500 });
  }
}
