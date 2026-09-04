import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { STANDARD_FIELD_KEYS } from "@/lib/excel/types";
import { updateFileMappingAndRecompute } from "@/lib/excel/update-mapping-service";

export const dynamic = "force-dynamic";

const strictBodySchema = z.object({
  columns: z.array(
    z.object({
      id: z.string().uuid(),
      standardField: z.string().nullable(),
      categoryId: z.string().uuid().nullable(),
    }),
  ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: fileId } = await params;

  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) {
    return NextResponse.json({ error: "الملف غير موجود." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "جسم الطلب غير صالح." }, { status: 400 });
  }

  const parsed = strictBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات الأعمدة غير صالحة.", details: parsed.error.flatten() }, { status: 400 });
  }

  // Normalize empty string to null for standardField and validate against allowed keys
  const normalizedColumns: Array<{ id: string; standardField: (typeof STANDARD_FIELD_KEYS)[number] | null; categoryId: string | null }> = [];
  for (const col of parsed.data.columns) {
    let sf: string | null = col.standardField;
    if (sf === "") sf = null;
    if (sf !== null && !STANDARD_FIELD_KEYS.includes(sf as (typeof STANDARD_FIELD_KEYS)[number])) {
      return NextResponse.json({ error: `حقل قياسي غير معروف: ${sf}` }, { status: 400 });
    }
    normalizedColumns.push({
      id: col.id,
      standardField: sf as (typeof STANDARD_FIELD_KEYS)[number] | null,
      categoryId: col.categoryId,
    });
  }

  // Validate duplicate standardField here for friendly error
  const seen = new Set<string>();
  for (const col of normalizedColumns) {
    if (!col.standardField) continue;
    if (seen.has(col.standardField)) {
      return NextResponse.json({ error: "لا يمكن ربط حقل قياسي واحد بأكثر من عمود." }, { status: 400 });
    }
    seen.add(col.standardField);
  }

  try {
    const result = await updateFileMappingAndRecompute(fileId, normalizedColumns);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل تحديث الأعمدة.";
    const status =
      message.includes("لا يمكن") ||
      message.includes("غير موجود") ||
      message.includes("لا يطابق") ||
      message.includes("غير معروف")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: fileId } = await params;
  const file = await prisma.file.findFirst({
    where: { id: fileId },
    include: { columns: { orderBy: { columnIndex: "asc" }, include: { category: true } } },
  });
  if (!file) return NextResponse.json({ error: "الملف غير موجود." }, { status: 404 });
  return NextResponse.json({
    fileId: file.id,
    name: file.name,
    columns: file.columns.map((c) => ({
      id: c.id,
      headerRaw: c.headerRaw,
      headerNormalized: c.headerNormalized,
      columnIndex: c.columnIndex,
      standardField: c.standardField ? c.standardField.toLowerCase() : null,
      categoryId: c.categoryId,
      categoryName: c.category?.name ?? null,
    })),
  });
}
