import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FilterX,
  PencilLine,
} from "lucide-react";
import { getEditedFilesSummary, listEdits } from "@/lib/edits/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUploadDateTime } from "@/lib/format/date";

export const dynamic = "force-dynamic";

export default async function EditsPage({
  searchParams,
}: {
  searchParams: Promise<{ fileId?: string; page?: string; pageSize?: string }>;
}) {
  const { fileId, page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(10, Number(pageSizeParam ?? "25") || 25));

  const [files, table] = await Promise.all([
    getEditedFilesSummary(),
    listEdits({ fileId: fileId?.trim() || undefined, page, pageSize }),
  ]);

  const activeFile = fileId?.trim()
    ? files.find((f) => f.fileId === fileId.trim())
    : undefined;

  function tableLink(targetPage: number) {
    const params = new URLSearchParams();
    if (fileId?.trim()) params.set("fileId", fileId.trim());
    params.set("page", String(targetPage));
    params.set("pageSize", String(pageSize));
    return `/edits?${params.toString()}`;
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="التعديلات والتصدير"
        description="كل تعديل يدوي على حقول السجلات محفوظ في سجل منفصل مع القيمة القديمة والجديدة. صدّر أي ملف معدل إلى Excel كامل بالقيم الحالية."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            الملفات التي طرأ عليها تعديل
            <Badge>{files.length}</Badge>
          </CardTitle>
          <CardDescription>
            كل ملف معدل يحمل علامة «معدّل» في كل صفحات النظام. التصدير يشمل جميع الصفوف بالقيم
            الحالية بعد التعديل، مع تمييز الأعمدة المعدلة وورقة «سجل التعديلات».
          </CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <EmptyState
              title="لا توجد تعديلات بعد"
              description="عدّل أي حقل من صفحة السجل الشخصي بزر القلم، وستظهر الملفات المعدلة هنا مع سجل التعديلات وأزرار التصدير."
              action={
                <Button asChild>
                  <Link href="/search">الذهاب إلى البحث</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3">
              {files.map((file) => (
                <div
                  key={file.fileId}
                  className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      <Link
                        href={`/groups/${file.groupId}/files/${file.fileId}`}
                        className="truncate text-primary hover:underline"
                      >
                        {file.fileName}
                      </Link>
                      <Badge
                        variant="outline"
                        className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        <PencilLine className="size-3" />
                        معدّل
                      </Badge>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {file.groupName} · {file.rowCount.toLocaleString("en-US")} سجل ·{" "}
                      {file.editCount.toLocaleString("en-US")}{" "}
                      {file.editCount === 1 ? "تعديل" : "تعديلات"} · آخر تعديل{" "}
                      <span className="ltr-numbers">
                        {file.lastEditAt ? formatUploadDateTime(file.lastEditAt) : "—"}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={
                          fileId?.trim() === file.fileId
                            ? "/edits"
                            : `/edits?fileId=${file.fileId}`
                        }
                      >
                        {fileId?.trim() === file.fileId ? (
                          <>
                            <FilterX className="size-4" />
                            إلغاء التصفية
                          </>
                        ) : (
                          <>
                            <ArrowLeft className="size-4" />
                            عرض تعديلاته
                          </>
                        )}
                      </Link>
                    </Button>
                    <Button asChild size="sm">
                      <a href={`/api/files/${file.fileId}/export`}>
                        <Download className="size-4" />
                        تصدير Excel
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PencilLine className="size-5 text-primary" />
            جدول كل التعديلات
            <Badge variant="secondary">{table.total.toLocaleString("en-US")}</Badge>
          </CardTitle>
          <CardDescription>
            {activeFile
              ? `تعديلات الملف «${activeFile.fileName}» فقط — القيمة القديمة من Excel والقيمة الجديدة الحالية.`
              : "جميع التعديلات في النظام من الأحدث — القيمة القديمة من Excel والقيمة الجديدة الحالية."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {table.total === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              لا توجد تعديلات مطابقة.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-3 text-right">الملف</th>
                      <th className="p-3 text-right">الاسم الثلاثي</th>
                      <th className="p-3 text-right">صف Excel</th>
                      <th className="p-3 text-right">العمود</th>
                      <th className="p-3 text-right">القيمة القديمة</th>
                      <th className="p-3 text-right">القيمة الجديدة</th>
                      <th className="p-3 text-right">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.edits.map((edit) => (
                      <tr key={edit.id} className="border-t align-top">
                        <td className="p-3">
                          <Link
                            href={`/groups/${edit.groupId}/files/${edit.fileId}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {edit.fileName}
                          </Link>
                          <p className="mt-1 text-xs text-muted-foreground">{edit.groupName}</p>
                        </td>
                        <td className="p-3">
                          <Link
                            href={`/records/${edit.recordId}`}
                            className="font-semibold hover:text-primary hover:underline"
                          >
                            {edit.fullName || "—"}
                          </Link>
                        </td>
                        <td className="p-3">
                          <Link
                            href={`/records/${edit.recordId}`}
                            className="font-mono text-primary hover:underline ltr-numbers"
                          >
                            {edit.rowIndex}
                          </Link>
                        </td>
                        <td className="p-3 font-semibold">{edit.headerRaw}</td>
                        <td className="max-w-56 break-words p-3 text-muted-foreground ltr-numbers text-right">
                          {edit.oldValue || "—"}
                        </td>
                        <td className="max-w-56 break-words p-3 font-semibold ltr-numbers text-right">
                          {edit.newValue || "—"}
                        </td>
                        <td className="whitespace-nowrap p-3 text-xs text-muted-foreground ltr-numbers">
                          {formatUploadDateTime(edit.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {table.page <= 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    <ChevronRight className="size-4" />
                    السابق
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={tableLink(table.page - 1)}>
                      <ChevronRight className="size-4" />
                      السابق
                    </Link>
                  </Button>
                )}
                <span className="text-sm text-muted-foreground">
                  الصفحة {table.page} من {table.pageCount}
                </span>
                {table.page >= table.pageCount ? (
                  <Button variant="outline" size="sm" disabled>
                    التالي
                    <ChevronLeft className="size-4" />
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={tableLink(table.page + 1)}>
                      التالي
                      <ChevronLeft className="size-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
