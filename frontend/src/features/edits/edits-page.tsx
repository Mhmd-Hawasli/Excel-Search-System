"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, PencilLine, Undo2, Search, X, Filter, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { formatShamCashStrict } from "@/lib/conflict-format";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { editsService, type EditedFileSummary, type EditHistoryPage, type EditsFilters } from "@/services/edits.service";
import { cn } from "@/lib/cn";

const PAGE_SIZES = [10, 25, 50, 100];

type SortableColumn = "person" | "column" | "oldvalue" | "newvalue" | "version" | "date" | "user";

export function EditsPage() {
  const [files, setFiles] = useState<EditedFileSummary[]>([]);
  const [history, setHistory] = useState<EditHistoryPage | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [canExport, setCanExport] = useState(false);
  const [canRevert, setCanRevert] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markEdits, setMarkEdits] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<EditsFilters>({ sortBy: "date", sortDir: "desc" });
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  const loadHistory = useCallback(async (fileId: string, pg: number, sz: number, flt: EditsFilters) => {
    if (!fileId) return;
    setHistoryLoading(true);
    try {
      const result = await editsService.history(fileId, pg, sz, flt);
      setHistory(result);
    } catch {
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
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
        setCanRevert(hasPermission(perms, "edits.update"));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "تعذر تحميل التعديلات.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    loadHistory(selectedFile, page, pageSize, filters);
  }, [selectedFile, page, pageSize, filters, loadHistory]);

  const activeFile = files.find((f) => f.fileId === selectedFile);

  function toggleFile(fileId: string) {
    const newSelected = selectedFile === fileId ? "" : fileId;
    setSelectedFile(newSelected);
    setHistory(null);
    setPage(1);
    setFilters({ sortBy: "date", sortDir: "desc" });
  }

  function handleSort(col: SortableColumn) {
    setFilters((prev) => ({
      ...prev,
      sortBy: col,
      sortDir: prev.sortBy === col && prev.sortDir === "desc" ? "asc" : "desc",
    }));
    setPage(1);
  }

  function applyFilters(newFilters: Partial<EditsFilters>) {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({ sortBy: "date", sortDir: "desc" });
    setPage(1);
  }

  async function handleRevert(item: { recordId: string | null; fileColumnId: string | null; headerRaw: string; oldValue: string }) {
    if (!item.recordId || revertingId) return;
    if (!window.confirm(`تراجع عن التعديل؟\nستعود القيمة إلى: ${item.oldValue || "—"}`)) return;
    setRevertingId(item.recordId);
    try {
      const result = await editsService.revertEdit(item.recordId, item.fileColumnId ?? undefined, item.headerRaw);
      if (result.ok && result.changed) {
        loadHistory(selectedFile, page, pageSize, filters);
      }
    } catch {
      // silent fail
    } finally {
      setRevertingId(null);
    }
  }

  function SortIcon({ col }: { col: SortableColumn }) {
    if (filters.sortBy !== col) return <ArrowUpDown className="size-3 opacity-40" />;
    return filters.sortDir === "asc" ? <ArrowUp className="size-3 text-primary" /> : <ArrowDown className="size-3 text-primary" />;
  }

  const hasActiveFilters = filters.person || filters.column || filters.oldValue || filters.newValue || filters.version || filters.fromDate || filters.toDate || filters.user;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="سجل التعديلات"
        title="إدارة التعديلات"
        description="راجع جميع التعديلات اليدوية، فلتر حسب أي عمود، وتراجع عن أي تعديل مباشرة."
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
            <CardDescription>اختر ملفًا لعرض وتعديل سجله، مع إمكانية الفلترة والترتيب حسب أي عمود.</CardDescription>
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
                  const selected = file.fileId === selectedFile;
                  return (
                    <div
                      key={file.fileId}
                      className={cn(
                        "rounded-xl border-2 p-4 transition-all",
                        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"
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
                          <Button
                            type="button"
                            variant={selected ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleFile(file.fileId)}
                          >
                            {selected ? "إخفاء السجل" : "عرض السجل"}
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

      {selectedFile ? (
        <section aria-label="سجل تعديلات الملف" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">سجل التعديلات — {activeFile?.fileName}</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedFile(""); setHistory(null); }}>
              العودة إلى ملخص الملفات
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="size-4" />
              الفلترة
              {hasActiveFilters && (
                <Badge className="bg-white text-primary ml-1">•</Badge>
              )}
            </Button>
            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <X className="size-4" />
                مسح الفلاتر
              </Button>
            )}
            <div className="mr-auto">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                حجم الصفحة
                <select
                  aria-label="حجم الصفحة"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
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
          </div>

          {showFilters ? (
            <Card className="bg-muted/20">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">الشخص</label>
                    <Input
                      type="text"
                      placeholder="ابحث بالاسم…"
                      value={filters.person || ""}
                      onChange={(e) => applyFilters({ person: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">العمود</label>
                    <Input
                      type="text"
                      placeholder="اسم العمود…"
                      value={filters.column || ""}
                      onChange={(e) => applyFilters({ column: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">القيمة القديمة</label>
                    <Input
                      type="text"
                      placeholder="القيمة القديمة…"
                      value={filters.oldValue || ""}
                      onChange={(e) => applyFilters({ oldValue: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">القيمة الجديدة</label>
                    <Input
                      type="text"
                      placeholder="القيمة الجديدة…"
                      value={filters.newValue || ""}
                      onChange={(e) => applyFilters({ newValue: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">الإصدار</label>
                    <Input
                      type="number"
                      placeholder="رقم الإصدار…"
                      value={filters.version || ""}
                      onChange={(e) => applyFilters({ version: e.target.value ? Number(e.target.value) : undefined })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">من تاريخ</label>
                    <Input
                      type="date"
                      value={filters.fromDate || ""}
                      onChange={(e) => applyFilters({ fromDate: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">إلى تاريخ</label>
                    <Input
                      type="date"
                      value={filters.toDate || ""}
                      onChange={(e) => applyFilters({ toDate: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">المستخدم</label>
                    <Input
                      type="text"
                      placeholder="اسم المستخدم…"
                      value={filters.user || ""}
                      onChange={(e) => applyFilters({ user: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {historyLoading && !history ? (
            <p className="text-sm text-muted-foreground">جارٍ تحميل السجل…</p>
          ) : history && history.items.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border-2 shadow-sm bg-card">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-muted/80">
                    <tr>
                      <th scope="col" className="p-3 text-right font-bold">
                        <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("person")}>
                          الشخص <SortIcon col="person" />
                        </button>
                      </th>
                      <th scope="col" className="p-3 text-right font-bold">
                        <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("column")}>
                          العمود <SortIcon col="column" />
                        </button>
                      </th>
                      <th scope="col" className="p-3 text-right font-bold">
                        <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("oldvalue")}>
                          القيمة القديمة <SortIcon col="oldvalue" />
                        </button>
                      </th>
                      <th scope="col" className="p-3 text-right font-bold">
                        <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("newvalue")}>
                          القيمة الجديدة <SortIcon col="newvalue" />
                        </button>
                      </th>
                      <th scope="col" className="p-3 text-right font-bold">
                        <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("version")}>
                          الإصدار <SortIcon col="version" />
                        </button>
                      </th>
                      <th scope="col" className="p-3 text-right font-bold">
                        <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("date")}>
                          التاريخ <SortIcon col="date" />
                        </button>
                      </th>
                      <th scope="col" className="p-3 text-right font-bold">
                        <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("user")}>
                          المستخدم <SortIcon col="user" />
                        </button>
                      </th>
                      <th scope="col" className="p-3 text-right font-bold">السجل</th>
                      {canRevert && <th scope="col" className="p-3 text-right font-bold">إجراء</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {history.items.map((item) => {
                      const oldSham = formatShamCashStrict(item.oldValue);
                      const newSham = formatShamCashStrict(item.newValue);
                      const archived = !item.recordId;
                      return (
                        <tr key={item.id} className="border-t align-top transition hover:bg-muted/30">
                          <td className="p-3 font-semibold">{item.personName || "—"}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs">{item.headerRaw}</Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {oldSham ? (
                              <bdi dir="ltr" className="ltr-numbers">{oldSham}</bdi>
                            ) : (
                              item.oldValue || "—"
                            )}
                          </td>
                          <td className="p-3 font-semibold">
                            {newSham ? (
                              <bdi dir="ltr" className="ltr-numbers">{newSham}</bdi>
                            ) : (
                              item.newValue || "—"
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant={archived ? "outline" : "secondary"}>
                              الإصدار {item.fileVersion}
                            </Badge>
                            {archived ? (
                              <span className="mt-1 block text-[10px] text-muted-foreground">مؤرشف</span>
                            ) : null}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleDateString("ar-SY", { year: "numeric", month: "2-digit", day: "2-digit" })}
                          </td>
                          <td className="p-3 font-semibold">{item.editedBy || "—"}</td>
                          <td className="p-3">
                            {item.recordId ? (
                              <Link href={`/records/${item.recordId}`} className="text-primary hover:underline text-sm">
                                فتح السجل
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </td>
                          {canRevert && (
                            <td className="p-3">
                              {item.recordId && !archived ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  onClick={() => handleRevert(item)}
                                  disabled={revertingId === item.recordId}
                                  aria-label="تراجع عن التعديل"
                                  title="تراجع عن التعديل"
                                >
                                  <Undo2 className="size-4" />
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Pager page={history.page} pageSize={history.pageSize} total={history.total} onPage={setPage} />
              </div>
              <p className="text-xs text-muted-foreground">
                للتراجع عن تعديل، اضغط على زر التراجع (↶) بجانب التعديل المطلوب. يمكنك أيضًا فتح السجل للتراجع من هناك.
              </p>
            </>
          ) : (
            <EmptyState title="لا توجد نتائج" description="لم تُسجَّل تعديلات تطابق معايير الفلترة الحالية." />
          )}
        </section>
      ) : null}
    </div>
  );
}
