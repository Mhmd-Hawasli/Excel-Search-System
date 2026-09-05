import { NextResponse } from "next/server";
import { z } from "zod";
import { createMergeSession } from "@/lib/merge/session";
import { MERGE_FIELD_KEYS } from "@/lib/merge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mappingSchema = z
  .record(z.enum(MERGE_FIELD_KEYS), z.number().int().min(0))
  .superRefine((mapping, ctx) => {
    const values = Object.values(mapping);
    if (new Set(values).size !== values.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "لا يمكن ربط حقلين بنفس العمود." });
  });

const tableSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  sheetName: z.string().trim().min(1),
  mapping: mappingSchema,
});

const bodySchema = z.object({
  left: tableSchema,
  right: tableSchema,
});

function hasCommonRule(left: z.infer<typeof mappingSchema>, right: z.infer<typeof mappingSchema>) {
  const both = (field: keyof typeof left) =>
    left[field] !== undefined && right[field] !== undefined;
  const parts = (mapping: z.infer<typeof mappingSchema>) =>
    mapping.firstName !== undefined ||
    mapping.fatherName !== undefined ||
    mapping.lastName !== undefined;
  const nameable = (mapping: z.infer<typeof mappingSchema>) =>
    mapping.fullName !== undefined || parts(mapping);
  return (
    both("fullName") ||
    (nameable(left) && nameable(right)) ||
    both("nationalId") ||
    both("personalNo") ||
    both("shamCash") ||
    both("phone")
  );
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "بيانات الربط غير صالحة. تأكد من تحديد الأعمدة بشكل صحيح." },
      { status: 400 },
    );
  const { left, right } = parsed.data;
  if (!hasCommonRule(left.mapping, right.mapping))
    return NextResponse.json(
      {
        error:
          "لا توجد قاعدة ربط ممكنة: يجب تحديد عمود الاسم الثلاثي (أو أعمدة الاسم واسم الأب والنسبة) أو أحد الأرقام في الجدولين.",
      },
      { status: 422 },
    );
  // Stream newline-delimited progress events followed by the final result, so
  // the UI can show a real percentage while large tables are processed.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (message: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        const { session, result } = await createMergeSession(parsed.data, (percent, _stage, detail) =>
          send({ type: "progress", percent, detail }),
        );
        send({
          type: "result",
          payload: {
            sessionId: session.id,
            leftHeaders: session.left.headers,
            rightHeaders: session.right.headers,
            ...result,
          },
        });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "تعذر تنفيذ الدمج." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}
