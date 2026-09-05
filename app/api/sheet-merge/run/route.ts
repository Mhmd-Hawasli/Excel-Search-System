import { NextResponse } from "next/server";
import { z } from "zod";
import { createSheetMergeSession } from "@/lib/sheet-merge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  uploadId: z.string().uuid(),
  /** 0-based national-id column of the FIRST sheet. */
  nationalIdColumn: z.number().int().min(0),
  /** Additional sheets to merge; the workbook order is applied server-side. */
  sheetNames: z.array(z.string().trim().min(1)).min(1).max(250),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "بيانات الدمج غير صالحة. تأكد من تحديد الصفحة الأولى وعمود الرقم الوطني." },
      { status: 400 },
    );

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (message: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        const session = createSheetMergeSession(parsed.data, (percent, detail) =>
          send({ type: "progress", percent, detail }),
        );
        send({ type: "result", payload: session.result });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "تعذر تنفيذ دمج الصفحات.",
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
