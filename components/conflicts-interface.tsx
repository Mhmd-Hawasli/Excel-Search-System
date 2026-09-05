"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Files,
  Filter,
  ListMinus,
  LoaderCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  CONFLICT_CATEGORIES,
  CONFLICT_FIELDS,
  CONFLICT_RULES,
  type ConflictCategory,
  type ConflictField,
  type ConflictResponse,
  type ConflictSortBy,
} from "@/lib/conflicts/catalog";
import { toLatinDigits } from "@/lib/normalization/arabic";
import { formatNationalId } from "@/lib/format/national-id";
import { formatShamCash } from "@/lib/format/sham-cash";
import { formatFunctionalCategory } from "@/lib/format/functional-category";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

const icons = { invalid: AlertTriangle, missing: ListMinus, similar: Users, conflicting: Files };
const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type SortableColumn = {
  key: ConflictSortBy;
  label: string;
};

const sortableColumns: SortableColumn[] = [
  { key: "issueNumber", label: "رقم المشكلة" },
  { key: "fileName", label: "ملف المصدر" },
  { key: "fullName", label: "الاسم الثلاثي" },
  { key: "motherName", label: "اسم الأم" },
  { key: "nationalId", label: "الرقم الوطني" },
  { key: "shamCash", label: "الشام كاش" },
  { key: "personalNo", label: "الرقم الذاتي" },
  { key: "functionalCategory", label: "الفئة الوظيفية" },
];

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />;
  return dir === "asc" ? (
    <ArrowUp className="size-3.5 text-primary" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-3.5 text-primary" aria-hidden="true" />
  );
}

