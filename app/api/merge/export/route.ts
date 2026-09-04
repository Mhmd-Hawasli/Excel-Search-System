import { exportMergeWorkbook } from "@/lib/merge/exporter";
import { sessionContent } from "@/lib/merge/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "معرّف الجلسة مفقود." }, { status: 400 });
  try {
    const session = sessionContent(sessionId);
    const buffer = await exportMergeWorkbook(
      { headers: session.left.headers, rows: session.left.rows },
      { headers: session.right.headers, rows: session.right.rows },
    );
    const date = new Date().toISOString().slice(0, 10);
    const filename = `دمج-الملفات-${date}.xlsx`;
    const encoded = encodeURIComponent(filename);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encoded}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذر تصدير الملف." },
      { status: 404 },
    );
  }
}
