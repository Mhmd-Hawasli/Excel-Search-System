"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Undo2, X, Filter, ArrowUpDown, ArrowUp, ArrowDown, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { MultiSelect } from "@/components/multi-select";
import { Pager } from "@/components/pager";
import { formatShamCashStrict } from "@/lib/conflict-format";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { editsService, type EditHistoryPage, type EditOptions, type EditsFilters } from "@/services/edits.service";

const PAGE_SIZES = [10, 25, 50, 100];

type SortableColumn = "person" | "column" | "oldvalue" | "newvalue" | "version" | "date" | "user";

/**
 * جدول سجل تعديلات ملف واحد: فلاتر ذكية + ترتيب + ترقيم + تراجع.
 * - عمود «القيمة الحالية» يعرض آخر قيمة حيّة للسجل (مرتبط بالرقم الوطني لا برقم السطر).
 * - فلتر الإصدار يبدأ من الإصدار الحالي مع زرّي (−)/(+).
 * - العمود والمستخدم اختيار من متعدد من القيم المتاحة.
 * يُستخدم في صفحة الملف الداخلية (/edits/[fileId]).
 */
export function EditHistorySection({
  fileId,
  currentVersion,
  initialVersion,
}: {
  fileId: string;
  currentVersion?: number;
  initialVersion?: number;
}) {
  const [history, setHistory] = useState<EditHistoryPage | null>(null);
  const [options, setOptions] = useState<EditOptions | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [canRevert, setCanRevert] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<EditsFilters>({ sortBy: "date", sortDir: "desc" });
  const [revertingId, setRevertingId] = useState<string | null>(null);
  // القيمة الابتدائية للإصدار تُطبّق مرة واحدة فقط لكل ملف (حتى لا تعيد
  // الكتابة فوق اختيار المستخدم عند تحديث بيانات الملخص).
  const versionInitFor = useRef<string | null>(null);

  const loadHistory = useCallback(async (fid: string, pg: number, sz: number, flt: EditsFilters) => {
    if (!fid) return;
    setHistoryLoading(true);
    try {
      const result = await editsService.history(fid, pg, sz, flt);
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
        const me = await authService.me();
        if (!active) return;
        setCanRevert(hasPermission(me?.permissions ?? [], "edits.update"));
      } catch {
        /* صلاحيات القراءة تكفي لعرض السجل */
      }
    })();
    return () => { active = false; };
  }, []);

  // خيارات الفلاتر الذكية (الأعمدة والمستخدمون المتاحون + الإصدار الحالي).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await editsService.options(fileId);
        if (active) setOptions(result);
      } catch {
        if (active) setOptions(null);
      }
    })();
    return () => { active = false; };
  }, [fileId]);

  // فلتر الإصدار يبدأ من الإصدار الحالي للملف، أو من ?version= عند
  // القدوم من زر "عرض سجل التعديلات" في سجل الإصدارات.
  const versionInitKey = `${fileId}:${initialVersion ?? ""}`;
  useEffect(() => {
    const fallback = initialVersion ?? options?.currentVersion ?? currentVersion;
    if (fallback === undefined || versionInitFor.current === versionInitKey) return;
    versionInitFor.current = versionInitKey;
    setFilters((prev) =>
      initialVersion !== undefined
        ? { ...prev, version: initialVersion }
        : prev.version === undefined
          ? { ...prev, version: fallback }
          : prev,
    );
    setPage(1);
  }, [fileId, options, currentVersion, initialVersion, versionInitKey]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadHistory(fileId, page, pageSize, filters);
    });
    return () => { active = false; };
  }, [fileId, page, pageSize, filters, loadHistory]);

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

  function stepVersion(delta: number) {
    setFilters((prev) => {
      const base = prev.version ?? options?.currentVersion ?? currentVersion ?? 1;
      return { ...prev, version: Math.max(1, base + delta) };
    });
    setPage(1);
  }

  async function handleRevert(item: { recordId: string | null; fileColumnId: string | null; headerRaw: string; oldValue: string; currentValue?: string | null }) {
    if (!item.recordId || revertingId) return;
    // القيمة الحالية = القديمة: الزر مخفي/غير مفعل — لا تُنفَّذ العملية.
    if (item.currentValue != null && item.currentValue === item.oldValue) return;
    if (!window.confirm(`تراجع عن التعديل؟\nستعود القيمة إلى: ${item.oldValue || "—"}`)) return;
    setRevertingId(item.recordId);
    try {
      const result = await editsService.revertEdit(item.recordId, item.fileColumnId ?? undefined, item.headerRaw);
      if (result.ok && result.changed) {
        loadHistory(fileId, page, pageSize, filters);
      }
    } catch {
      // silent fail
    } finally {
      setRevertingId(null);
    }
  }

  function sortIcon(col: SortableColumn) {
    if (filters.sortBy !== col) return <ArrowUpDown className="size-3 opacity-40" />;
    return filters.sortDir === "asc" ? <ArrowUp className="size-3 text-primary" /> : <ArrowDown className="size-3 text-primary" />;
  }

  const hasActiveFilters =
    filters.person ||
    filters.column ||
    (filters.columns && filters.columns.length > 0) ||
    filters.oldValue ||
    filters.newValue ||
    filters.version ||
    filters.fromDate ||
    filters.toDate ||
    filters.user ||
    filters.source ||
    (filters.users && filters.users.length > 0);

  function renderValue(raw: string | null) {
    if (!raw) return "—";
    const sham = formatShamCashStrict(raw);
    return sham ? (
      <bdi dir="ltr" className="ltr-numbers">{sham}</bdi>
    ) : (
      raw
    );
  }

  return (
    <section aria-label="سجل تعديلات الملف" className="space-y-4">
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
                <MultiSelect
                  label="الأعمدة"
                  options={(options?.columns ?? []).map((c) => ({ value: c, label: c }))}
                  selected={filters.columns ?? []}
                  onChange={(next) => applyFilters({ columns: next, column: undefined })}
                  searchPlaceholder="ابحث باسم العمود…"
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
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  الإصدار
                  {options?.currentVersion || currentVersion ? (
                    <span className="font-normal"> (الحالي: {options?.currentVersion ?? currentVersion})</span>
                  ) : null}
                </label>
                <div className="flex items-center gap-1" dir="ltr">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    onClick={() => stepVersion(-1)}
                    disabled={(filters.version ?? 1) <= 1}
                    aria-label="إنقاص الإصدار"
                    title="إنقاص الإصدار"
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    placeholder="رقم الإصدار…"
                    value={filters.version ?? ""}
                    onChange={(e) => applyFilters({ version: e.target.value ? Number(e.target.value) : undefined })}
                    className="h-9 text-center"
                    aria-label="رقم الإصدار"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    onClick={() => stepVersion(1)}
                    aria-label="زيادة الإصدار"
                    title="زيادة الإصدار"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
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
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">مصدر التعديل</label>
                <select
                  aria-label="مصدر التعديل"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={filters.source ?? ""}
                  onChange={(e) => applyFilters({ source: (e.target.value || undefined) as EditsFilters["source"] })}
                >
                  <option value="">كل المصادر</option>
                  <option value="manual">تعديل يدوي</option>
                  <option value="upload">تحديث ملف</option>
                  <option value="formatting">تغيير شكلي</option>
                </select>
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
                <MultiSelect
                  label="المستخدمون"
                  options={(options?.users ?? []).map((u) => ({
                    value: u.username,
                    label: u.displayName || u.username,
                    hint: u.displayName ? u.username : null,
                  }))}
                  selected={filters.users ?? []}
                  onChange={(next) => applyFilters({ users: next, user: undefined })}
                  searchPlaceholder="ابحث باسم المستخدم…"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {history ? (
        <div className="flex flex-wrap gap-2 text-xs" aria-label="إحصائيات مصدر التعديلات">
          <Badge variant="outline">يدوي: {history.sourceCounts.manual}</Badge>
          <Badge variant="outline">تحديث ملف: {history.sourceCounts.upload}</Badge>
          <Badge variant="outline">شكلي: {history.sourceCounts.formatting}</Badge>
        </div>
      ) : null}

      {historyLoading && !history ? (
        <p className="text-sm text-muted-foreground">جارٍ تحميل السجل…</p>
      ) : history && history.items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border-2 shadow-sm bg-card">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/80">
                <tr>
                  <th scope="col" className="p-3 text-right font-bold">
                    <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("person")}>
                      الشخص {sortIcon("person")}
                    </button>
                  </th>
                  <th scope="col" className="p-3 text-right font-bold">
                    <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("column")}>
                      العمود {sortIcon("column")}
                    </button>
                  </th>
                  <th scope="col" className="p-3 text-right font-bold">
                    <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("oldvalue")}>
                      القيمة القديمة {sortIcon("oldvalue")}
                    </button>
                  </th>
                  <th scope="col" className="p-3 text-right font-bold">
                    <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("newvalue")}>
                      القيمة الجديدة {sortIcon("newvalue")}
                    </button>
                  </th>
                  <th scope="col" className="p-3 text-right font-bold">القيمة الحالية</th>
                  <th scope="col" className="p-3 text-right font-bold">
                    <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("version")}>
                      الإصدار {sortIcon("version")}
                    </button>
                  </th>
                  <th scope="col" className="p-3 text-right font-bold">
                    <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("date")}>
                      التاريخ {sortIcon("date")}
                    </button>
                  </th>
                  <th scope="col" className="p-3 text-right font-bold">
                    <button type="button" className="flex items-center gap-1 hover:text-primary transition-colors" onClick={() => handleSort("user")}>
                      المستخدم {sortIcon("user")}
                    </button>
                  </th>
                  <th scope="col" className="p-3 text-right font-bold">السجل</th>
                  {canRevert && <th scope="col" className="p-3 text-right font-bold">إجراء</th>}
                </tr>
              </thead>
              <tbody>
                {history.items.map((item) => {
                  const archived = !item.recordId;
                  // الربط بالرقم الوطني لا برقم السطر: يبقى صحيحًا حتى بعد حذف الصفوف.
                  const targetId = item.currentRecordId ?? item.recordId;
                  // القيمة الحالية = القديمة: إخفاء زر التراجع وتعطيله.
                  const revertHidden = item.currentValue != null && item.currentValue === item.oldValue;
                  return (
                    <tr key={item.id} className="border-t align-top transition hover:bg-muted/30">
                      <td className="p-3 font-semibold">{item.personName || "—"}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">{item.headerRaw}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {renderValue(item.oldValue)}
                      </td>
                      <td className="p-3 font-semibold">
                        {renderValue(item.newValue)}
                      </td>
                      <td className="p-3 font-semibold text-primary">
                        {item.currentValue == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          renderValue(item.currentValue)
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="mb-1 block w-fit text-[10px]">
                          {item.source === "manual" ? "يدوي" : item.source === "formatting" ? "شكلي" : "تحديث ملف"}
                        </Badge>
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
                        {targetId ? (
                          <Link href={`/records/${targetId}`} className="text-primary hover:underline text-sm">
                            فتح السجل
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                      {canRevert && (
                        <td className="p-3">
                          {item.recordId && !archived && !revertHidden ? (
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
  );
}
