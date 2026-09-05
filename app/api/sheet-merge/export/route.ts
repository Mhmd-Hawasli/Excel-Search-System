import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareSheetMergeExport } from "@/lib/sheet-merge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ sessionId: z.string().uuid() });

/**
 * Prepares the export workbook in memory (streaming progress events) and
 * returns a download id; the bytes themselves are served by
 * `/api/sheet-merge/download` so the wizard can show a real download
 * percentage from `content-length`.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "معرّف الجلسة غير صالح." }, { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (message: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        const ready = await prepareSheetMergeExport(parsed.data.sessionId, (percent, detail) =>
          send({ type: "progress", percent: Math.round(percent * 0.6), detail }),
        );
        send({ type: "ready", payload: ready });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "تعذر تصدير الملف.",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}
