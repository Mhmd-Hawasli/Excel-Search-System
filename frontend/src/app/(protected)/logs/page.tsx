"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { LogsFilter, type LogsFilters } from "@/features/activity/logs-filter";
import {
  ACTIVITY_LABELS,
  VIRTUAL_TARGET_OPTIONS,
  isPersonRecordAction,
  matchesTargetFilter,
  parseEditDetails,
  parseVisitDetails,
  relativeArabic,
  resolveFileName,
  resolveFileVersion,
  type ActivityAction,
} from "@/lib/activity";
import { formatUploadDateTime } from "@/lib/format/date";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { ApiError } from "@/services/api-client";
import { ACTIVITY_PAGE_SIZE, activityService, type ActivityLogItem } from "@/services/activity.service";
import { authService } from "@/services/auth.service";

// Full history port: the backend keeps every activity row (no retention
// cap — the old 500 was a read window only). The page loads the whole
// history via paged listAll, filters client-side, and paginates 100 rows
// per page. Target cells always show the file name + version for
// file-linked events (resolved from fileId for old rows that stored only
// the id); the target filter lists entity/file names plus virtual
// record-kind entries and never individual person names.

const ACTION_KEYS = new Set<string>(Object.keys(ACTIVITY_LABELS));

function toActionKey(action: string): ActivityAction | null {
  const upper = action.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  return ACTION_KEYS.has(upper) ? (upper as ActivityAction) : null;
}

function isFileAction(log: ActivityLogItem): boolean {
  const key = toActionKey(log.action);
  return (
    key === "FILE_UPLOADED" ||
    key === "FILE_UPDATED" ||
    key === "FILE_REPLACED" ||
    key === "FILE_DELETED" ||
    key === "FILE_VERSION_BUMPED"
  );
}

type SortKey = "action" | "target" | "actor" | "details" | "date";

function actionLabel(log: ActivityLogItem): string {
  const key = toActionKey(log.action);
  return key ? ACTIVITY_LABELS[key] : log.action;
}

/** Flat searchable/sortable text for the details column (visits + edits + raw details). */
function detailsText(log: ActivityLogItem): string {
  const key = toActionKey(log.action);
  if (key === "RECORD_VISITED") {
    const visit = parseVisitDetails(log.details);
    if (visit) {
      return [visit.visitorDisplayName, visit.visitorUsername ? `@${visit.visitorUsername}` : "", visit.fileName ?? ""]
        .filter(Boolean)
        .join(" ");
    }
  }
  if (key === "RECORD_EDITED") {
    const edit = parseEditDetails(log.details);
    if (edit) {
      return [
        edit.editedBy ? `@${edit.editedBy}` : "",
        edit.personName ?? "",
        edit.headerRaw ?? "",
        edit.oldValue ?? "",
        edit.newValue ?? "",
      ]
        .filter(Boolean)
        .join(" ");
    }
  }
  return Object.entries(log.details ?? {})
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(([name, value]) => `${name}: ${value}`)
    .join(" ");
}

/** Sortable table columns; date and relative-time share the createdAt key. */
/* Order matters in RTL: first item renders on the far right. Actor first. */
const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "actor", label: "المُعدِّل" },
  { key: "action", label: "الإجراء" },
  { key: "target", label: "الهدف" },
  { key: "details", label: "التفاصيل" },
  { key: "date", label: "التاريخ" },
  { key: "date", label: "الوقت النسبي" },
];

function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="size-4 opacity-50" aria-hidden="true" />;
  return dir === "asc" ? (
    <ArrowUp className="size-4" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-4" aria-hidden="true" />
  );
}

