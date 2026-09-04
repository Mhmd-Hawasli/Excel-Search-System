import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink, FileStack, IdCard, PencilLine } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { RecordDetails } from "@/components/record-details";
import { getRecordEdits } from "@/lib/edits/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNationalId } from "@/lib/format/national-id";
import { formatUploadDateTime } from "@/lib/format/date";
import type { StandardFieldKey } from "@/lib/excel/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const record = await prisma.record.findUnique({
    where: { id },
    select: { sfFullName: true, sfFirstName: true, sfFatherName: true, sfLastName: true },
  });
  if (!record) return { title: { absolute: "السجل غير موجود" } };
  const displayName =
    record.sfFullName ||
    [record.sfFirstName, record.sfFatherName, record.sfLastName].filter(Boolean).join(" ") ||
    "سجل بلا اسم";
  return { title: { absolute: displayName } };
}

function rowData(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : item == null ? "" : String(item),
    ]),
  );
}

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await prisma.record.findUnique({
    where: { id },
    include: {
      file: {
        include: {
          group: true,
          columns: {
            orderBy: [{ sortOrder: "asc" }, { columnIndex: "asc" }],
            include: { category: true },
          },
        },
      },
    },
  });
  if (!record) notFound();
  const { edits: recordEdits, editedHeaders } = await getRecordEdits(id);
  const related =
    record.nationalIdNum === null
      ? []
      : await prisma.record.findMany({
          where: { nationalIdNum: record.nationalIdNum, id: { not: record.id } },
          orderBy: { createdAt: "desc" },
          include: { file: { include: { group: true } } },
        });
  const data = rowData(record.data);
  const columns = record.file.columns.map((column) => ({
    id: column.id,
    headerRaw: column.headerRaw,
    categoryId: column.categoryId,
    categoryName: column.category?.name ?? null,
    categoryOrder: column.category?.sortOrder ?? null,
    standardField: column.standardField
      ? (column.standardField.toLowerCase() as StandardFieldKey)
      : null,
    value: data[column.headerRaw] ?? "",
  }));
  const displayName =
    record.sfFullName ||
    [record.sfFirstName, record.sfFatherName, record.sfLastName].filter(Boolean).join(" ") ||
    "سجل بلا اسم";
  return (
    <div className="space-y-7">
      <Button asChild variant="ghost" size="sm">
        <Link href="/search">
          <ArrowRight className="size-4" />
          العودة إلى البحث
        </Link>
      </Button>
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/12 via-card to-card p-6 shadow-soft md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-bold text-primary">سجل شخصي</p>
            <h1 className="mt-2 text-3xl font-black">{displayName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <IdCard className="size-3" />
                <span className="ltr-numbers">
                  {formatNationalId(record.sfNationalId ?? record.dNationalId) ||
                    "لا يوجد رقم وطني صالح"}
                </span>
              </Badge>
              <Badge variant="secondary">
                {record.file.group.name} — {record.file.name}
              </Badge>
              {recordEdits.length ? (
                <Badge
                  variant="outline"
                  className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <PencilLine className="size-3" />
                  يحتوي {recordEdits.length} {recordEdits.length === 1 ? "تعديل" : "تعديلات"} يدوية
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>{record.file.description || record.file.originalFilename}</p>
            <p className="mt-1 ltr-numbers text-right">
              تاريخ الرفع: {formatUploadDateTime(record.file.uploadedAt)}
            </p>
          </div>
        </div>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>بيانات السجل الأصلية</CardTitle>
          <CardDescription>
            القيم الأصلية محفوظة كما وردت في Excel. تُنسّق التواريخ ويُعرض الرقم الوطني بـ11 خانة مع
            تعبئة الأصفار على اليسار، دون اقتطاع القيم الأطول. يمكن تعديل أي حقل بزر القلم؛ يُحفظ
            التعديل في سجل منفصل مع القيمة القديمة والجديدة ويُحدَّث البحث فورًا، والحقل المعدّل
            يحمل شارة «معدّل».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecordDetails
            recordId={record.id}
            columns={columns}
            editedHeaders={Object.fromEntries(
              Object.entries(editedHeaders).map(([header, info]) => [
                header,
                { ...info, lastAt: info.lastAt.toISOString() },
              ]),
            )}
          />
        </CardContent>
      </Card>
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="size-5 text-primary" />
            ملفات أخرى لهذا الشخص <Badge>{related.length}</Badge>
          </CardTitle>
          <CardDescription>
            سجلات أخرى تحمل الرقم الوطني نفسه عبر كل المجموعات والملفات.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {record.nationalIdNum === null ? (
            <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              لا يمكن الربط لأن هذا السجل لا يحتوي رقمًا وطنيًا صالحًا.
            </p>
          ) : related.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد سجلات أخرى تحمل الرقم الوطني نفسه.
            </p>
          ) : (
            <div className="grid gap-3">
              {related.map((item) => (
                <Link
                  key={item.id}
                  href={`/records/${item.id}`}
                  className="flex items-center justify-between rounded-lg border p-4 transition hover:border-primary hover:bg-primary/5"
                >
                  <div>
                    <p className="font-bold">
                      {item.file.group.name} — {item.file.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground ltr-numbers text-right">
                      {formatUploadDateTime(item.file.uploadedAt)}
                    </p>
                  </div>
                  <ExternalLink className="size-4 text-primary" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
