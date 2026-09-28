"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ListOrdered, ScanSearch, TriangleAlert, UsersRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingScreen } from "@/components/loading-screen";
import { PageHeader } from "@/components/page-header";
import { ConflictStats } from "@/features/conflicts/conflict-stats";
import { CONFLICT_CATEGORIES } from "@/lib/conflicts-catalog";
import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import { conflictsService, type ConflictStats as Stats } from "@/services/conflicts.service";
import { useApiQuery } from "@/hooks/use-api-query";

const CATEGORY_STYLE: Record<string, { icon: typeof ScanSearch; highlight?: boolean }> = {
  invalid: { icon: TriangleAlert, highlight: true },
  missing: { icon: ListOrdered },
  similar: { icon: UsersRound },
  conflicting: { icon: ScanSearch },
};

/** احصائيات تضارب البيانات: 4 بطاقات فئات (كالصورة) ثم التفاصيل. الدخول يتطلب stats.view مع conflicts.view. */
export function ConflictsStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: user } = useApiQuery(() => authService.me(), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await conflictsService.stats();
        if (active) setStats(result);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "تعذر تحميل الاحصائيات.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const byCategory = new Map<string, number>();
  for (const rule of stats?.rules ?? []) {
    byCategory.set(rule.category, (byCategory.get(rule.category) ?? 0) + rule.instances);
  }

  if (
    user &&
    (!hasPermission(user.permissions, "stats.view") ||
      !hasPermission(user.permissions, "conflicts.view"))
  ) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="الاحصائيات"
          title="احصائيات تضارب البيانات"
          description="4 فئات رئيسية للاحصائيات — انقر أي بطاقة لفتح سجلاتها في تقرير التضارب."
        />
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          لا تملك صلاحية عرض هذه الصفحة.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="الاحصائيات"
        title="احصائيات تضارب البيانات"
        description="4 فئات رئيسية للاحصائيات — انقر أي بطاقة لفتح سجلاتها في تقرير التضارب."
      />
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      {loading || !stats ? (
        !error ? (
          <LoadingScreen message="جارٍ تحميل احصائيات التضارب…" />
        ) : null
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CONFLICT_CATEGORIES.map((category) => {
              const style = CATEGORY_STYLE[category.key] ?? { icon: ScanSearch };
              const Icon = style.icon;
              const count = byCategory.get(category.key) ?? 0;
              return (
                <Link
                  key={category.key}
                  href={`/conflicts?category=${category.key}`}
                  aria-label={`${category.label} — ${count.toLocaleString("en-US")} — عرض السجلات`}
                >
                  <Card
                    className={cn(
                      "h-full transition hover:border-primary/40 hover:bg-accent/30",
                      style.highlight && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <CardContent className="space-y-1 p-5">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-bold">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="size-5" aria-hidden="true" />
                          </span>
                          {category.label}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-black tabular-nums">
                          {count.toLocaleString("en-US")}
                        </span>
                      </span>
                      <span className="block text-xs leading-6 text-muted-foreground">
                        {category.description}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          <ConflictStats stats={stats} />
        </>
      )}
    </div>
  );
}
