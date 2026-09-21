"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, ExternalLink, Eye, EyeOff, History, Loader2, Pencil, Printer, Search, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { formatFunctionalCategory, formatNationalId, formatShamCash } from "@/lib/conflict-format";
import { relativeArabic } from "@/lib/activity";
import { formatUploadDateTime } from "@/lib/format/date";
import { normalizeStored } from "@/lib/normalization";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { recordsService, type RecordDetail, type RecordDetailColumn, type RecordEditInfo } from "@/services/records.service";
import { cn } from "@/lib/cn";

// Full UI-11 port (P3.4): return-to-search link, person header, category tabs
// in source order, header search across tabs, hide-empty toggle, per-cell
// copy/edit/save-cancel/revert, edited badge with original tooltip, related
// visible files, single visit log, print-all-categories. Data contract is the
// V1 page read model via GET records/[id] (docs/05 new reads).

function displayFor(column: RecordDetailColumn, rawValue: string): string {
  if (column.standardField === "sham_cash") return formatShamCash(rawValue);
  if (column.standardField === "national_id") return formatNationalId(rawValue);
  if (column.standardField === "functional_category") return formatFunctionalCategory(rawValue);
  return rawValue;
}

function relatedName(item: { sfFullName: string | null; sfFirstName: string | null; sfFatherName: string | null; sfLastName: string | null }): string {
  return (
    item.sfFullName ||
    [item.sfFirstName, item.sfFatherName, item.sfLastName].filter(Boolean).join(" ") ||
    "سجل بدون اسم"
  );
}

