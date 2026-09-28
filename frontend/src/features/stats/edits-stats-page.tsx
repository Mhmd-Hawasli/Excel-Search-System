"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileSpreadsheet, PencilLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { LoadingScreen } from "@/components/loading-screen";
import { PageHeader } from "@/components/page-header";
import { formatIsoDateTime } from "@/lib/format/date";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import { editsService, type EditedFileSummary } from "@/services/edits.service";
import { useApiQuery } from "@/hooks/use-api-query";

/** احصائيات تعديل السجلات: إجماليات + كل ملف يفتح سجله. الدخول يتطلب stats.view مع edits.view. */
export function EditsStatsPage() {
  const [files, setFiles] = useState<EditedFileSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: user } = useApiQuery(() => authService.me(), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const summary = await editsService.summary();
        if (active) setFiles(summary.files);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "تعذر تحميل الاحصائيات.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const totalEdits = files.reduce((sum, file) => sum + file.editCount, 0);

  if (
    user &&
    (!hasPermission(user.permissions, "stats.view") ||
      !hasPermission(user.permissions, "edits.view"))
  ) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="الاحصائيات"
          title="احصائيات تعديل السجلات"
          description="انقر أي ملف لفتح سجل تعديلاته التفصيلي."
        />
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          لا تملك صلاحية عرض هذه الصفحة.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="الاحصائيات"
        title="احصائيات تعديل السجلات"
        description="انقر أي ملف لفتح سجل تعديلاته التفصيلي."
      />
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? (
        <LoadingScreen message="جارٍ تحميل احصائيات التعديلات…" />
      ) : files.length === 0 ? (
        <EmptyState title="لا توجد تعديلات" description="لا يوجد ملفات معدلة بعد." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <FileSpreadsheet className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-2xl font-black tabular-nums">
                    {files.length.toLocaleString("en-US")}
                  </span>
                  <span className="block text-xs text-muted-foreground">ملفات معدلة</span>
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <PencilLine className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-2xl font-black tabular-nums">
                    {totalEdits.toLocaleString("en-US")}
                  </span>
                  <span className="block text-xs text-muted-foreground">مجموع التعديلات</span>
                </span>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-3">
            {files.map((file) => (
              <Link key={file.fileId} href={`/edits/${file.fileId}`} aria-label={`${file.fileName} — عرض سجل التعديلات`}>
                <Card className="transition hover:border-primary/40 hover:bg-accent/30">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-primary">{file.fileName}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {file.groupName} •{" "}
                        <time className="ltr-numbers" dateTime={file.lastEditAt}>
                          {formatIsoDateTime(file.lastEditAt)}
                        </time>
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-sm font-black tabular-nums">
                      {file.editCount.toLocaleString("en-US")} تعديل
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
