"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronUp, ExternalLink, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatFunctionalCategory, formatNationalId, formatShamCash } from "@/lib/conflict-format";
import { normalizeStored } from "@/lib/normalization";
import { STANDARD_FIELD_LABELS } from "@/lib/standard-fields";
import { ApiError } from "@/services/api-client";
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
  { key: "functional_category", label: "الفئة الوظيفية" },
  { key: "organizational_level", label: "السوية التنظيمية" },
];

const PAGE_SIZES = [10, 25, 50, 100];
const QUERY_IDLE_MS = 600;

interface ScopeGroup {
  id: string;
  name: string;
  files: { id: string; name: string }[];
}

function Highlight({ value, query }: { value: string; query: string }) {
  const parts = useMemo(() => {
    if (!value || !query.trim()) return null;
    const tokens = normalizeStored(query).split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) return null;
    const normalized = normalizeStored(value);
    const ranges: { start: number; end: number }[] = [];
    for (const token of tokens) {
      let from = 0;
      for (;;) {
        const index = normalized.indexOf(token, from);
        if (index < 0) break;
        ranges.push({ start: index, end: Math.min(value.length, index + token.length) });
        from = index + Math.max(1, token.length);
      }
    }
    if (ranges.length === 0) return null;
    ranges.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
    }
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (const range of merged) {
      if (range.start > cursor) nodes.push(value.slice(cursor, range.start));
      nodes.push(
        <mark
          key={`${range.start}-${range.end}`}
          className="rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100"
        >
          {value.slice(range.start, range.end)}
        </mark>,
      );
      cursor = range.end;
    }
    if (cursor < value.length) nodes.push(value.slice(cursor));
    return nodes;
  }, [value, query]);
  if (!parts) return <>{value}</>;
  return <>{parts}</>;
}

function matchedDisplayValue(row: SearchRow): string {
  if (row.matchedField === "sham_cash") return formatShamCash(row.matchedValue) || "—";
  if (row.matchedField === "functional_category") return formatFunctionalCategory(row.matchedValue) || "—";
  if (row.matchedField === "national_id") return formatNationalId(row.matchedValue) || "—";
  return row.matchedValue || "—";
}

