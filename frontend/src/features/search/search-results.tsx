"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowUpDown, ExternalLink, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatFunctionalCategory, formatNationalId, formatShamCash } from "@/lib/conflict-format";
import { computeHighlightRanges } from "@/lib/highlight";
import { STANDARD_FIELD_LABELS, type StandardFieldKey } from "@/lib/standard-fields";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import { BulkSearchInterface } from "@/features/bulk-search/bulk-search-interface";
import { ScopeSelector } from "@/features/search/scope-selector";
import { groupsService } from "@/services/groups.service";
import { searchService, type SearchResponse, type SearchRow } from "@/services/search.service";
import { cn } from "@/lib/cn";

// Full UI-03 port (P3.4): mode tabs, 14-field select, scope selector with
// repeated groupId/fileId params, 10 backend sorts, match badge/highlight,
// pager, keyboard row navigation, back/forward restoration. Data contract is
// the V1 rows/total/page/pageSize/pageCount shape (docs/05 A09).

const SEARCH_FIELDS = [
  "full_name",
  "national_id",
  "first_name",
  "father_name",
  "last_name",
  "mother_name",
  "sham_cash",
  "personal_no",
  "phone",
  "contract_code",
  "secondary_contract_code",
  "job_title",
  "functional_category",
  "organizational_level",
] as const;

const SORT_COLUMNS: { key: string; label: string }[] = [
  { key: "source", label: "المصدر" },
  { key: "full_name", label: "الاسم الثلاثي" },
  { key: "national_id", label: "الرقم الوطني" },
  { key: "mother_name", label: "اسم الأم" },
  { key: "sham_cash", label: "الشام كاش" },
  { key: "personal_no", label: "الرقم الذاتي" },
  { key: "job_title", label: "المسمى الوظيفي" },
  { key: "organizational_level", label: "السوية التنظيمية" },
];

const PAGE_SIZES = [10, 25, 50, 100];
const QUERY_IDLE_MS = 600;

function Highlight({ value, query, field }: { value: string; query: string; field: StandardFieldKey | string | null }) {
  const parts = useMemo(() => {
    if (!value || !query.trim()) return null;
    const ranges = computeHighlightRanges(value, query, field);
    if (ranges.length === 0) return null;
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) nodes.push(value.slice(cursor, range.start));
      nodes.push(
        <mark
          key={`${range.start}-${range.end}`}
          title={range.fuzzy ? "مطابقة تقريبية" : undefined}
          className={
            range.fuzzy
              ? "rounded bg-orange-200 px-0.5 text-orange-950 underline decoration-dotted underline-offset-2 dark:bg-orange-400/30 dark:text-orange-100"
              : "rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100"
          }
        >
          {value.slice(range.start, range.end)}
        </mark>,
      );
      cursor = range.end;
    }
    if (cursor < value.length) nodes.push(value.slice(cursor));
    return nodes;
  }, [value, query, field]);
  if (!parts) return <>{value}</>;
  return <>{parts}</>;
}

function matchedDisplayValue(row: SearchRow): string {
  if (row.matchedField === "sham_cash") return formatShamCash(row.matchedValue) || "—";
  if (row.matchedField === "functional_category") return formatFunctionalCategory(row.matchedValue) || "—";
  if (row.matchedField === "national_id") return formatNationalId(row.matchedValue) || "—";
  return row.matchedValue || "—";
}

interface Filters {
  q: string;
  mode: string;
  field: string;
  groupIds: string[];
  fileIds: string[];
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: string;
  similar: boolean;
}

function readFromParams(params: URLSearchParams): Filters {
  const num = (key: string, fallback: number) => {
    const raw = Number(params.get(key));
    return Number.isInteger(raw) && raw > 0 ? raw : fallback;
  };
  const pageSize = num("pageSize", 25);
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    mode: params.get("mode") === "custom" ? "custom" : params.get("mode") === "bulk" ? "bulk" : "full",
    field: params.get("field") || "full_name",
    groupIds: params.getAll("groupId").filter(Boolean),
    fileIds: params.getAll("fileId").filter(Boolean),
    page: num("page", 1),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 25,
    sortBy: params.get("sortBy") || "",
    sortDir: params.get("sortDir") === "desc" ? "desc" : "asc",
    similar: params.get("similar") !== "false",
  };
}

function toQueryString(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.mode !== "full") params.set("mode", filters.mode);
  if (filters.mode === "custom") params.set("field", filters.field);
  for (const id of filters.groupIds) params.append("groupId", id);
  for (const id of filters.fileIds) params.append("fileId", id);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 25) params.set("pageSize", String(filters.pageSize));
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir !== "asc") params.set("sortDir", filters.sortDir);
  if (!filters.similar) params.set("similar", "false");
  const text = params.toString();
  return text ? `/search?${text}` : "/search";
}

