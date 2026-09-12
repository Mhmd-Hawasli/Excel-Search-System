"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ConflictFilters } from "@/features/conflicts/conflict-filters";
import { ConflictResults } from "@/features/conflicts/conflict-results";
import { ConflictStats } from "@/features/conflicts/conflict-stats";
import { authService } from "@/services/auth.service";
import { conflictsService, type ConflictsResult, type ConflictStats as Stats } from "@/services/conflicts.service";
import type { CurrentUser } from "@/types/model";

const DEFAULTS = {
  category: "invalid",
  field: "all",
  rule: "all",
  page: 1,
  pageSize: 25,
  sortBy: "issueNumber",
  sortDir: "asc",
};

function readInitial(): typeof DEFAULTS {
  if (typeof window === "undefined") return { ...DEFAULTS };
  const params = new URLSearchParams(window.location.search);
  const num = (key: string, fallback: number) => {
    const raw = Number(params.get(key));
    return Number.isInteger(raw) && raw > 0 ? raw : fallback;
  };
  const pick = (key: string, allowed: string[], fallback: string) => {
    const raw = params.get(key) ?? fallback;
    return allowed.includes(raw) ? raw : fallback;
  };
  return {
    category: pick("category", ["invalid", "missing", "similar", "conflicting"], DEFAULTS.category),
    field: params.get("field") || DEFAULTS.field,
    rule: params.get("rule") || DEFAULTS.rule,
    page: num("page", 1),
    pageSize: [10, 25, 50, 100].includes(num("pageSize", 25)) ? num("pageSize", 25) : 25,
    sortBy: params.get("sortBy") || DEFAULTS.sortBy,
    sortDir: pick("sortDir", ["asc", "desc"], DEFAULTS.sortDir),
  };
}

function hasGlobal(me: CurrentUser | null, key: string): boolean {
  return !!me?.permissions.some((p) => p.permission === key && !p.groupId && !p.fileId);
}

function ResultsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <p className="text-sm text-muted-foreground">
        جارٍ فحص السجلات… يشمل الفحص جميع الملفات المكتملة في الأرشيف
      </p>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

/**
 * Conflicts review page: filter cards, statistics, grouped results table
 * with ignore controls, paging and a permission-gated export link.
 */
export function ConflictReport() {
  const [state, setState] = useState(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<ConflictsResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Intentional URL→state hydration on mount (same pattern as use-api-query).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readInitial());
    setHydrated(true);
    void authService.me().then(setMe);
  }, []);

  // Back/forward restores the filter state from the URL.
  useEffect(() => {
    const onPop = () => setState(readInitial());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const canEdit = hasGlobal(me, "conflicts.filters");
  const canExport = hasGlobal(me, "export.run");

  const effective = useMemo(
    () =>
      canEdit || !hydrated
        ? state
        : { ...state, category: "invalid", field: "all", rule: "all" },
    [canEdit, hydrated, state],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, summary] = await Promise.all([
        conflictsService.list(effective),
        conflictsService.stats(),
      ]);
      setData(list);
      setStats(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل التقرير.");
    } finally {
      setLoading(false);
    }
  }, [effective]);

  useEffect(() => {
    // Intentional reload on hydrated filter change (same pattern as use-api-query).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hydrated) void load();
  }, [hydrated, load]);

  function push(next: typeof DEFAULTS) {
    setState(next);
    const params = new URLSearchParams({
      category: next.category,
      field: next.field,
      rule: next.rule,
      page: String(next.page),
      pageSize: String(next.pageSize),
      sortBy: next.sortBy,
      sortDir: next.sortDir,
    });
    window.history.pushState(null, "", `/conflicts?${params.toString()}`);
  }

  const exportParams = {
    category: effective.category,
    field: effective.field,
    rule: effective.rule,
    sortBy: effective.sortBy,
    sortDir: effective.sortDir,
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="مراجعة جودة الأرشيف"
        title="تضارب البيانات"
        description="راجع البيانات الخاطئة والناقصة وتشابه الأسماء والتضارب بين سجلات جميع الملفات، مع توضيح المشكلة في كل سجل."
        actions={
          canExport ? (
            <Button asChild variant="outline">
              <a href={conflictsService.exportUrl(exportParams)}>
                <Download className="size-4" />
                تصدير Excel للحالة الحالية
              </a>
            </Button>
          ) : undefined
        }
      />
      {stats ? <ConflictStats stats={stats} /> : null}
      <ConflictFilters
        value={{ category: state.category, field: state.field, rule: state.rule, pageSize: state.pageSize }}
        onChange={(next, resetPage) =>
          push({ ...state, ...next, page: resetPage ? 1 : state.page })
        }
        onRefresh={() => void load()}
        refreshing={loading}
        canEdit={canEdit}
        counts={
          stats
            ? Object.fromEntries(
                stats.rules.reduce(
                  (acc, r) => {
                    acc.set(r.category, (acc.get(r.category) ?? 0) + r.instances);
                    return acc;
                  },
                  new Map<string, number>(),
                ),
              )
            : undefined
        }
      />
      {!canEdit && hydrated ? (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          عرض افتراضي: الحقول غير الصالحة في جميع الحقول.
        </p>
      ) : null}
      <section aria-label="نتائج تضارب البيانات" className="space-y-3">
        <h2 className="text-lg font-bold">السجلات المطابقة</h2>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : loading || !data ? (
          <ResultsSkeleton />
        ) : (
          <ConflictResults
            data={data}
            sortBy={state.sortBy}
            sortDir={state.sortDir}
            onSort={(key) =>
              push({
                ...state,
                sortBy: key,
                sortDir: state.sortBy === key && state.sortDir === "asc" ? "desc" : "asc",
                page: 1,
              })
            }
            page={state.page}
            pageSize={state.pageSize}
            onPage={(page) => push({ ...state, page })}
            canIgnore={canEdit}
            onChanged={() => void load()}
          />
        )}
      </section>
    </div>
  );
}
