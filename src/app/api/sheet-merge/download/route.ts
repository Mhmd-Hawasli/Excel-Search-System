import { getSheetMergeExport } from "@/lib/sheet-merge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves the workbook prepared in memory by /api/sheet-merge/export. */
export async function GET(request: Request) {
  const downloadId = new URL(request.url).searchParams.get("id");
  if (!downloadId) return Response.json({ error: "معرّف التصدير مفقود." }, { status: 400 });
  try {
    const payload = getSheetMergeExport(downloadId);
    return new Response(new Uint8Array(payload.buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(payload.filename)}`,
        "content-length": String(payload.size),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذر تنزيل الملف." },
      { status: 404 },
    );
  }
}
