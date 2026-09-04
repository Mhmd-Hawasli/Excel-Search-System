import { NextResponse } from "next/server";
import { getEditedFilesSummary, listEdits } from "@/lib/edits/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "summary";
  try {
    if (view === "summary") {
      return NextResponse.json(
        { files: await getEditedFilesSummary() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const fileId = params.get("fileId")?.trim() || undefined;
    const page = Number(params.get("page") ?? "1");
    const pageSize = Number(params.get("pageSize") ?? "25");
    return NextResponse.json(await listEdits({ fileId, page, pageSize }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل سجل التعديلات." }, { status: 500 });
  }
}
