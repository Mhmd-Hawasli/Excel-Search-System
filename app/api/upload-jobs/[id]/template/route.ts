import { ActivityAction, Prisma, UploadJobStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { uploadConfigSchema } from "@/lib/excel/config";
import { columnSignature } from "@/lib/excel/workbook";

const schema = z.object({ name: z.string().trim().min(2).max(120) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "أدخل اسمًا واضحًا للقالب." }, { status: 400 });
  const job = await prisma.uploadJob.findUnique({ where: { id } });
  const config = job ? uploadConfigSchema.safeParse(job.payload) : null;
  if (!job || job.status !== UploadJobStatus.DONE || !config?.success) return NextResponse.json({ error: "لا يمكن حفظ قالب قبل اكتمال الاستيراد." }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.mappingTemplate.create({ data: { groupId: config.data.groupId, name: input.data.name, headerSignature: columnSignature(config.data.columns.map((column) => column.headerRaw)), mapping: { columns: config.data.columns } as Prisma.InputJsonValue } });
      await tx.activityLog.create({ data: { action: ActivityAction.TEMPLATE_CREATED, targetName: input.data.name, details: { groupId: config.data.groupId } } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "يوجد قالب بهذا الاسم داخل المجموعة." }, { status: 409 });
    return NextResponse.json({ error: "تعذر حفظ القالب." }, { status: 500 });
  }
}
