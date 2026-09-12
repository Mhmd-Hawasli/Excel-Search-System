"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { editsService, type EditedFileSummary, type EditHistoryPage } from "@/services/edits.service";

// Full UI-12 port (P3.4): edited-file summaries with counts/dates, file +
// history view selection, person-name history columns in source order, paging,
// per-file export, badge/view/export rights applied independently. Revert
// itself lives on the record page; history stays visible after changes.

const PAGE_SIZES = [10, 25, 50, 100];

export function EditsPage() {
  const [files, setFiles] = useState<EditedFileSummary[]>([]);
  const [history, setHistory] = useState<EditHistoryPage | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [canExport, setCanExport] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One-shot mount load; state settles inside the async fetch below.
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
    return () => {
      active = false;
    };
  }, []);

  // History reload on file/page change.
  useEffect(() => {
    if (!selectedFile) return;
    let active = true;
    // Intentional request-status sync (same pattern as use-api-query).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryLoading(true);
    editsService
      .history(selectedFile, page, pageSize)
      .then((result) => {
        if (active) setHistory(result);
      })
      .catch(() => {
        if (active) setHistory(null);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedFile, page, pageSize]);

  const activeFile = files.find((f) => f.fileId === selectedFile);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="سجل التعديلات"
        title="الملفات المعدلة"
        description="راجع الملفات التي طرأ عليها تعديل يدوي، وتصفح سجل التعديلات لكل ملف مع القيم القديمة والجديدة."
      />
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : null}

      {!loading && !error ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              الملفات المعدلة
              <Badge>{files.length}</Badge>
            </CardTitle>
            <CardDescription>اختر ملفًا لعرض سجل تعديلاته، أو صدّره كاملًا مع كل القيم المعدلة.</CardDescription>
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
                  const selected = file.fileId === selectedFile;
                  return (
                    <div
                      key={file.fileId}
                      className={`flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between ${selected ? "border-primary bg-primary/5" : ""}`}
                    >
                      <div className="min-w-0">
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
                        <Button
                          type="button"
                          variant={selected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setSelectedFile(selected ? "" : file.fileId);
                            setHistory(null);
                            setPage(1);
                          }}
                        >
                          {selected ? "إخفاء السجل" : "عرض السجل"}
                        </Button>
                        {canExport ? (
                          <Button type="button" variant="outline" size="sm" asChild>
                            <a href={editsService.exportUrl(file.fileId)}>
                              <Download className="size-4" />
                              تصدير الملف
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {selectedFile ? (
        <section aria-label="سجل تعديلات الملف" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">سجل التعديلات — {activeFile?.fileName}</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedFile(""); setHistory(null); }}>
              العودة إلى ملخص الملفات
            </Button>
          </div>
          {historyLoading && !history ? (
            <p className="text-sm text-muted-foreground">جارٍ تحميل السجل…</p>
          ) : history && history.items.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/70">
                    <tr>
                      <th scope="col" className="p-3 text-right font-bold">الشخص</th>
                      <th scope="col" className="p-3 text-right font-bold">العمود</th>
                      <th scope="col" className="p-3 text-right font-bold">القيمة القديمة</th>
                      <th scope="col" className="p-3 text-right font-bold">القيمة الجديدة</th>
                      <th scope="col" className="p-3 text-right font-bold">التاريخ</th>
                      <th scope="col" className="p-3 text-right font-bold">السجل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.items.map((item) => (
                      <tr key={item.id} className="border-t align-top transition hover:bg-muted/40">
                        <td className="p-3 font-semibold">{item.personName || "—"}</td>
                        <td className="p-3">{item.headerRaw}</td>
                        <td className="p-3 text-muted-foreground">{item.oldValue || "—"}</td>
                        <td className="p-3 font-semibold">{item.newValue || "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{item.createdAt}</td>
                        <td className="p-3">
                          <Link href={`/records/${item.recordId}`} className="text-primary hover:underline">
                            فتح السجل
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Pager page={history.page} pageSize={history.pageSize} total={history.total} onPage={setPage} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  حجم الصفحة
                  <select
                    aria-label="حجم الصفحة"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">للتراجع عن تعديل، افتح السجل ثم استخدم زر التراجع بجانب الحقل.</p>
            </>
          ) : (
            <EmptyState title="لا يوجد سجل لهذا الملف" description="لم تُسجَّل تعديلات بعد ضمن النطاق الحالي." />
          )}
        </section>
      ) : null}
    </div>
  );
}
