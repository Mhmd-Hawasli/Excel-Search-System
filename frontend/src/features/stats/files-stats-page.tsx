"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileSpreadsheet, FolderKanban, Rows3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingScreen } from "@/components/loading-screen";
import { PageHeader } from "@/components/page-header";
import { ApiError } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import { dashboardService } from "@/services/dashboard.service";
import { groupsService } from "@/services/groups.service";
import { useApiQuery } from "@/hooks/use-api-query";
import { hasPermission } from "@/lib/permissions";
import type { DashboardData, Group } from "@/types/model";

/** احصائيات الملفات: إجماليات + كل مجموعة تفتح تفاصيلها. الدخول يتطلب stats.view. */
export function FilesStatsPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: user } = useApiQuery(() => authService.me(), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [data, list] = await Promise.all([dashboardService.get(), groupsService.list()]);
        if (!active) return;
        setDashboard(data);
        setGroups(list);
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

  const totals = [
    { icon: FolderKanban, label: "المجموعات", value: dashboard?.groupCount ?? 0 },
    { icon: FileSpreadsheet, label: "الملفات", value: dashboard?.fileCount ?? 0 },
    { icon: Rows3, label: "السجلات", value: dashboard?.recordCount ?? 0 },
  ];

  if (user && !hasPermission(user.permissions, "stats.view")) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="الاحصائيات"
          title="احصائيات الملفات"
          description="انقر أي مجموعة لفتح ملفاتها وتفاصيلها."
        />
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          لا تملك صلاحية عرض قسم الاحصائيات.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="الاحصائيات"
        title="احصائيات الملفات"
        description="انقر أي مجموعة لفتح ملفاتها وتفاصيلها."
      />
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      {loading || !dashboard ? (
        !error ? (
          <LoadingScreen message="جارٍ تحميل احصائيات الملفات…" />
        ) : null
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {totals.map(({ icon: Icon, label, value }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-2xl font-black tabular-nums">
                      {value.toLocaleString("en-US")}
                    </span>
                    <span className="block text-xs text-muted-foreground">{label}</span>
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-3">
            {groups.map((group) => (
              <Link key={group.id} href={`/groups/${group.id}`} aria-label={`${group.name} — عرض المجموعة`}>
                <Card className="transition hover:border-primary/40 hover:bg-accent/30">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-primary">{group.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {group.fileCount.toLocaleString("en-US")} ملف •{" "}
                        {group.recordCount.toLocaleString("en-US")} سجل
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-bold">
                      عرض المجموعة
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
