"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Search,
} from "lucide-react";
import type { StandardFieldKey } from "@/lib/excel/types";
import { STANDARD_FIELD_LABELS } from "@/lib/excel/standard-fields";
import { SEARCH_FIELDS } from "@/lib/search/fields";
import type { SearchSortDirection, SearchSortKey } from "@/lib/search/sort";
import { digitsOnly, normalizeQuery, normalizeStored } from "@/lib/normalization/arabic";
import { formatShamCash } from "@/lib/format/sham-cash";
import { formatNationalId } from "@/lib/format/national-id";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type ResultRow = {
  id: string;
  groupId: string;
  groupName: string;
  fileId: string;
  fileName: string;
  sfFullName: string | null;
  sfNationalId: string | null;
  dNationalId: string | null;
  sfMotherName: string | null;
  sfShamCash: string | null;
  sfPersonalNo: string | null;
  matchedField: StandardFieldKey | null;
  matchedValue: string | null;
  matchRank: number;
};
type SearchResponse = {
  rows: ResultRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  error?: string;
};
const numericFields = new Set<StandardFieldKey>([
  "national_id",
  "sham_cash",
  "personal_no",
  "phone",
]);
const selectClass =
  "h-11 appearance-none rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function SearchSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function GroupMultiSelect({
  groups,
  value,
  onChange,
}: {
  groups: { id: string; name: string }[];
  value: string[];
  onChange: (groupIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const allGroupIds = groups.map((group) => group.id);
  const allSelected = groups.length === 0 || value.length === groups.length;
  const selectedNames = groups
    .filter((group) => value.includes(group.id))
    .map((group) => group.name);
  const label = allSelected ? "جميع الملفات" : `${selectedNames.length} مجموعة`;

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggleGroup(groupId: string) {
    const next = value.includes(groupId)
      ? value.filter((id) => id !== groupId)
      : [...value, groupId];
    onChange(next);
  }

  function option(selected: boolean, text: string) {
    return (
      <>
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}
        >
          {selected ? <Check className="size-3.5" /> : null}
        </span>
        <span className="truncate">{text}</span>
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-56">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-between px-3 font-normal"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open ? (
        <div
          role="listbox"
          aria-label="مصدر البيانات"
          aria-multiselectable="true"
          className="absolute start-0 top-full z-50 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg bg-white"
        >
          <div className="mb-1 border-b border-border pb-1">
            <button
              type="button"
              role="option"
              aria-selected={allSelected}
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-right text-sm font-semibold hover:bg-accent hover:text-accent-foreground"
              onClick={() => onChange(allSelected ? [] : allGroupIds)}
            >
              {option(allSelected, "جميع الملفات")}
            </button>
          </div>
          {groups.map((group) => {
            const selected = value.includes(group.id);
            return (
              <button
                key={group.id}
                type="button"
                role="option"
                aria-selected={selected}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-right text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => toggleGroup(group.id)}
              >
                {option(selected, group.name)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function mappedSequence(value: string, numeric: boolean) {
  let normalized = "";
  const map: { start: number; end: number }[] = [];
  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    const end = index + character.length;
    const transformed = numeric ? digitsOnly(character) : normalizeStored(character);
    for (const normalizedCharacter of transformed) {
      normalized += normalizedCharacter;
      map.push({ start: index, end });
    }
    index = end;
  }
  return { normalized, map };
}

function Highlight({
  value,
  query,
  field,
}: {
  value: string;
  query: string;
  field: StandardFieldKey | null;
}) {
  const numeric = field ? numericFields.has(field) : false;
  const needles = numeric ? [digitsOnly(query)].filter(Boolean) : normalizeQuery(query);
  const sequence = mappedSequence(value, numeric);
  const ranges = needles
    .map((needle) => {
      const start = sequence.normalized.indexOf(needle);
      if (start < 0 || !sequence.map[start] || !sequence.map[start + needle.length - 1])
        return null;
      return { start: sequence.map[start].start, end: sequence.map[start + needle.length - 1].end };
    })
    .filter((range): range is { start: number; end: number } => Boolean(range))
    .sort((a, b) => a.start - b.start);
  if (!ranges.length) return <>{value}</>;
  const merged = ranges.reduce<{ start: number; end: number }[]>((all, current) => {
    const last = all.at(-1);
    if (last && current.start <= last.end) last.end = Math.max(last.end, current.end);
    else all.push({ ...current });
    return all;
  }, []);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) parts.push(value.slice(cursor, range.start));
    parts.push(
      <mark
        key={`${range.start}-${range.end}`}
        className="rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100"
      >
        {value.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return <>{parts}</>;
}

const helper = createColumnHelper<ResultRow>();

export function SearchInterface({
  groups,
  initialQuery,
}: {
  groups: { id: string; name: string }[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [field, setField] = useState<StandardFieldKey>("full_name");
  const [groupIds, setGroupIds] = useState<string[]>(() => groups.map((group) => group.id));
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<{
    key: SearchSortKey;
    direction: SearchSortDirection;
  } | null>(null);
  const [data, setData] = useState<SearchResponse>({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 25,
    pageCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!debounced || groupIds.length === 0) {
      setData({ rows: [], total: 0, page: 1, pageSize: 25, pageCount: 0 });
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      q: debounced,
      mode,
      page: String(page),
      pageSize: "25",
    });
    if (mode === "custom") parameters.set("field", field);
    if (sorting) {
      parameters.set("sortBy", sorting.key);
      parameters.set("sortDirection", sorting.direction);
    }
    if (groupIds.length < groups.length)
      for (const groupId of groupIds) parameters.append("groupId", groupId);
    setLoading(true);
    setError("");
    fetch(`/api/search?${parameters}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as SearchResponse;
        if (!response.ok) throw new Error(result.error ?? "تعذر تنفيذ البحث.");
        setData(result);
        router.replace(`/search?q=${encodeURIComponent(debounced)}`, { scroll: false });
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError"))
          setError(reason instanceof Error ? reason.message : "تعذر تنفيذ البحث.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced, mode, field, groupIds, groups.length, page, router, sorting]);

  const columns = useMemo(
    () => [
      helper.accessor((row) => `${row.groupName} — ${row.fileName}`, {
        id: "source",
        header: "المصدر",
        cell: (info) => (
          <div>
            <p className="font-bold">{info.row.original.groupName}</p>
            <p className="text-xs text-muted-foreground">{info.row.original.fileName}</p>
          </div>
        ),
      }),
      helper.accessor("sfFullName", {
        id: "full_name",
        header: "الاسم الثلاثي",
        cell: (info) => info.getValue() || "—",
      }),
      helper.accessor("dNationalId", {
        id: "national_id",
        header: "الرقم الوطني",
        cell: (info) => (
          <span className="ltr-numbers">{formatNationalId(info.getValue()) || "—"}</span>
        ),
      }),
      helper.accessor("sfMotherName", {
        id: "mother_name",
        header: "اسم الأم",
        cell: (info) => info.getValue() || "—",
      }),
      helper.accessor("sfShamCash", {
        id: "sham_cash",
        header: "الشام كاش",
        cell: (info) => (
          <span className="ltr-numbers">{formatShamCash(info.getValue()) || "—"}</span>
        ),
      }),
      helper.accessor("sfPersonalNo", {
        id: "personal_no",
        header: "الرقم الذاتي",
        cell: (info) => <span className="ltr-numbers">{info.getValue() || "—"}</span>,
      }),
      helper.display({
        id: "match",
        header: "المطابقة",
        cell: (info) => (
          <div className="min-w-40 space-y-1">
            {info.row.original.matchedField ? (
              <Badge variant="secondary">
                {STANDARD_FIELD_LABELS[info.row.original.matchedField]}
              </Badge>
            ) : null}
            <p className="text-sm">
              <Highlight
                value={
                  info.row.original.matchedField === "sham_cash"
                    ? formatShamCash(info.row.original.matchedValue) || "—"
                    : info.row.original.matchedValue || "—"
                }
                query={debounced}
                field={info.row.original.matchedField}
              />
            </p>
          </div>
        ),
      }),
      helper.display({
        id: "open_in_new_tab",
        header: () => <span className="sr-only">فتح في علامة تبويب جديدة</span>,
        enableSorting: false,
        cell: (info) => (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-primary"
          >
            <a
              href={`/records/${info.row.original.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="فتح في علامة تبويب جديدة"
              aria-label={`فتح ${info.row.original.sfFullName || "السجل"} في علامة تبويب جديدة`}
              onClick={(event) => event.stopPropagation()}
              onAuxClick={(event) => event.stopPropagation()}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
        ),
      }),
    ],
    [debounced],
  );
  const table = useReactTable({ data: data.rows, columns, getCoreRowModel: getCoreRowModel() });

  function changeSorting(key: SearchSortKey) {
    setSorting((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex rounded-lg bg-muted p-1">
            <button
              type="button"
              className={`flex-1 rounded-md px-4 py-2 text-sm font-bold ${mode === "full" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              onClick={() => {
                setMode("full");
                setPage(1);
              }}
            >
              البحث الكامل
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-4 py-2 text-sm font-bold ${mode === "custom" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              onClick={() => {
                setMode("custom");
                setPage(1);
              }}
            >
              البحث المخصص
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <Label htmlFor="search-query" className="sr-only">
                عبارة البحث
              </Label>
              <Input
                id="search-query"
                className="h-11 pe-10"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="اسم، رقم وطني، هاتف، أو أي معرّف…"
                autoFocus
              />
            </div>
            {mode === "custom" ? (
              <SearchSelect
                label="حقل البحث"
                value={field}
                onChange={(value) => {
                  setField(value as StandardFieldKey);
                  setPage(1);
                }}
              >
                {SEARCH_FIELDS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </SearchSelect>
            ) : null}
            <GroupMultiSelect
              groups={groups}
              value={groupIds}
              onChange={(value) => {
                setGroupIds(value);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : !debounced ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Search className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-3 font-bold">ابدأ بكتابة عبارة البحث</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            يمكنك استخدام الاسم أو الرقم الوطني أو الهاتف أو أي حقل قياسي.
          </p>
        </div>
      ) : data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <h2 className="font-bold">لم نعثر على نتائج مطابقة</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            جرّب كتابة كلمات أقل، أو غيّر نطاق البحث إلى جميع الملفات.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              تم العثور على{" "}
              <strong className="text-foreground">{data.total.toLocaleString("en-US")}</strong>{" "}
              نتيجة
            </p>
            <p className="text-sm text-muted-foreground">
              الصفحة {data.page} من {data.pageCount}
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-muted/70">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={
                          header.column.id === "open_in_new_tab"
                            ? "w-14 p-0 text-right font-bold"
                            : "p-0 text-right font-bold"
                        }
                        aria-sort={
                          header.column.columnDef.enableSorting === false
                            ? undefined
                            : sorting?.key === header.column.id
                              ? sorting.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                        }
                      >
                        {header.isPlaceholder ? null : header.column.columnDef.enableSorting ===
                          false ? (
                          flexRender(header.column.columnDef.header, header.getContext())
                        ) : (
                          <button
                            type="button"
                            className="group flex w-full items-center gap-2 p-3 text-right transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            onClick={() => changeSorting(header.column.id as SearchSortKey)}
                            title={
                              sorting?.key === header.column.id && sorting.direction === "asc"
                                ? "ترتيب تنازلي"
                                : "ترتيب تصاعدي"
                            }
                          >
                            <span>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {sorting?.key === header.column.id ? (
                              sorting.direction === "asc" ? (
                                <ArrowUp
                                  aria-hidden="true"
                                  className="size-4 shrink-0 text-primary"
                                />
                              ) : (
                                <ArrowDown
                                  aria-hidden="true"
                                  className="size-4 shrink-0 text-primary"
                                />
                              )
                            ) : (
                              <ArrowUpDown
                                aria-hidden="true"
                                className="size-4 shrink-0 text-muted-foreground/60 transition group-hover:text-foreground"
                              />
                            )}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    role="link"
                    className="cursor-pointer border-t transition hover:bg-muted/50 focus:bg-muted focus:outline-none"
                    onClick={() => router.push(`/records/${row.original.id}`)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/records/${row.original.id}`);
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={data.page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronRight className="size-4" />
              السابق
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={data.page >= data.pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              التالي
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