export function ConflictsInterface() {
  const [filters, setFilters] = useState({
    category: "invalid" as ConflictCategory,
    field: "all",
    rule: "all",
    page: 1,
    pageSize: 25,
    sortBy: "issueNumber" as ConflictSortBy,
    sortDir: "asc" as "asc" | "desc",
  });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ConflictResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completedRequest, setCompletedRequest] = useState("");
  const requestKey = JSON.stringify([filters, revision]);
  const busy = loading || completedRequest !== requestKey;
  const categoryRules = CONFLICT_RULES.filter((rule) => rule.category === filters.category);
  const fields = Array.from(new Set<ConflictField>(categoryRules.map((rule) => rule.field)));
  const rules = categoryRules.filter(
    (rule) => filters.field === "all" || rule.field === filters.field,
  );

  function handleSort(column: ConflictSortBy) {
    setFilters((current) => {
      if (current.sortBy === column) {
        return { ...current, sortDir: current.sortDir === "asc" ? "desc" : "asc", page: 1 };
      }
      return { ...current, sortBy: column, sortDir: "asc", page: 1 };
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const parameters = new URLSearchParams(
      Object.entries(filters).map(([key, value]) => [key, String(value)]),
    );
    async function fetchResults() {
      try {
        const response = await fetch(`/api/conflicts?${parameters}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = (await response.json()) as ConflictResponse & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "تعذر تحميل نتائج الفحص.");
        if (!controller.signal.aborted) {
          if (filters.page > 1 && filters.page > result.pageCount) {
            setFilters((current) => ({ ...current, page: Math.max(1, result.pageCount) }));
          } else setData(result);
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "تعذر تحميل نتائج الفحص.");
      } finally {
        if (!controller.signal.aborted) {
          setCompletedRequest(requestKey);
          setLoading(false);
        }
      }
    }
    void fetchResults();
    return () => controller.abort();
  }, [filters, requestKey]);

  const isDefaultSort = filters.sortBy === "issueNumber";

  return (
    <div className="space-y-6">
      <section aria-label="فلاتر تضارب البيانات" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="الحالات الرئيسية">
          {CONFLICT_CATEGORIES.map((category) => {
            const Icon = icons[category.key];
            const active = filters.category === category.key;
            return (
              <button
                key={category.key}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    category: category.key,
                    field: "all",
                    rule: "all",
                    page: 1,
                  }))
                }
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-5 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-primary/50",
                )}
              >
                <span
                  className={cn(
                    "rounded-lg p-2.5",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-bold">{category.label}</span>
                  <span className="mt-1 block text-xs leading-6 text-muted-foreground">
                    {category.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Filter className="size-4 text-primary" aria-hidden="true" />
              تصفية الحالات
            </div>
            <div className="grid items-end gap-4 md:grid-cols-[1fr_2fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="conflict-field">الحقل</Label>
                <select
                  id="conflict-field"
                  className={selectClass}
                  value={filters.field}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      field: event.target.value,
                      rule: "all",
                      page: 1,
                    }))
                  }
                >
                  <option value="all">جميع الحقول</option>
                  {fields.map((field) => (
                    <option key={field} value={field}>
                      {CONFLICT_FIELDS[field]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="conflict-rule">الحالة الفرعية</Label>
                <select
                  id="conflict-rule"
                  className={selectClass}
                  value={filters.rule}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, rule: event.target.value, page: 1 }))
                  }
                >
                  <option value="all">جميع الحالات الفرعية</option>
                  {rules.map((rule) => (
                    <option key={rule.key} value={rule.key}>
                      {rule.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => setRevision((current) => current + 1)}
              >
                <RefreshCw className={cn("size-4", busy && "animate-spin")} aria-hidden="true" />
                تحديث الفحص
              </Button>
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              {filters.category === "invalid" &&
                "تُقبل الأرقام العربية وتُحذف الفراغات من الرقم الوطني والشام كاش. يُفحص طول الرقم الوطني كرقم قبل تعبئة الأصفار: 8 أرقام أو أقل، و12 رقماً أو أكثر، مشكلة تكامل. يُعرض بـ11 خانة دون اقتطاع الأرقام الأطول. الشام كاش مطلوب 16 خانة. يُقارن الاسم الثلاثي بالاسم + اسم الأب + النسبة بعد التطبيع. تُفحص القيم غير الفارغة في أعمدة «تاريخ». الفئة الوظيفية تُحوَّل من أي صيغة عربية أو رقمية إلى 1–5؛ النص غير المعروف يُخزن 0 ويظهر هنا."}
              {filters.category === "missing" &&
                "يُفحص الرقم الوطني والشام كاش والرقم الذاتي واسم الأم في جميع السجلات. يُفحص الاسم الثلاثي والاسم واسم الأب والنسبة عندما تكون مربوطة بأعمدة Excel؛ ويُعتمد فراغ الخلية الأصلية حتى لو ركّب النظام اسماً للعرض."}
              {filters.category === "similar" &&
                "التشابه هنا هو تطابق الاسم الثلاثي بعد التطبيع مع اختلاف اسم الأم. تظهر جميع السجلات المعنية مرتبة بالاسم الثلاثي؛ اسم الأم الفارغ يُراجع في البيانات الناقصة."}
              {filters.category === "conflicting" &&
                "التكرار يُفحص داخل الملف نفسه، والارتباطات تُفحص عبر جميع الملفات. الشخص = الاسم الثلاثي + اسم الأم بعد التطبيع. تُقارن الأرقام الوطنية والشام كاش بقيمتها الرقمية بعد حذف الفراغات، دون تأثير لأصفار العرض. تُقارن الفئة الوظيفية برقمها من 1 إلى 5، فمثلاً نفس الرقم الوطني بفئتين مختلفتين عبر ملفين يظهر تضارباً. القيم الفارغة والمعرّفات ذات المحارف تُراجع في البيانات الناقصة والخاطئة."}
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-label="نتائج تضارب البيانات" aria-busy={busy} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">السجلات المطابقة</h2>
            <p role="status" aria-live="polite" className="mt-1 text-sm text-muted-foreground">
              {busy
                ? "جارٍ فحص السجلات…"
                : error
                  ? "لم يكتمل الفحص"
                  : `${(data?.total ?? 0).toLocaleString("en-US")} سجل — يظهر كل سجل مرة واحدة مع مشكلاته المطابقة للفلاتر`}
            </p>
            {isDefaultSort ? (
              <p className="mt-1 text-xs text-muted-foreground">الفرز الافتراضي حسب رقم المشكلة — المشاكل الفردية والزوجية بألوان مختلفة</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">الفرز الحالي: {sortableColumns.find((c) => c.key === filters.sortBy)?.label} {filters.sortDir === "asc" ? "تصاعدي" : "تنازلي"} — التلوين حسب رقم المشكلة معطّل</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="conflict-page-size" className="text-xs">
              سجلات الصفحة
            </Label>
            <select
              id="conflict-page-size"
              className={cn(selectClass, "h-9 w-20")}
              value={filters.pageSize}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  pageSize: Number(event.target.value),
                  page: 1,
                }))
              }
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[1400px] text-sm">
            <caption className="sr-only">
              رقم المشكلة وملف المصدر والاسم الثلاثي واسم الأم والرقم الوطني والشام كاش والرقم الذاتي والفئة الوظيفية والمشكلة وشرحها
            </caption>
            <thead className="bg-muted/70">
              <tr>
                {sortableColumns.map((col) => (
                  <th key={col.key} scope="col" className="p-0 text-right font-bold">
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className={cn(
                        "flex w-full items-center justify-between gap-1 p-4 text-right transition hover:bg-muted",
                        filters.sortBy === col.key && "bg-primary/5 text-primary",
                      )}
                      aria-label={`فرز حسب ${col.label} ${filters.sortBy === col.key && filters.sortDir === "asc" ? "تنازلي" : "تصاعدي"}`}
                    >
                      <span>{col.label}</span>
                      <SortIcon active={filters.sortBy === col.key} dir={filters.sortDir} />
                    </button>
                  </th>
                ))}
                <th scope="col" className="p-4 text-right font-bold">
                  المشكلة وشرحها
                </th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                Array.from({ length: 5 }, (_, index) => (
                  <tr key={index} className="border-t">
                    {Array.from({ length: 9 }, (_, cell) => (
                      <td key={cell} className="p-4">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center">
                    <div role="alert" className="mb-4 text-destructive">
                      {error}
                    </div>
                    <Button variant="outline" onClick={() => setRevision((current) => current + 1)}>
                      إعادة المحاولة
                    </Button>
                  </td>
                </tr>
              ) : !data?.rows.length ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <CircleCheck className="mx-auto mb-3 size-9 text-primary" aria-hidden="true" />
                    <p className="font-bold">لا توجد سجلات تطابق هذه الفلاتر</p>
                    <p className="mt-2 text-muted-foreground">
                      يمكنك اختيار حقل أو حالة أخرى لمتابعة المراجعة.
                    </p>
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => {
                  const isEvenIssue = isDefaultSort && row.issueNumber % 2 === 0;
                  const rowBg = isDefaultSort
                    ? isEvenIssue
                      ? "bg-amber-50/70 dark:bg-amber-950/20"
                      : "bg-white dark:bg-card"
                    : "bg-card";
                  return (
                    <tr
                      key={row.id}
                      className={cn("border-t align-top transition hover:bg-muted/40", rowBg)}
                    >
                      <td className="p-4 text-center">
                        <span
                          className={cn(
                            "inline-flex min-w-8 justify-center rounded-full px-2 py-1 text-xs font-black",
                            isEvenIssue
                              ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                              : "bg-primary/10 text-primary",
                          )}
                        >
                          {row.issueNumber}
                        </span>
                      </td>
                      <td className="max-w-44 p-4">
                        <Link
                          className="font-semibold text-primary hover:underline"
                          href={`/groups/${row.groupId}/files/${row.fileId}`}
                        >
                          {row.fileName}
                        </Link>
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {row.originalFilename}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">صف Excel: {row.rowIndex}</p>
                      </td>
                      <td className="min-w-36 p-4">
                        <Link
                          href={`/records/${row.id}`}
                          className="font-semibold hover:text-primary hover:underline"
                        >
                          {row.fullName || "—"}
                        </Link>
                        {!row.fullName && (
                          <Link
                            className="mt-2 block text-xs text-primary hover:underline"
                            href={`/records/${row.id}`}
                          >
                            فتح السجل
                          </Link>
                        )}
                      </td>
                      <td className="min-w-28 p-4">{row.motherName || "—"}</td>
                      <td className="p-4">
                        <bdi className="break-all font-mono text-xs">
                          {formatNationalId(row.nationalId) || "—"}
                        </bdi>
                      </td>
                      <td className="p-4">
                        <bdi className="break-all font-mono text-xs ltr-numbers">
                          {row.shamCash ? formatShamCash(row.shamCash) || row.shamCash : "—"}
                        </bdi>
                      </td>
                      <td className="p-4">
                        <bdi className="break-all font-mono text-xs">
                          {row.personalNo || "—"}
                        </bdi>
                      </td>
                      <td className="min-w-36 p-4">
                        {formatFunctionalCategory(row.functionalCategory) || "—"}
                      </td>
                      <td className="min-w-80 max-w-xl p-4">
                        <ul className="space-y-3">
                          {row.issues.map((issue, index) => (
                            <li key={`${issue.rule}-${index}`}>
                              <p className="text-xs font-bold text-primary">{issue.label}</p>
                              <p className="mt-1 break-words text-sm leading-7 text-muted-foreground">
                                {toLatinDigits(issue.explanation)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {busy && (
          <p className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            يشمل الفحص جميع الملفات المكتملة في الأرشيف
          </p>
        )}
        {!busy && !error && data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              disabled={data.page <= 1}
              onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
              السابق
            </Button>
            <span className="text-sm text-muted-foreground">
              الصفحة {data.page} من {data.pageCount}
            </span>
            <Button
              variant="outline"
              disabled={data.page >= data.pageCount}
              onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
            >
              التالي
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
