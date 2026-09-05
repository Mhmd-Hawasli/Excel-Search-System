import { NextResponse } from "next/server";
import { storeUploadedWorkbook } from "@/lib/sheet-merge/store";
import { buildUploadInspection, parseUploadedWorkbook } from "@/lib/sheet-merge/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload of the isolated "دمج صفحات ملف اكسيل" section.
 *
 * The workbook is parsed straight from the request buffer into a temporary
 * in-memory session — it is never written to disk and never reaches the
 * archive database. Progress is streamed as newline-delimited JSON so the
 * wizard can show a real percentage while a large workbook is read.
 */
export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "يرجى اختيار ملف Excel." }, { status: 400 });
  if (!/\.(xlsx|xls)$/i.test(file.name))
    return NextResponse.json({ error: "الصيغ المقبولة هي XLSX وXLS فقط." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (message: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        const uploaded = await parseUploadedWorkbook(buffer, file.name, (percent, detail) =>
          send({ type: "progress", percent, detail }),
        );
        send({
          type: "ready",
          payload: storeUploadedWorkbook(uploaded, buildUploadInspection(uploaded)),
        });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "تعذر قراءة الملف.",
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
