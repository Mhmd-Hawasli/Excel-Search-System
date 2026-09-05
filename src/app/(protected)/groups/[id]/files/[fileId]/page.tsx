import Link from "next/link";
import { ArrowRight, Download, RefreshCw, ShieldCheck, SlidersHorizontal, PencilLine } from "lucide-react";
import { notFound } from "next/navigation";
import { deleteFile } from "@/lib/actions/files";
import { STANDARD_FIELD_LABELS } from "@/lib/excel/standard-fields";
import type { StandardFieldKey } from "@/lib/excel/types";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/page-header";
import { TypedDeleteButton } from "@/components/typed-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUploadDateTime } from "@/lib/format/date";

export const dynamic = "force-dynamic";

export default async function FilePage({ params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const file = await prisma.file.findFirst({
    where: { id: fileId, groupId: id },
    include: {
      columns: { orderBy: { columnIndex: "asc" }, include: { category: true } },
      dataQualityIssues: { select: { id: true } },
    },
  });
  if (!file) notFound();
  const editCount = await prisma.recordEdit.count({ where: { fileId: file.id } });

  return (
    <div className="space-y-7">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/groups/${id}`}>
          <ArrowRight className="size-4" />
          العودة إلى المجموعة
        </Link>
      </Button>

      <PageHeader
        eyebrow={`الإصدار ${file.version}`}
        title={file.name}
        description={file.description || file.originalFilename}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/groups/${id}/files/${file.id}/quality`}>
                <ShieldCheck className="size-4" />
                تقرير الجودة
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/groups/${id}/files/${file.id}/edit`}>
                <SlidersHorizontal className="size-4" />
                تعديل الأعمدة والفئات
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/groups/${id}/files/${file.id}/update`}>
                <RefreshCw className="size-4" />
                تحديث الملف
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/edits?fileId=${file.id}`}>
                <PencilLine className="size-4" />
                سجل التعديلات{editCount ? ` (${editCount})` : ""}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/files/${file.id}/export`}>
                <Download className="size-4" />
                تصدير Excel
              </a>
            </Button>
            <TypedDeleteButton
              id={file.id}
              entityName={file.name}
              description={`سيُحذف ${file.rowCount.toLocaleString("en-US")} سجل و${file.columns.length} عمود نهائيًا. لا يمكن التراجع عن ذلك.`}
              action={deleteFile}
            />
          </div>
        }
      />

      {editCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/60 bg-amber-50 p-4 text-sm md:flex-row md:items-center md:justify-between dark:bg-amber-950/20">
          <p className="font-bold flex items-center gap-2 text-amber-900 dark:text-amber-100">
            <PencilLine className="size-4" />
            هذا الملف تم تعديله يدويًا
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/edits?fileId=${file.id}`}>عرض سجل التعديلات</Link>
            </Button>
            <Button asChild size="sm">
              <a href={`/api/files/${file.id}/export`}>
                <Download className="size-4" />
                تصدير Excel بالقيم المعدلة
              </a>
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 rounded-xl border bg-amber-500/5 p-4 text-sm leading-relaxed">
        <p className="font-bold flex items-center gap-2">
          <PencilLine className="size-4 text-amber-600" />
          الفرق بين التحديث والتعديل
        </p>
        <ul className="list-disc ps-5 text-muted-foreground space-y-1">
          <li>
            <span className="font-semibold text-foreground">تحديث الملف:</span> رفع مصنف Excel جديد ليحل محل البيانات الحالية (للبيانات الجديدة أو تغيير بنية الأعمدة في المصدر).
          </li>
          <li>
            <span className="font-semibold text-foreground">تعديل الأعمدة والفئات:</span> تعديل شامل دون إعادة رفع — اختيار الأعمدة المرجعية (حقول البحث) وتوزيع الفئات كما في معالج الرفع، ثم إعادة حساب كل السجلات المحفوظة فورًا.
          </li>
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">السجلات</p>
            <p className="mt-2 text-2xl font-black">{file.rowCount.toLocaleString("en-US")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">الأعمدة</p>
            <p className="mt-2 text-2xl font-black">{file.columns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">مشكلات الجودة</p>
            <p className="mt-2 text-2xl font-black">{file.dataQualityIssues.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">تاريخ الرفع</p>
            <p className="mt-2 font-black ltr-numbers text-right">{formatUploadDateTime(file.uploadedAt)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>خريطة الأعمدة</CardTitle>
          <CardDescription>
            الأعمدة كما حُفظت من Excel، مع الحقل القياسي والفئة الحالية. استخدم &quot;تعديل الأعمدة والفئات&quot; لتغيير الربط وإعادة حساب البيانات.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-right">#</th>
                <th className="p-3 text-right">عنوان Excel</th>
                <th className="p-3 text-right">حقل البحث</th>
                <th className="p-3 text-right">الفئة</th>
              </tr>
            </thead>
            <tbody>
              {file.columns.map((column) => (
                <tr key={column.id} className="border-t">
                  <td className="p-3">{column.columnIndex}</td>
                  <td className="p-3 font-bold">{column.headerRaw}</td>
                  <td className="p-3">
                    {column.standardField ? (
                      <Badge variant="secondary">
                        {STANDARD_FIELD_LABELS[column.standardField.toLowerCase() as StandardFieldKey]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">{column.category?.name ?? "أخرى"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