export function SearchResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => readFromParams(new URLSearchParams(searchParams.toString())));
  const [draft, setDraft] = useState(filters.q);
  // Raw draft (no trim while typing): trimming here rewrote filters.q and
  // synced back into the input, deleting the trailing space while the user
  // is still typing a multi-word name. The backend normalizes/tokenizes the
  // query itself, so trailing spaces are harmless for search.
  const debouncedDraft = useDebouncedValue(draft.slice(0, 200), QUERY_IDLE_MS);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canBulk, setCanBulk] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    authService
      .me()
      .then((me) => {
        if (active) setCanBulk(hasPermission(me?.permissions ?? [], "bulkSearch.view"));
      })
      .catch(() => {
        if (active) setCanBulk(false);
      });
    return () => {
      active = false;
    };
  }, []);
  // Mount-only gate: when the URL carries no explicit scope, the initial
  // scope comes from each group's "تضمين في البحث الافتراضي" flag instead of
  // searching everything. Skips the wasteful full-archive first fetch.
  const paramsHaveScope = searchParams.getAll("groupId").length > 0 || searchParams.getAll("fileId").length > 0;
  const [scopeReady, setScopeReady] = useState(paramsHaveScope);
  const scopeResolved = useRef(paramsHaveScope);

  useEffect(() => {
    if (scopeResolved.current) return;
    scopeResolved.current = true;
    groupsService
      .list()
      .then((list) => {
        if (list.length === 0) return;
        const included = list.filter((g) => g.includeInDefaultSearch !== false).map((g) => g.id);
        if (included.length === 0 || included.length === list.length) return; // none or all → keep "all"
        setFilters((current) => {
          if (current.groupIds.length > 0 || current.fileIds.length > 0) return current;
          const next = { ...current, groupIds: included, page: 1 };
          router.replace(toQueryString(next), { scroll: false });
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => setScopeReady(true));
  }, [router]);

  // Back/forward restoration: adopt external URL changes into state.
  useEffect(() => {
    // Intentional URL→state sync (same pattern as use-api-query).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(readFromParams(new URLSearchParams(searchParams.toString())));
  }, [searchParams]);

  // Keep the input draft in sync when navigation happens elsewhere.
  const [previousQ, setPreviousQ] = useState(filters.q);
  if (filters.q !== previousQ) {
    setPreviousQ(filters.q);
    setDraft(filters.q);
  }

  // Push the settled draft to the filters (and URL) once typing pauses.
  useEffect(() => {
    // Intentional debounce→URL sync (same pattern as use-api-query).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters((current) => {
      if (debouncedDraft === current.q) return current;
      const next = { ...current, q: debouncedDraft, page: 1 };
      router.replace(toQueryString(next), { scroll: false });
      return next;
    });
  }, [debouncedDraft, router]);

  // Fetch on every committed filter change (bulk mode has its own flow).
  useEffect(() => {
    if (!scopeReady) return;
    if (filters.mode === "bulk") {
      // Intentional request-status sync (same pattern as use-api-query).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    // Cancel the previous in-flight search: fast typing/sort/scope changes
    // used to pile overlapping archive queries on the backend (responses were
    // ignored but still consumed bandwidth + DB threads).
    const controller = new AbortController();
    // Intentional request-status sync (same pattern as use-api-query).
    setLoading(true);
    setError(null);
    searchService
      .search({
        q: filters.q,
        mode: filters.mode,
        field: filters.mode === "custom" ? filters.field : undefined,
        groupIds: filters.groupIds,
        fileIds: filters.fileIds,
        page: filters.page,
        pageSize: filters.pageSize,
        sortBy: filters.sortBy || undefined,
        sortDirection: filters.sortDir,
        similar: filters.similar,
      }, { signal: controller.signal })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        // Aborted superseded requests are not errors.
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (active) setError(err instanceof ApiError ? err.message : "تعذر تحميل نتائج البحث.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [filters, scopeReady]);

  function update(next: Partial<Filters>, resetPage = false) {
    setFilters((current) => {
      const merged = { ...current, ...next, page: resetPage ? 1 : (next.page ?? current.page) };
      router.replace(toQueryString(merged), { scroll: false });
      return merged;
    });
  }

  function toggleSort(key: string) {
    setFilters((current) => {
      const dir = current.sortBy === key && current.sortDir === "asc" ? "desc" : "asc";
      const merged = { ...current, sortBy: key, sortDir: dir, page: 1 };
      router.replace(toQueryString(merged), { scroll: false });
      return merged;
    });
  }

  function openRecord(id: string) {
    router.push(`/records/${id}`);
  }

  const outOfRange = data !== null && data.pageCount > 0 && filters.page > data.pageCount;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="بحث عربي مرن"
        title="البحث في جميع السجلات"
        description="البحث العام: الاسم الثلاثي وتركيبه، الرقم الوطني، الشام كاش، الرقم الذاتي — وباقي الحقول في البحث المخصص. تُراعى اختلافات الهمزة والتاء المربوطة والأرقام العربية تلقائيًا."
      />
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="space-y-4 p-5">
          <div className="flex rounded-lg bg-muted p-1" role="tablist" aria-label="وضع البحث">
            <button
              type="button"
              role="tab"
              aria-selected={filters.mode === "full"}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-bold",
                filters.mode === "full" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => update({ mode: "full" }, true)}
            >
              البحث الكامل
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filters.mode === "custom"}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-bold",
                filters.mode === "custom" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => update({ mode: "custom", field: filters.field || "full_name" }, true)}
            >
              البحث المخصص
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filters.mode === "bulk"}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-bold",
                filters.mode === "bulk" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => update({ mode: "bulk" }, true)}
              hidden={canBulk === false}
            >
              البحث الجماعي
            </button>
          </div>
          {filters.mode === "bulk" ? (
            canBulk === false ? (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
                لا تملك صلاحية إظهار قسم البحث الجماعي واستخدامه.
              </p>
            ) : (
              <BulkSearchInterface />
            )
          ) : (
          <>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              {loading ? (
                <Loader2 className="absolute left-3 top-3.5 size-4 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <Label htmlFor="search-query" className="sr-only">
                عبارة البحث
              </Label>
              <Input
                id="search-query"
                className="h-11 pe-10"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="اسم، رقم وطني، هاتف، فئة وظيفية، أو أي معرّف…"
                autoFocus
                maxLength={200}
              />
            </div>
            {filters.mode === "custom" ? (
              <div className="relative sm:min-w-56">
                <Label htmlFor="search-field" className="sr-only">
                  حقل البحث
                </Label>
                <select
                  id="search-field"
                  aria-label="حقل البحث"
                  className="h-11 w-full appearance-none rounded-md border border-input bg-background py-2 pe-9 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={filters.field}
                  onChange={(e) => update({ field: e.target.value }, true)}
                >
                  {SEARCH_FIELDS.map((key) => (
                    <option key={key} value={key}>
                      {STANDARD_FIELD_LABELS[key as keyof typeof STANDARD_FIELD_LABELS]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <ScopeSelector
              groupIds={filters.groupIds}
              fileIds={filters.fileIds}
              onChange={(scope) => update({ ...scope }, true)}
            />
          </div>
          {(filters.groupIds.length > 0 || filters.fileIds.length > 0) && filters.mode !== "bulk" && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => update({ groupIds: [], fileIds: [] }, true)}
            >
              إعادة تعيين النطاق إلى جميع الملفات
            </button>
          )}
          </>
          )}
        </div>
      </div>

      {filters.mode === "bulk" ? null : (
      <section aria-label="نتائج البحث" aria-live="polite" className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        {loading && !data ? (
          <p className="text-sm text-muted-foreground">جارٍ البحث…</p>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                تم العثور على <strong className="text-foreground">{data.total.toLocaleString("en-US")}</strong> نتيجة
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  الصفحة {data.page} من {Math.max(1, data.pageCount)}
                </p>
                <label
                  htmlFor="search-similar"
                  className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold shadow-sm transition hover:border-primary/40"
                >
                  <input
                    id="search-similar"
                    type="checkbox"
                    checked={filters.similar}
                    onChange={(e) => update({ similar: e.target.checked }, true)}
                    className="size-4 accent-primary"
                  />
                  عرض المتشابه
                </label>
              </div>
            </div>
            {data.rows.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card p-6 text-center sm:p-12">
                <h2 className="font-bold">
                  {filters.q ? "لم نعثر على نتائج مطابقة" : "اكتب عبارة للبحث في الأرشيف"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {outOfRange
                    ? "رقم الصفحة خارج النطاق — عُد إلى الصفحة الأولى."
                    : "جرّب كتابة كلمات أقل، أو غيّر نطاق البحث إلى جميع الملفات."}
                </p>
                {outOfRange ? (
                  <Button type="button" variant="outline" className="mt-4" onClick={() => update({ page: 1 })}>
                    العودة إلى الصفحة الأولى
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full min-w-[1450px] text-sm">
                    <thead className="bg-muted/70">
                      <tr>
                        {SORT_COLUMNS.map((column) => {
                          const active = filters.sortBy === column.key;
                          return (
                            <th key={column.key} scope="col" className="p-0 text-right font-bold" aria-sort={active ? (filters.sortDir === "asc" ? "ascending" : "descending") : "none"}>
                              <button
                                type="button"
                                onClick={() => toggleSort(column.key)}
                                className="group flex w-full items-center gap-2 p-3 text-right transition hover:bg-muted"
                                title={active && filters.sortDir === "asc" ? "ترتيب تنازلي" : "ترتيب تصاعدي"}
                              >
                                <span>{column.label}</span>
                                {active ? (
                                  <ArrowUp aria-hidden="true" className={cn("size-4 shrink-0 text-primary", filters.sortDir === "desc" && "rotate-180")} />
                                ) : (
                                  <ArrowUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60 transition group-hover:text-foreground" />
                                )}
                              </button>
                            </th>
                          );
                        })}
                        <th scope="col" className="p-3 text-right font-bold">
                          المطابقة
                        </th>
                        <th scope="col" className="w-14 p-3 text-right font-bold">
                          <span className="sr-only">فتح في علامة تبويب جديدة</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) => (
                        <tr
                          key={row.id}
                          tabIndex={0}
                          role="link"
                          aria-label={`فتح سجل ${row.sfFullName || row.dNationalId || row.id}`}
                          className="cursor-pointer border-t transition hover:bg-muted/50 focus:bg-muted focus:outline-none"
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest("a")) return;
                            openRecord(row.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openRecord(row.id);
                            }
                          }}
                        >
                          <td className="p-3 align-top">
                            <p className="font-bold">{row.groupName}</p>
                            <p className="text-xs text-muted-foreground">{row.fileName}</p>
                          </td>
                          <td className="p-3 align-top">{row.sfFullName || "—"}</td>
                          <td className="whitespace-nowrap p-3 align-top">
                            <span dir="ltr" className="ltr-numbers">{formatNationalId(row.dNationalId) || "—"}</span>
                          </td>
                          <td className="p-3 align-top">{row.sfMotherName || "—"}</td>
                          <td className="whitespace-nowrap p-3 align-top">
                            <span dir="ltr" className="ltr-numbers">{formatShamCash(row.sfShamCash) || "—"}</span>
                          </td>
                          <td className="p-3 align-top">
                            <span className="ltr-numbers">{row.sfPersonalNo || "—"}</span>
                          </td>
                          <td className="p-3 align-top">{row.sfJobTitle || "—"}</td>
                          <td className="p-3 align-top">{row.sfOrganizationalLevel || "—"}</td>
                          <td className="p-3 align-top">
                            <div className="min-w-40 space-y-1">
                              {row.matchedField ? (
                                <Badge variant="secondary">
                                  {row.matchedField === "name_parts"
                                    ? "تركيب الاسم الثلاثي"
                                    : (STANDARD_FIELD_LABELS[row.matchedField as keyof typeof STANDARD_FIELD_LABELS] ?? row.matchedField)}
                                </Badge>
                              ) : null}
                              <p className="text-sm">
                                {row.matchedField === "sham_cash" ? (
                                  <bdi dir="ltr" className="ltr-numbers">
                                    <Highlight value={matchedDisplayValue(row)} query={filters.q} field={row.matchedField} />
                                  </bdi>
                                ) : (
                                  <Highlight value={matchedDisplayValue(row)} query={filters.q} field={row.matchedField} />
                                )}
                              </p>
                            </div>
                          </td>
                          <td className="p-3 align-top">
                            <Button asChild variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary">
                              <a
                                href={`/records/${row.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="فتح في علامة تبويب جديدة"
                                aria-label={`فتح ${row.sfFullName || "السجل"} في علامة تبويب جديدة`}
                                onClick={(event) => event.stopPropagation()}
                                onAuxClick={(event) => event.stopPropagation()}
                              >
                                <ExternalLink className="size-4" aria-hidden="true" />
                              </a>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => update({ page })} />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    حجم الصفحة
                    <select
                      aria-label="حجم الصفحة"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={data.pageSize}
                      onChange={(e) => update({ pageSize: Number(e.target.value) }, true)}
                    >
                      {PAGE_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
          </>
        ) : null}
      </section>
      )}
    </div>
  );
}