function ScopeSelector({
  groupIds,
  fileIds,
  onChange,
}: {
  groupIds: string[];
  fileIds: string[];
  onChange: (next: { groupIds: string[]; fileIds: string[] }) => void;
}) {
  const [groups, setGroups] = useState<ScopeGroup[]>([]);
  const [filesByGroup, setFilesByGroup] = useState<Record<string, { id: string; name: string }[]>>({});
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    groupsService
      .list()
      .then((list) => {
        if (active) setGroups(list.map((g) => ({ id: g.id, name: g.name, files: [] })));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open ]);

  async function expand(groupId: string) {
    setExpanded((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
    if (filesByGroup[groupId]) return;
    try {
      const detail = await groupsService.get(groupId);
      setFilesByGroup((current) => ({
        ...current,
        [groupId]: detail.files.map((f) => ({ id: f.id, name: f.name })),
      }));
      setGroups((current) =>
        current.map((g) =>
          g.id === groupId
            ? { ...g, files: detail.files.map((f) => ({ id: f.id, name: f.name })) }
            : g,
        ),
      );
    } catch {
      // Keep the group row; files stay unavailable.
    }
  }

  const allSelected = groupIds.length === 0 && fileIds.length === 0;
  const selectedFiles = groups.flatMap((g) => filesByGroup[g.id] ?? []).filter((f) => fileIds.includes(f.id));
  const selectedGroups = groups.filter((g) => groupIds.includes(g.id));
  const label = allSelected
    ? "جميع الملفات"
    : selectedGroups.length === 1 && selectedFiles.length === 0
      ? `${selectedGroups[0].name}: جميع الملفات`
      : `${selectedGroups.length > 0 ? `${selectedGroups.length} مجموعة و` : ""}${selectedFiles.length} ملف محدد`;

  function toggleGroup(group: ScopeGroup) {
    const files = filesByGroup[group.id] ?? group.files;
    const selected =
      groupIds.includes(group.id) || (files.length > 0 && files.every((f) => fileIds.includes(f.id)));
    onChange({
      groupIds: selected ? groupIds.filter((id) => id !== group.id) : [...groupIds, group.id],
      fileIds: fileIds.filter((id) => !files.some((f) => f.id === id)),
    });
  }

  function toggleFile(groupId: string, fileId: string) {
    const selected = fileIds.includes(fileId);
    onChange({
      groupIds: groupIds.filter((id) => id !== groupId),
      fileIds: selected ? fileIds.filter((id) => id !== fileId) : [...fileIds, fileId],
    });
  }

  function option(selected: boolean, text: string) {
    return (
      <>
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded border",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
          )}
        >
          {selected ? <Check className="size-3.5" /> : null}
        </span>
        <span className="truncate">{text}</span>
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-0 sm:min-w-64">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-between px-3 font-normal"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </Button>
      {open ? (
        <div
          role="listbox"
          aria-label="تخصيص نطاق البحث"
          aria-multiselectable="true"
          className="absolute end-0 top-full z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border bg-white p-1 text-card-foreground shadow-lg sm:min-w-80"
        >
          <button
            type="button"
            role="option"
            aria-selected={allSelected}
            className="mb-1 flex w-full items-center gap-2 rounded-sm border-b px-3 py-2 text-right text-sm font-semibold hover:bg-accent"
            onClick={() => onChange({ groupIds: [], fileIds: [] })}
          >
            {option(allSelected, "جميع المجموعات والملفات")}
          </button>
          {groups.map((group) => {
            const files = filesByGroup[group.id] ?? group.files;
            const groupSelected =
              allSelected ||
              groupIds.includes(group.id) ||
              (files.length > 0 && files.every((f) => fileIds.includes(f.id)));
            const isExpanded = expanded.includes(group.id);
            return (
              <div key={group.id} className="border-b last:border-b-0">
                <div className="flex items-center">
                  <button
                    type="button"
                    role="option"
                    aria-selected={groupSelected}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-sm px-3 py-2 text-right text-sm font-semibold hover:bg-accent",
                      groupSelected && "bg-primary/5 text-primary",
                    )}
                    onClick={() => toggleGroup(group)}
                  >
                    {option(groupSelected, `${group.name} — جميع الملفات`)}
                  </button>
                  <button
                    type="button"
                    className="p-2 text-muted-foreground hover:text-foreground"
                    aria-label={`${isExpanded ? "إخفاء" : "عرض"} ملفات ${group.name}`}
                    onClick={() => void expand(group.id)}
                  >
                    {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                </div>
                {isExpanded ? (
                  <div className="mb-1 ms-3 border-s ps-2">
                    {files.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">لا توجد ملفات محملة.</p>
                    ) : (
                      files.map((file) => {
                        const fileSelected =
                          allSelected || groupIds.includes(group.id) || fileIds.includes(file.id);
                        return (
                          <button
                            key={file.id}
                            type="button"
                            role="option"
                            aria-selected={fileSelected}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-right text-sm hover:bg-accent",
                              fileSelected && "text-primary",
                            )}
                            onClick={() => toggleFile(group.id, file.id)}
                          >
                            {option(fileSelected, file.name)}
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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
}

function readFromParams(params: URLSearchParams): Filters {
  const num = (key: string, fallback: number) => {
    const raw = Number(params.get(key));
    return Number.isInteger(raw) && raw > 0 ? raw : fallback;
  };
  const pageSize = num("pageSize", 25);
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    mode: params.get("mode") === "custom" ? "custom" : "full",
    field: params.get("field") || "full_name",
    groupIds: params.getAll("groupId").filter(Boolean),
    fileIds: params.getAll("fileId").filter(Boolean),
    page: num("page", 1),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 25,
    sortBy: params.get("sortBy") || "",
    sortDir: params.get("sortDir") === "desc" ? "desc" : "asc",
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
  const text = params.toString();
  return text ? `/search?${text}` : "/search";
}

export function SearchResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => readFromParams(new URLSearchParams(searchParams.toString())));
  const [draft, setDraft] = useState(filters.q);
  const debouncedDraft = useDebouncedValue(draft.trim().slice(0, 200), QUERY_IDLE_MS);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch on every committed filter change.
  useEffect(() => {
    let active = true;
    // Intentional request-status sync (same pattern as use-api-query).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "تعذر تحميل نتائج البحث.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters]);

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
        description="تُراعى اختلافات الهمزة والتاء المربوطة والأرقام العربية تلقائيًا."
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
          </div>
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
          {(filters.groupIds.length > 0 || filters.fileIds.length > 0) && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => update({ groupIds: [], fileIds: [] }, true)}
            >
              إعادة تعيين النطاق إلى جميع الملفات
            </button>
          )}
        </div>
      </div>

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
              <p className="text-sm text-muted-foreground">
                الصفحة {data.page} من {Math.max(1, data.pageCount)}
              </p>
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
                          <td className="p-3 align-top">
                            <span className="ltr-numbers">{formatNationalId(row.dNationalId) || "—"}</span>
                          </td>
                          <td className="p-3 align-top">{row.sfMotherName || "—"}</td>
                          <td className="p-3 align-top">
                            <span className="ltr-numbers">{formatShamCash(row.sfShamCash) || "—"}</span>
                          </td>
                          <td className="p-3 align-top">
                            <span className="ltr-numbers">{row.sfPersonalNo || "—"}</span>
                          </td>
                          <td className="p-3 align-top">{row.sfJobTitle || "—"}</td>
                          <td className="p-3 align-top">{formatFunctionalCategory(row.sfFunctionalCategory) || "—"}</td>
                          <td className="p-3 align-top">{row.sfOrganizationalLevel || "—"}</td>
                          <td className="p-3 align-top">
                            <div className="min-w-40 space-y-1">
                              {row.matchedField ? (
                                <Badge variant="secondary">
                                  {STANDARD_FIELD_LABELS[row.matchedField as keyof typeof STANDARD_FIELD_LABELS] ?? row.matchedField}
                                </Badge>
                              ) : null}
                              <p className="text-sm">
                                <Highlight value={matchedDisplayValue(row)} query={filters.q} />
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
    </div>
  );
}
