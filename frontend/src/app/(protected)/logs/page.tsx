"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { LogsFilter } from "@/features/activity/logs-filter";
import { ACTIVITY_LABELS, parseVisitDetails, relativeArabic, type ActivityAction } from "@/lib/activity";
import { formatUploadDateTime } from "@/lib/format/date";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/services/api-client";
import { activityService, type ActivityLogItem } from "@/services/activity.service";
import { authService } from "@/services/auth.service";

// Full UI-19 port (P6.5): exact action selector with URL behavior, newest 500
// ordered from the backend, action badges, visit details with record links,
// relative Arabic time, activity.view page gate with the browse notice, and
// empty/filtered-empty/failure/loading states.

const ACTION_KEYS = new Set<string>(Object.keys(ACTIVITY_LABELS));

function toActionKey(action: string): ActivityAction | null {
  const upper = action.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  return ACTION_KEYS.has(upper) ? (upper as ActivityAction) : null;
}

export default function LogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("action") ?? "";
  const activeAction = ACTION_KEYS.has(param) ? param : "";
  const [items, setItems] = useState<ActivityLogItem[] | null>(null);
  const [canBrowse, setCanBrowse] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await authService.me();
        if (!active) return;
        const browse = hasPermission(me?.permissions ?? [], "activity.browse");
        setCanBrowse(browse);
        if (!browse) return;
        const page = await activityService.list(activeAction || undefined);
        if (active) setItems(page.items);
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
    router.replace(next ? `/logs?action=${next}` : "/logs", { scroll: false });
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="أثر تشغيلي"
        title="سجل النشاط"
        description="آخر العمليات التي جرت في النظام، مرتبة من الأحدث إلى الأقدم — بما فيها زيارات صفحات السجلات: اسم العامل الذي زيرت صفحته واسم الحساب الزائر مع التاريخ."
      />
      {!loading && !canBrowse ? (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          حسابك لا يملك صلاحية الدخول إلى سجل النشاطات.
        </p>
      ) : (
        <>
          <LogsFilter action={activeAction} onChange={changeAction} />
          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : loading || !items ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="لا يوجد نشاط مسجل"
              description="ستظهر هنا عمليات الرفع والتحديث والحذف وإدارة الإعدادات وزيارات السجلات."
            />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-4 text-right">الإجراء</th>
                      <th className="p-4 text-right">الهدف</th>
                      <th className="p-4 text-right">التفاصيل</th>
                      <th className="p-4 text-right">التاريخ</th>
                      <th className="p-4 text-right">الوقت النسبي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((log) => {
                      const key = toActionKey(log.action);
                      const visit = key === "RECORD_VISITED" ? parseVisitDetails(log.details) : null;
                      const created = new Date(log.createdAt);
                      return (
                        <tr key={log.id} className="border-t align-top">
                          <td className="p-4">
                            <Badge variant="secondary" className="gap-1">
                              <History className="size-3" />
                              {key ? ACTIVITY_LABELS[key] : log.action}
                            </Badge>
                          </td>
                          <td className="p-4 font-semibold">
                            {visit?.recordId ? (
                              <Link
                                href={`/records/${visit.recordId}`}
                                prefetch={false}
                                className="text-primary hover:underline"
                              >
                                {log.targetName}
                              </Link>
                            ) : (
                              log.targetName
                            )}
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
          )}
        </>
      )}
    </div>
  );
}
