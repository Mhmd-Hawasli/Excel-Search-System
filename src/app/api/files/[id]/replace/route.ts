import { randomUUID } from "node:crypto";
import { Prisma, UploadJobStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { uploadConfigSchema, linkedMappingError } from "@/lib/excel/config";
import { runReplacementJob } from "@/lib/excel/replacement-worker";

export const runtime = "nodejs";

const requestSchema = uploadConfigSchema
  .omit({ groupId: true, name: true, description: true })
  .extend({ mode: z.enum(["same", "different"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [target, input] = await Promise.all([
    prisma.file.findUnique({
      where: { id },
      include: { columns: { orderBy: { columnIndex: "asc" } } },
    }),
    request.json().catch(() => null),
  ]);
  if (!target)
    return NextResponse.json({ error: "الملف المراد تحديثه غير موجود." }, { status: 404 });
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    return NextResponse.json({ error: "إعدادات الاستبدال غير مكتملة." }, { status: 400 });
  const sameStructure =
    target.columns.length === parsed.data.columns.length &&
    target.columns.every(
      (column, index) => column.headerNormalized === parsed.data.columns[index]?.headerNormalized,
    );
  if (parsed.data.mode === "same" && !sameStructure)
    return NextResponse.json(
      { error: "تغيرت بنية الأعمدة؛ يجب إنشاء إصدار بديل مع ربط جديد." },
      { status: 409 },
    );
  const columns =
    parsed.data.mode === "same"
      ? parsed.data.columns.map((column, index) => ({
          ...column,
          standardField: target.columns[index]?.standardField
            ? (target.columns[index].standardField.toLowerCase() as NonNullable<
                typeof column.standardField
              >)
            : null,
          categoryId: target.columns[index]?.categoryId ?? null,
        }))
      : parsed.data.columns;
  const linkingError = linkedMappingError({ ...parsed.data, columns });
  if (linkingError) return NextResponse.json({ error: linkingError }, { status: 400 });
  const duplicateFields = columns
    .map((column) => column.standardField)
    .filter((field): field is NonNullable<typeof field> => Boolean(field))
    .filter((field, index, fields) => fields.indexOf(field) !== index);
  if (duplicateFields.length)
    return NextResponse.json(
      { error: "لا يمكن ربط حقل قياسي واحد بأكثر من عمود." },
      { status: 400 },
    );
  const categoryIds = Array.from(
    new Set(
      columns.map((column) => column.categoryId).filter((value): value is string => Boolean(value)),
    ),
  );
  if (
    categoryIds.length &&
    (await prisma.category.count({ where: { id: { in: categoryIds } } })) !== categoryIds.length
  )
    return NextResponse.json({ error: "توجد فئة لم تعد متاحة." }, { status: 400 });
  const temporaryName = `مؤقت-${randomUUID()}`;
  const config = {
    token: parsed.data.token,
    groupId: target.groupId,
    name: temporaryName,
    description: target.description,
    originalFilename: parsed.data.originalFilename,
    sheetName: parsed.data.sheetName,
    sheetIndex: parsed.data.sheetIndex,
    totalRows: parsed.data.totalRows,
    ...(parsed.data.linkedSheets ? { linkedSheets: parsed.data.linkedSheets } : {}),
    columns,
  };
  try {
    const job = await prisma.uploadJob.create({
      data: {
        status: UploadJobStatus.PENDING,
        totalRows: config.totalRows,
        payload: config as Prisma.InputJsonValue,
      },
    });
    setImmediate(() => {
      void runReplacementJob(job.id, target.id, parsed.data.mode, temporaryName);
    });
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "تعذر بدء مهمة استبدال الملف." }, { status: 500 });
  }
}