export function RecordDetails({ recordId }: { recordId: string }) {
  const router = useRouter();
  const [data, setData] = useState<RecordDetail | null>(null);
  const [columns, setColumns] = useState<RecordDetailColumn[]>([]);
  const [editedHeaders, setEditedHeaders] = useState<RecordDetail["editedHeaders"]>({});
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canViewHistory, setCanViewHistory] = useState(false);
  const [history, setHistory] = useState<RecordEditInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRevertingId, setHistoryRevertingId] = useState<string | null>(null);
  const [showBadge, setShowBadge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [columnQuery, setColumnQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const visitedRef = useRef(false);

  async function loadHistory(id: string) {
    setHistoryLoading(true);
    try {
      const result = await recordsService.getEdits(id);
      // الخلفية تُرجع الأحدث أولاً (OrderByDescending CreatedAt).
      const sorted = [...(result.edits ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setHistory(sorted);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  // One-shot mount load (same pattern as use-api-query).
  useEffect(() => {
    let active = true;
    // Intentional request-status sync (same pattern as use-api-query).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [detail, me] = await Promise.all([recordsService.get(recordId), authService.me()]);
        if (!active) return;
        setData(detail);
        setColumns(detail.columns);
        setEditedHeaders(detail.editedHeaders ?? {});
        const perms = me?.permissions ?? [];
        setCanEdit(hasPermission(perms, "edits.update"));
        setCanDelete(hasPermission(perms, "records.delete"));
        setShowBadge(hasPermission(perms, "edits.badge"));
        const viewHistory = hasPermission(perms, "edits.view");
        setCanViewHistory(viewHistory);
        if (viewHistory) void loadHistory(recordId);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "غير موجود.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [recordId]);

  // Single visit log per navigation (V1 record-visit-logger dedup).
  useEffect(() => {
    if (visitedRef.current) return;
    visitedRef.current = true;
    recordsService.visit(recordId).catch(() => undefined);
  }, [recordId]);

  // Browser tab title: file name | full name exactly as shown in the record.
  useEffect(() => {
    if (!data) return;
    const previous = document.title;
    document.title = `${data.fileName} | ${data.displayName}`;
    return () => {
      document.title = previous;
    };
  }, [data]);

  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; name: string; order: number; columns: RecordDetailColumn[] }>();
    for (const column of columns) {
      const key = column.categoryId ?? "other";
      const group = byKey.get(key) ?? {
        key,
        name: column.categoryName ?? "أخرى",
        order: column.categoryOrder ?? Number.MAX_SAFE_INTEGER,
        columns: [],
      };
      group.columns.push(column);
      byKey.set(key, group);
    }
    return Array.from(byKey.values()).sort((a, b) => a.order - b.order);
  }, [columns]);

  const normalizedQuery = useMemo(() => normalizeStored(columnQuery.trim()), [columnQuery]);
  const hasQuery = normalizedQuery.length > 0;
  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          columns: group.columns.filter(
            (column) =>
              (!hideEmpty || Boolean(column.value.trim())) &&
              (!hasQuery || normalizeStored(column.headerRaw).includes(normalizedQuery)),
          ),
        }))
        .filter((group) => !hasQuery || group.columns.length > 0),
    [groups, hideEmpty, hasQuery, normalizedQuery],
  );
  const activeGroup = visibleGroups.find((group) => group.key === selectedGroup)?.key ?? visibleGroups[0]?.key;

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(id);
    toast.success("تم نسخ القيمة.");
    window.setTimeout(() => setCopied(null), 1200);
  }

  function startEdit(column: RecordDetailColumn) {
    if (!canEdit) return;
    setEditingId(column.id);
    setDraft(column.value);
  }

  async function saveEdit(column: RecordDetailColumn) {
    if (saving || !canEdit) return;
    // trim قبل الحفظ: مسافات زائدة لا تُنشئ تعديلاً ولا تُخزَّن.
    const trimmed = draft.trim();
    if (trimmed === column.value) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    try {
      const result = await recordsService.saveEdit(recordId, { fileColumnId: column.id, newValue: trimmed });
      if (!result.ok) {
        toast.error("تعذر حفظ التعديل.");
        return;
      }
      if (!result.changed) {
        toast.info(result.message ?? "لا يوجد تغيير للحفظ.");
        setEditingId(null);
        return;
      }
      setColumns((current) =>
        current.map((item) => (item.id === column.id ? { ...item, value: result.newValue ?? trimmed } : item)),
      );
      if (result.edits) setEditedHeaders(result.edits);
      setEditingId(null);
      if (canViewHistory) void loadHistory(recordId);
      toast.success("تم حفظ التعديل وتحديث البحث.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر الاتصال بالخادم. حاول مجددًا.");
    } finally {
      setSaving(false);
    }
  }

  async function revertEdit(column: RecordDetailColumn) {
    if (revertingId || saving || !canEdit) return;
    const editInfo = editedHeaders[column.headerRaw];
    if (!editInfo) return;
    // القيمة الحالية = الأصلية: لا حاجة للتراجع — الزر مخفي/غير مفعل.
    if (column.value === editInfo.originalValue) return;
    const confirmed = window.confirm(
      `تراجع عن آخر تعديل للحقل «${column.headerRaw}»؟\nستعود القيمة إلى: ${editInfo.originalValue || "—"}`,
    );
    if (!confirmed) return;
    setRevertingId(column.id);
    try {
      const result = await recordsService.saveEdit(recordId, { fileColumnId: column.id, revert: true });
      if (!result.ok) {
        toast.error("تعذر التراجع عن التعديل.");
        return;
      }
      if (!result.changed) {
        toast.info(result.message ?? "لا يوجد تغيير للتراجع عنه.");
        return;
      }
      setColumns((current) =>
        current.map((item) => (item.id === column.id ? { ...item, value: result.newValue ?? "" } : item)),
      );
      if (result.edits) setEditedHeaders(result.edits);
      if (canViewHistory) void loadHistory(recordId);
      toast.success("تم التراجع عن آخر تعديل.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر الاتصال بالخادم. حاول مجددًا.");
    } finally {
      setRevertingId(null);
    }
  }

  async function revertHistoryRow(item: RecordEditInfo) {
    if (historyRevertingId || saving || revertingId || !canEdit) return;
    const currentByHeader = new Map(columns.map((c) => [c.headerRaw, c] as const));
    const column = currentByHeader.get(item.headerRaw);
    const liveValue = column?.value;
    // القيمة الحالية = القديمة لهذا الصف: الزر مخفي/غير مفعل.
    if (liveValue !== undefined && liveValue === item.oldValue) return;
    const confirmed = window.confirm(
      `تراجع عن التعديل في الحقل «${item.headerRaw}»؟\nستعود القيمة إلى: ${item.oldValue || "—"}`,
    );
    if (!confirmed) return;
    setHistoryRevertingId(item.id);
    try {
      const result = await recordsService.saveEdit(recordId, {
        fileColumnId: item.fileColumnId ?? column?.id,
        headerRaw: item.headerRaw,
        revert: true,
      });
      if (!result.ok) {
        toast.error("تعذر التراجع عن التعديل.");
        return;
      }
      if (!result.changed) {
        toast.info(result.message ?? "لا يوجد تغيير للتراجع عنه.");
        return;
      }
      if (column) {
        const newValue = result.newValue ?? "";
        setColumns((current) =>
          current.map((c) => (c.id === column.id ? { ...c, value: newValue } : c)),
        );
      } else if (result.newValue !== undefined) {
        // العمود غير موجود في العرض الحالي: أعد تحميل التفاصيل.
        try {
          const detail = await recordsService.get(recordId);
          setColumns(detail.columns);
          setEditedHeaders(detail.editedHeaders ?? {});
        } catch {
          /* يُكتفى بتحديث السجل */
        }
      }
      if (result.edits) setEditedHeaders(result.edits);
      await loadHistory(recordId);
      toast.success("تم التراجع عن التعديل.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر الاتصال بالخادم. حاول مجددًا.");
    } finally {
      setHistoryRevertingId(null);
    }
  }

  const valueByHeader = useMemo(() => new Map(columns.map((c) => [c.headerRaw, c.value] as const)), [columns]);
  // تاريخ التصدير لترويسة الـ PDF (يُحسب مرة واحدة لكل عرض سجل).
  const exportDate = useMemo(() => formatUploadDateTime(new Date()), []);
  const standardFieldByHeader = useMemo(
    () => new Map(columns.map((c) => [c.headerRaw, c.standardField] as const)),
    [columns],
  );

  function displayHistoryValue(headerRaw: string, raw: string): string {
    const standardField = standardFieldByHeader.get(headerRaw);
    if (standardField === "sham_cash") return formatShamCash(raw);
    if (standardField === "national_id") return formatNationalId(raw);
    if (standardField === "functional_category") return formatFunctionalCategory(raw);
    return raw;
  }

  async function handleDelete() {
    if (deleting || !canDelete || !data) return;
    setDeleting(true);
    try {
      await recordsService.remove(recordId);
      toast.success("تم حذف السجل نهائياً.");
      setDeleteOpen(false);
      router.push(`/groups/${data.groupId}/files/${data.fileId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حذف السجل. حاول مجددًا.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{error ?? "غير موجود."}</p>;

  const relatedNational = data.relatedByNationalId.rows;
  const relatedPerson = data.relatedByPerson.rows;

  return (
    <div className="record-pdf space-y-7 print:space-y-2">
      <Link href="/search" className="no-print inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowRight className="size-4" />
        العودة إلى البحث
      </Link>
      {/* ترويسة الـ PDF فقط: اسم الشخص + اسم الملف + تاريخ التصدير. */}
      <div className="hidden rounded-xl border border-border p-3 text-center print:block">
        <p className="text-[11px] font-bold text-primary">سجل</p>
        <h1 className="text-xl font-bold">{data.displayName}</h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          الملف: {data.fileName} • تاريخ التصدير: <span className="ltr-numbers">{exportDate}</span>
        </p>
      </div>
      <div className="print:hidden">
      <PageHeader
        eyebrow="سجل"
        title={data.displayName}
        description={`${data.fileName} — ${data.groupName} — صف ${data.rowIndex} — رُفع ${data.uploadedAt}`}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              طباعة / حفظ PDF
            </Button>
            {canDelete ? (
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" size="sm">
                    <Trash2 className="size-4" />
                    حذف السجل
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>حذف السجل نهائياً؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيُحذف «{data.displayName}» (صف {data.rowIndex} في {data.fileName}) مع سجل تعديلاته نهائياً،
                      ولا يمكن التراجع عن هذا الإجراء.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel type="button" disabled={deleting}>
                      إلغاء
                    </AlertDialogCancel>
                    <Button type="button" variant="destructive" disabled={deleting} onClick={() => void handleDelete()}>
                      {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      {deleting ? "جارٍ الحذف…" : "حذف نهائي"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        }
      />
      </div>
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={columnQuery}
            onChange={(event) => setColumnQuery(event.target.value)}
            placeholder="بحث باسم العمود…"
            aria-label="بحث باسم العمود في جميع التبويبات"
            className="h-9 pr-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={hideEmpty}
          onClick={() => setHideEmpty((current) => !current)}
        >
          {hideEmpty ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {hideEmpty ? "إظهار الحقول الفارغة" : "إخفاء الحقول الفارغة"}
        </Button>
      </div>

      {visibleGroups.length === 0 ? (
        <p role="status" className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {hideEmpty ? "لا توجد أعمدة مطابقة ضمن الحقول غير الفارغة." : "لا توجد أعمدة مطابقة لاسم البحث."}
        </p>
      ) : (
        <div>
          <div className="no-print overflow-x-auto" role="tablist" aria-label="فئات الأعمدة">
            <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
              {visibleGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  role="tab"
                  aria-selected={activeGroup === group.key}
                  onClick={() => setSelectedGroup(group.key)}
                  className={cn(
                    "rounded-md px-4 py-2 text-sm font-bold",
                    activeGroup === group.key ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>
          {/* Print renders every category; screen shows the active tab. */}
          {visibleGroups.map((group) => (
            <section
              key={group.key}
              aria-label={group.name}
              className={cn("mt-4 print:mt-2", activeGroup === group.key ? "block" : "hidden print:block")}
            >
              <h2 className="mb-2 hidden text-base font-bold print:mb-1 print:block print:text-sm">{group.name}</h2>
              {group.columns.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                  كل حقول هذا التبويب فارغة.
                </p>
              ) : (
                <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-4 print:gap-1.5">
                  {group.columns.map((column) => {
                    const editInfo = editedHeaders[column.headerRaw];
                    const isEditing = editingId === column.id;
                    const displayValue = displayFor(column, column.value);
                    const isEmpty = !column.value.trim();
                    return (
                      <div
                        key={column.id}
                        className={cn(
                          "group rounded-xl border bg-card p-4 print:rounded-lg print:p-1.5 print:shadow-none",
                          editInfo && showBadge && "border-amber-400/70",
                          editInfo && showBadge && "print:border-border",
                          // الـ PDF يتخطى الحقول الفارغة دائمًا.
                          isEmpty && "print:hidden",
                        )}
                      >
                        <dt className="flex items-center gap-2 text-xs font-bold text-muted-foreground print:gap-1 print:text-[10px]">
                          <span className="truncate">{column.headerRaw}</span>
                          {editInfo && showBadge ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-amber-400 bg-amber-50 text-[10px] text-amber-800 print:hidden dark:bg-amber-950/40 dark:text-amber-200"
                              title={`القيمة الأصلية من Excel: ${editInfo.originalValue || "—"}${editInfo.lastBy ? ` — آخر تعديل بواسطة: ${editInfo.lastBy}` : ""}`}
                            >
                              معدّل{editInfo.lastBy ? ` — ${editInfo.lastBy}` : ""}
                            </Badge>
                          ) : null}
                        </dt>
                        {isEditing ? (
                          <div className="mt-2 space-y-2">
                            <Input
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void saveEdit(column);
                                if (event.key === "Escape") setEditingId(null);
                              }}
                              aria-label={`تعديل ${column.headerRaw}`}
                              // Numeric identifiers (sham cash first) are
                              // always LTR so group order never reverses
                              // while typing in the RTL page.
                              dir={
                                column.standardField === "sham_cash" ||
                                column.standardField === "national_id" ||
                                column.standardField === "personal_no" ||
                                column.standardField === "phone"
                                  ? "ltr"
                                  : undefined
                              }
                              inputMode={
                                column.standardField === "sham_cash" ||
                                column.standardField === "national_id" ||
                                column.standardField === "personal_no" ||
                                column.standardField === "phone"
                                  ? "numeric"
                                  : undefined
                              }
                              className="h-9"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button type="button" size="sm" disabled={saving} onClick={() => void saveEdit(column)}>
                                <Check className="size-4" />
                                حفظ
                              </Button>
                              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setEditingId(null)}>
                                <X className="size-4" />
                                إلغاء
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <dd className="mt-2 flex min-h-8 items-start justify-between gap-3 print:mt-1 print:min-h-0 print:gap-1">
                            <span className="min-w-0 flex-1">
                              <span className="ltr-numbers break-words text-right text-sm font-semibold print:text-xs">
                                {displayValue || "—"}
                              </span>
                              {editInfo && showBadge ? (
                                <span className="mt-1 block break-words text-[11px] font-normal text-muted-foreground print:hidden">
                                  الأصل من Excel: {displayFor(column, editInfo.originalValue) || "—"}
                                </span>
                              ) : null}
                            </span>
                            <span className="no-print flex shrink-0 gap-1">
                              {canEdit ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 opacity-60 group-hover:opacity-100"
                                  onClick={() => startEdit(column)}
                                  aria-label={`تعديل ${column.headerRaw}`}
                                  title="تعديل القيمة"
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              ) : null}
                              {canEdit && editInfo && column.value !== editInfo.originalValue ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 opacity-60 group-hover:opacity-100"
                                  onClick={() => void revertEdit(column)}
                                  disabled={revertingId === column.id}
                                  aria-label={`تراجع عن آخر تعديل لـ ${column.headerRaw}`}
                                  title="تراجع عن آخر تعديل (يعيد القيمة السابقة ويُسجَّل في السجل)"
                                >
                                  <Undo2 className="size-4" />
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 opacity-60 group-hover:opacity-100"
                                onClick={() => void copy(column.id, displayValue)}
                                disabled={!column.value}
                                aria-label={`نسخ ${column.headerRaw}`}
                              >
                                {copied === column.id ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
                              </Button>
                            </span>
                          </dd>
                        )}
                      </div>
                    );
                  })}
                </dl>
              )}
            </section>
          ))}
        </div>
      )}

      {canViewHistory ? (
        <Card className="no-print">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold">
                <History className="size-4 text-primary" />
                سجل التغييرات على هذا السجل ({history.length})
              </h2>
              <span className="text-xs text-muted-foreground">مرتبة من الأحدث إلى الأقدم</span>
            </div>
            {historyLoading && history.length === 0 ? (
              <p className="text-sm text-muted-foreground">جارٍ تحميل سجل التغييرات…</p>
            ) : history.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                لم يتم تعديل هذا السجل بعد.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border-2 shadow-sm bg-card">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-muted/80">
                    <tr>
                      <th scope="col" className="p-3 text-right font-bold">الشخص الذي قام بالتغيير</th>
                      <th scope="col" className="p-3 text-right font-bold">اسم الحقل الذي جرى عليه التغيير</th>
                      <th scope="col" className="p-3 text-right font-bold">القيمة القديمة</th>
                      <th scope="col" className="p-3 text-right font-bold">القيمة الجديدة</th>
                      <th scope="col" className="p-3 text-right font-bold">القيمة الحالية</th>
                      <th scope="col" className="p-3 text-right font-bold">تاريخ التعديل</th>
                      <th scope="col" className="p-3 text-right font-bold">تاريخ التعديل النسبي</th>
                      {canEdit ? <th scope="col" className="p-3 text-right font-bold">تراجع عن التعديل</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => {
                      const currentValue = valueByHeader.get(item.headerRaw);
                      const created = new Date(item.createdAt);
                      const busy = historyRevertingId === item.id;
                      // القيمة الحالية = القديمة: إخفاء الزر وتعطيله.
                      const revertHidden = currentValue !== undefined && currentValue === item.oldValue;
                      return (
                        <tr key={item.id} className="border-t align-top transition hover:bg-muted/30">
                          <td className="p-3 font-semibold">{item.editedBy || "—"}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs">{item.headerRaw}</Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {displayHistoryValue(item.headerRaw, item.oldValue) || "—"}
                          </td>
                          <td className="p-3 font-semibold">
                            {displayHistoryValue(item.headerRaw, item.newValue) || "—"}
                          </td>
                          <td className="p-3 font-semibold text-primary">
                            {currentValue == null || currentValue === "" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              displayHistoryValue(item.headerRaw, currentValue)
                            )}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground ltr-numbers text-right">
                            {formatUploadDateTime(created)}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{relativeArabic(created)}</td>
                          {canEdit ? (
                            <td className="p-3">
                              {revertHidden ? (
                                <span className="text-muted-foreground text-sm">—</span>
                              ) : (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  onClick={() => void revertHistoryRow(item)}
                                  disabled={busy}
                                  aria-label={`تراجع عن التعديل في ${item.headerRaw}`}
                                  title="تراجع عن التعديل"
                                >
                                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                                </Button>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              للتراجع عن تعديل، اضغط زر التراجع (↶) بجانب التعديل المطلوب. سيُعاد الحقل إلى قيمته السابقة ويُسجَّل ذلك كتعديل جديد.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {relatedNational.length > 0 || relatedPerson.length > 0 ? (
        <Card className="no-print">
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-bold">سجلات مرتبطة لنفس الشخص</h2>
            {relatedNational.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">نفس الرقم الوطني ({relatedNational.length})</p>
                {relatedNational.map((item) => (
                  <Link
                    key={item.id}
                    href={`/records/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border p-4 transition hover:border-primary hover:bg-primary/5"
                  >
                    <span>
                      <span className="block font-bold">{relatedName(item)}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {item.groupName} • {item.fileName}
                      </span>
                    </span>
                    <ExternalLink className="size-4 shrink-0 text-primary" />
                  </Link>
                ))}
              </div>
            ) : null}
            {relatedPerson.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">نفس الاسم واسم الأم ({relatedPerson.length})</p>
                {relatedPerson.map((item) => (
                  <Link
                    key={item.id}
                    href={`/records/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-lg border p-4 transition hover:border-primary hover:bg-primary/5"
                  >
                    <span>
                      <span className="block font-bold">{relatedName(item)}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {item.groupName} • {item.fileName}
                      </span>
                    </span>
                    <ExternalLink className="size-4 shrink-0 text-primary" />
                  </Link>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
