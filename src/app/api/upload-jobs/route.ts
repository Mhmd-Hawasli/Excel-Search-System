import { Prisma, UploadJobStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { uploadConfigSchema, linkedMappingError } from "@/lib/excel/config";
import { runImportJob } from "@/lib/excel/import-worker";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = uploadConfigSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "إعدادات الاستيراد غير مكتملة. راجع خطوات المعالج." },
      { status: 400 },
    );
  const linkingError = linkedMappingError(parsed.data);
  if (linkingError) return NextResponse.json({ error: linkingError }, { status: 400 });
  const duplicateFields = parsed.data.columns
    .map((column) => column.standardField)
    .filter((field): field is NonNullable<typeof field> => Boolean(field))
    .filter((field, index, fields) => fields.indexOf(field) !== index);
  if (duplicateFields.length)
    return NextResponse.json(
      { error: "لا يمكن ربط حقل قياسي واحد بأكثر من عمود." },
      { status: 400 },
    );
  const [group, categories] = await Promise.all([
    prisma.group.findUnique({ where: { id: parsed.data.groupId }, select: { id: true } }),
    prisma.category.count({
      where: {
        id: {
          in: parsed.data.columns
            .map((column) => column.categoryId)
            .filter((id): id is string => Boolean(id)),
        },
      },
    }),
  ]);
  if (!group) return NextResponse.json({ error: "المجموعة المحددة غير موجودة." }, { status: 404 });
  const selectedCategoryIds = new Set(
    parsed.data.columns.map((column) => column.categoryId).filter(Boolean),
  );
  if (categories !== selectedCategoryIds.size)
    return NextResponse.json({ error: "توجد فئة محددة لم تعد متاحة." }, { status: 400 });
  try {
    const job = await prisma.uploadJob.create({
      data: {
        status: UploadJobStatus.PENDING,
        totalRows: parsed.data.totalRows,
        payload: parsed.data as Prisma.InputJsonValue,
      },
    });
    setImmediate(() => {
      void runImportJob(job.id);
    });
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json(
        { error: "اسم الملف مستخدم بالفعل. اختر اسمًا آخر." },
        { status: 409 },
      );
    return NextResponse.json(
      { error: "تعذر بدء مهمة الاستيراد. تحقق من اتصال قاعدة البيانات." },
      { status: 500 },
    );
  }
}
