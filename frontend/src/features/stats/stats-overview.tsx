"use client";

import Link from "next/link";
import { FileSpreadsheet, PencilLine, ScanSearch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { canBrowseGroups, hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";

const PARTS = [
  {
    href: "/stats/conflicts",
    title: "احصائيات تضارب البيانات",
    description: "بيانات خاطئة وناقصة وتشابه أسماء وتضارب — انقر لفتح التفاصيل",
    icon: ScanSearch,
    permission: "conflicts.view",
  },
  {
    href: "/stats/edits",
    title: "احصائيات تعديل السجلات",
    description: "الملفات المعدلة وعدد التعديلات وآخر تعديل — انقر لفتح التفاصيل",
    icon: PencilLine,
    permission: "edits.view",
  },
  {
    href: "/stats/files",
    title: "احصائيات الملفات",
    description: "المجموعات والملفات والسجلات — انقر لفتح التفاصيل",
    icon: FileSpreadsheet,
    permission: "groups.browse",
  },
];

/** قسم الاحصائيات: كل بطاقة تفتح احصائية جديدة. الدخول يتطلب stats.view،
 * وكل بطاقة تظهر حسب صلاحية بياناتها الخاصة. */
export function StatsOverview() {
  const { data: user } = useApiQuery(() => authService.me(), []);
  const permissions = user?.permissions ?? [];
  const canViewStats = !user || hasPermission(permissions, "stats.view");
  const visible = PARTS.filter(({ permission }) =>
    permission === "groups.browse"
      ? canBrowseGroups(permissions)
      : hasPermission(permissions, permission),
  );
  if (user && !canViewStats) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="مساحة العمل"
          title="الاحصائيات"
          description="اختر جزءًا لفتح احصائيته التفصيلية."
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
        eyebrow="مساحة العمل"
        title="الاحصائيات"
        description="اختر جزءًا لفتح احصائيته التفصيلية."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(user ? visible : PARTS).map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} aria-label={title}>
            <Card className="h-full transition hover:border-primary/40 hover:bg-accent/30">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-base font-bold">{title}</span>
                  <span className="mt-1 block text-xs leading-6 text-muted-foreground">
                    {description}
                  </span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