export default function LogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("action") ?? "";
  const activeAction = ACTION_KEYS.has(param) ? param : "";
  const [items, setItems] = useState<ActivityLogItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [canBrowse, setCanBrowse] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState("");
  const [actor, setActor] = useState("");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await authService.me();
        if (!active) return;
        const browse = hasPermission(me?.permissions ?? [], "activity.browse");
        setCanBrowse(browse);
        if (!browse) return;
        // Full history (not just the first window): walk server pages.
        const full = await activityService.listAll(activeAction || undefined);
        if (!active) return;
        setItems(full.items);
        setTotal(full.total);
        setPage(1);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "تعذر تحميل سجل النشاط.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param]);

  function changeAction(next: string) {
    setPage(1);
    router.replace(next ? `/logs?action=${next}` : "/logs", { scroll: false });
  }

  function changeFilters(next: Partial<LogsFilters>) {
    if (next.action !== undefined) {
      changeAction(next.action);
      return;
    }
    setPage(1);
    if (next.person !== undefined) setPerson(next.person);
    if (next.actor !== undefined) setActor(next.actor);
    if (next.query !== undefined) setQuery(next.query);
    if (next.dateFrom !== undefined) setDateFrom(next.dateFrom);
    if (next.dateTo !== undefined) setDateTo(next.dateTo);
  }

  function resetFilters() {
    changeAction("");
    setPerson("");
    setActor("");
    setQuery("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  /** Tri-state header sort: asc → desc → backend order (newest first). */
  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  // Target options exclude individual person names by design: record
  // edits/visits/deletes carry a person per row (thousands of entries).
  // Instead the dropdown offers virtual record-kind entries
  // ("تعديل سجل ضمن أي ملف" …) plus distinct entity names (files, users,
  // groups, categories…) and distinct file names for file-linked rows.
  const personOptions = useMemo(() => {
    if (!items) return VIRTUAL_TARGET_OPTIONS.map((option) => ({ ...option }));
    const names = new Map<string, string>();
    for (const log of items) {
      if (!isPersonRecordAction(log.action) && log.targetName) {
        if (!names.has(log.targetName)) names.set(log.targetName, log.targetName);
      }
      const fileName = resolveFileName(log);
      if (fileName && !names.has(fileName)) names.set(fileName, fileName);
    }
    const sorted = [...names.values()].sort((a, b) => a.localeCompare(b, "ar"));
    return [
      ...VIRTUAL_TARGET_OPTIONS.map((option) => ({ ...option })),
      ...sorted.map((name) => ({ value: name, label: name })),
    ];
  }, [items]);

  // Distinct acting users across all activity events (server-resolved actor).
  const actorOptions = useMemo(() => {
    if (!items) return [];
    const names = new Set<string>();
    for (const log of items) if (log.actor) names.add(log.actor);
    return [...names].sort((a, b) => a.localeCompare(b, "ar"));
  }, [items]);

  // Client-side filter + sort over the FULL history loaded from the backend.
  const filteredItems = useMemo(() => {
    if (!items) return [];
    const needle = query.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    const filtered = items.filter((log) => {
      const created = new Date(log.createdAt);
      if (from && created < from) return false;
      if (to && created > to) return false;
      if (!matchesTargetFilter(log, person)) return false;
      if (actor && log.actor !== actor) return false;
      if (needle) {
        const fileName = resolveFileName(log) ?? "";
        const fileVersion = resolveFileVersion(log);
        const haystack = [
          log.targetName,
          fileName,
          fileVersion != null ? `v${fileVersion} الإصدار ${fileVersion}` : "",
          log.actor ?? "",
          actionLabel(log),
          detailsText(log),
          formatUploadDateTime(created),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let result: number;
      if (sort.key === "date") result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sort.key === "action") result = actionLabel(a).localeCompare(actionLabel(b), "ar");
      else if (sort.key === "target") result = a.targetName.localeCompare(b.targetName, "ar");
      else if (sort.key === "actor") result = (a.actor ?? "").localeCompare(b.actor ?? "", "ar");
      else result = detailsText(a).localeCompare(detailsText(b), "ar");
      return result * factor;
    });
  }, [items, person, actor, query, dateFrom, dateTo, sort]);

  // Client-side pagination: 100 rows per page with navigation.
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ACTIVITY_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * ACTIVITY_PAGE_SIZE;
  const visibleItems = filteredItems.slice(pageStart, pageStart + ACTIVITY_PAGE_SIZE);
  const rangeFrom = filteredItems.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + ACTIVITY_PAGE_SIZE, filteredItems.length);

  // Numbered page window (up to 5 buttons around the current page).
  const pageWindow = useMemo(() => {
    const size = 5;
    let start = Math.max(1, safePage - Math.floor(size / 2));
    const end = Math.min(totalPages, start + size - 1);
    start = Math.max(1, end - size + 1);
    const window: number[] = [];
    for (let p = start; p <= end; p += 1) window.push(p);
    return window;
  }, [safePage, totalPages]);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="أثر تشغيلي"
        title="سجل النشاط"
        description="كل العمليات المحفوظة في النظام، مرتبة من الأحدث إلى الأقدم — بما فيها زيارات صفحات السجلات وتعديلاتها: اسم الشخص واسم الملف وإصداره واسم الحساب الذي نفّذ العملية مع التاريخ."
      />
      {!loading && !canBrowse ? (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          حسابك لا يملك صلاحية الدخول إلى سجل النشاطات.
        </p>
      ) : (
        <>
          <LogsFilter
            filters={{ action: activeAction, person, actor, query, dateFrom, dateTo }}
            persons={personOptions}
            actors={actorOptions}
            onChange={changeFilters}
            onReset={resetFilters}
          />
          {items ? (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              عرض {rangeFrom.toLocaleString("en-US")}–{rangeTo.toLocaleString("en-US")} من{" "}
              {filteredItems.length.toLocaleString("en-US")} عملية (المجموع المحفوظ:{" "}
              {total.toLocaleString("en-US")}) — الصفحة {safePage.toLocaleString("en-US")} من{" "}
              {totalPages.toLocaleString("en-US")}
              {sort
                ? ` — الفرز حسب «${SORTABLE_COLUMNS.find((column) => column.key === sort.key)?.label ?? sort.key}» ${sort.dir === "asc" ? "تصاعدي" : "تنازلي"}`
                : " — مرتبة من الأحدث إلى الأقدم"}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : loading || !items ? (
            <p className="text-sm text-muted-foreground">جارٍ تحميل كامل السجل…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="لا يوجد نشاط مسجل"
              description="ستظهر هنا عمليات الرفع والتحديث والحذف وإدارة الإعدادات وزيارات السجلات."
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              title="لا نتائج مطابقة للفلاتر"
              description="جرّب تغيير نوع العملية أو الهدف أو نطاق التاريخ أو نص البحث، أو أعد تعيين الفلاتر لعرض كل العمليات."
            />
          ) : (
            <>
              <Card>
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {SORTABLE_COLUMNS.map((column, index) => {
                          const active = sort?.key === column.key;
                          const dir = sort?.dir ?? "asc";
                          return (
                            <th
                              key={`${column.key}-${index}`}
                              scope="col"
                              className="p-0 text-right font-bold"
                              aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                            >
                              <button
                                type="button"
                                onClick={() => toggleSort(column.key)}
                                className={cn(
                                  "flex w-full items-center justify-between gap-1 p-4 text-right transition hover:bg-muted",
                                  active && "bg-primary/5 text-primary",
                                )}
                                aria-label={`فرز حسب ${column.label} ${active && dir === "asc" ? "تنازلي" : "تصاعدي"}`}
                              >
                                <span>{column.label}</span>
                                <SortGlyph active={active} dir={dir} />
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((log) => {
                        const key = toActionKey(log.action);
                        const visit = key === "RECORD_VISITED" ? parseVisitDetails(log.details) : null;
                        const edit = key === "RECORD_EDITED" ? parseEditDetails(log.details) : null;
                        const created = new Date(log.createdAt);
                        const fileName = resolveFileName(log);
                        const fileVersion = resolveFileVersion(log);
                        const recordAction = isPersonRecordAction(log.action);
                        const fileEvent = isFileAction(log);
                        return (
                          <tr key={log.id} className="border-t align-top">
                            <td className="p-4">
                              {log.actor ? (
                                <span className="ltr-numbers">
                                  <span className="font-bold text-foreground">{log.actor}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-4">
                              <Badge variant="secondary" className="gap-1">
                                <History className="size-3" />
                                {actionLabel(log)}
                              </Badge>
                            </td>
                            <td className="p-4">
                              {visit?.recordId ? (
                                <Link
                                  href={`/records/${visit.recordId}`}
                                  prefetch={false}
                                  className="font-semibold text-primary hover:underline"
                                >
                                  {log.targetName}
                                </Link>
                              ) : edit?.recordId ? (
                                <Link
                                  href={`/records/${edit.recordId}`}
                                  prefetch={false}
                                  className="font-semibold text-primary hover:underline"
                                >
                                  {edit.personName ?? log.targetName}
                                </Link>
                              ) : (
                                <span className="font-semibold">{log.targetName}</span>
                              )}
                              {recordAction || fileEvent ? (
                                <span className="mt-1 block text-xs font-normal leading-6 text-muted-foreground">
                                  {recordAction ? (
                                    <>
                                      <span className="block">
                                        الملف:{" "}
                                        <span className="font-bold text-foreground">{fileName ?? "ملف محذوف"}</span>
                                      </span>
                                      <span className="block">
                                        الإصدار:{" "}
                                        <span className="font-bold text-foreground">
                                          {fileVersion != null ? `v${fileVersion}` : "—"}
                                        </span>
                                      </span>
                                    </>
                                  ) : (
                                    <span className="block">
                                      الإصدار:{" "}
                                      <span className="font-bold text-foreground">
                                        {fileVersion != null ? `v${fileVersion}` : "—"}
                                      </span>
                                    </span>
                                  )}
                                </span>
                              ) : null}
                            </td>
                            <td className="p-4 text-xs leading-6 text-muted-foreground">
                              {visit ? (
                                <>
                                  <span className="block">
                                    الزائر:{" "}
                                    <span className="font-bold text-foreground">{visit.visitorDisplayName}</span>{" "}
                                    <span className="ltr-numbers">@{visit.visitorUsername}</span>
                                  </span>
                                  {visit.fileName ? <span className="block">الملف: {visit.fileName}</span> : null}
                                </>
                              ) : edit ? (
                                <>
                                  {edit.headerRaw ? (
                                    <span className="block">
                                      الحقل: <span className="font-bold text-foreground">{edit.headerRaw}</span>
                                    </span>
                                  ) : null}
                                  <span className="block">
                                    القيمة:{" "}
                                    <span className="font-bold text-foreground">{edit.oldValue ?? "—"}</span>
                                    {" ← "}
                                    <span className="font-bold text-foreground">{edit.newValue ?? "—"}</span>
                                  </span>
                                  {edit.rowIndex ? (
                                    <span className="block text-right" dir="rtl">صف Excel: <span className="ltr-numbers">{edit.rowIndex}</span></span>
                                  ) : null}
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="p-4 ltr-numbers text-right">{formatUploadDateTime(created)}</td>
                            <td className="p-4 text-muted-foreground">{relativeArabic(created)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              {totalPages > 1 ? (
                <nav aria-label="التنقل بين صفحات السجل" className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                    aria-label="الصفحة السابقة"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                    السابق
                  </Button>
                  {pageWindow[0] > 1 ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => setPage(1)}>
                        1
                      </Button>
                      {pageWindow[0] > 2 ? <span className="text-muted-foreground">…</span> : null}
                    </>
                  ) : null}
                  {pageWindow.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={p === safePage ? "default" : "outline"}
                      size="sm"
                      aria-current={p === safePage ? "page" : undefined}
                      onClick={() => setPage(p)}
                    >
                      {p.toLocaleString("en-US")}
                    </Button>
                  ))}
                  {pageWindow[pageWindow.length - 1] < totalPages ? (
                    <>
                      {pageWindow[pageWindow.length - 1] < totalPages - 1 ? (
                        <span className="text-muted-foreground">…</span>
                      ) : null}
                      <Button type="button" variant="outline" size="sm" onClick={() => setPage(totalPages)}>
                        {totalPages.toLocaleString("en-US")}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(safePage + 1)}
                    aria-label="الصفحة التالية"
                  >
                    التالي
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
