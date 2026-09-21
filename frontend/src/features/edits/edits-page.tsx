"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { editsService, type EditedFileSummary } from "@/services/edits.service";
import { cn } from "@/lib/cn";

/**
 * ملخص الملفات المعدلة: كل ملف يفتح صفحة سجل داخلية خاصة به (/edits/[fileId]).
 */
export function EditsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [files, setFiles] = useState<EditedFileSummary[]>([]);
  const [canExport, setCanExport] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markEdits, setMarkEdits] = useState(false);

  // توافق خلفي: /edits?fileId=X كان يُستخدم من صفحة تفاصيل الملف —
  // يحوّل الآن إلى الصفحة الداخلية الخاصة بالملف.
  useEffect(() => {
    const legacy = searchParams.get("fileId");
    if (legacy) router.replace(`/edits/${legacy}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [summary, me] = await Promise.all([editsService.summary(), authService.me()]);
        if (!active) return;
        setFiles(summary.files);
        const perms = me?.permissions ?? [];
        setCanExport(hasPermission(perms, "export.run"));
        setShowBadge(hasPermission(perms, "edits.badge"));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "تعذر تحميل التعديلات.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="سجل التعديلات"
        title="إدارة التعديلات"
        description="اختر ملفًا لفتح صفحة سجل تعديلاته الخاصة، مع الفلترة والترتيب والتراجع."
      />

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : null}

      {!loading && !error ? (
        <Card className="border-2 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              الملفات المعدلة
              <Badge className="bg-primary/10 text-primary">{files.length}</Badge>
            </CardTitle>
            <CardDescription>لكل ملف صفحة سجل خاصة به — اضغط «عرض السجل» للانتقال إليها.</CardDescription>
            {canExport ? (
              <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={markEdits}
                  onChange={(e) => setMarkEdits(e.target.checked)}
                />
                تعليم القيم التي تم تعديلها
              </label>
            ) : null}
          </CardHeader>
          <CardContent>
            {files.length === 0 ? (
              <EmptyState
                title="لا توجد تعديلات"
                description="لا يوجد ملفات معدلة بعد."
                action={
                  <Button asChild>
                    <Link href="/search">الانتقال إلى البحث</Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3">
                {files.map((file) => {
                  return (
                    <div
                      key={file.fileId}
                      className={cn(
                        "rounded-xl border-2 p-4 transition-all",
                        "border-border hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 font-bold">
                            <Link
                              href={`/groups/${file.groupId}/files/${file.fileId}`}
                              className="truncate text-primary hover:underline"
                            >
                              {file.fileName}
                            </Link>
                            {showBadge ? (
                              <Badge
                                variant="outline"
                                className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                              >
                                <PencilLine className="size-3" />
                                معدّل
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {file.groupName} • {file.editCount} تعديل • آخر تعديل {file.lastEditAt}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/edits/${file.fileId}`}>عرض السجل</Link>
                          </Button>
                          {canExport ? (
                            <Button type="button" variant="outline" size="sm" asChild>
                              <a href={editsService.exportUrl(file.fileId, markEdits)}>
                                <Download className="size-4" />
                                تصدير الملف
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
