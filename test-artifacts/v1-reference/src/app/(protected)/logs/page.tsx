import Link from "next/link";
import { History } from "lucide-react";
import { ACTIVITY_LABELS, parseVisitDetails, relativeArabic } from "@/lib/activity";
import { getSessionUser, hasPermission, requirePagePermission } from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";
import { ActivityAction } from "@/generated/prisma/client";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LogsFilter } from "@/features/activity/logs-filter";
import { formatUploadDateTime } from "@/lib/format/date";

export const dynamic = "force-dynamic";

const ACTION_KEYS = new Set<string>(Object.keys(ACTIVITY_LABELS));

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  await requirePagePermission("activity.view");
  const actor = await getSessionUser();
  const canBrowse = actor ? hasPermission(actor, "activity.browse") : false;
  const { action } = await searchParams;
  const activeAction = action && ACTION_KEYS.has(action) ? (action as ActivityAction) : null;
  const logs = canBrowse
    ? await prisma.activityLog.findMany({
        where: activeAction ? { action: activeAction } : undefined,
        orderBy: { createdAt: "desc" },
        take: 500,
      })
    : [];
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="أثر تشغيلي"
        title="سجل النشاط"
        description="آخر العمليات التي جرت في النظام، مرتبة من الأحدث إلى الأقدم — بما فيها زيارات صفحات السجلات: اسم العامل الذي زيرت صفحته واسم الحساب الزائر مع التاريخ."
      />
      {!canBrowse ? (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          حسابك لا يملك صلاحية الدخول إلى سجل النشاطات.
        </p>
      ) : (
        <>
          <LogsFilter action={activeAction ?? ""} />
          {logs.length === 0 ? (
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
                      <th className="p-4 text-right">العملية</th>
                      <th className="p-4 text-right">الهدف</th>
                      <th className="p-4 text-right">التفاصيل</th>
                      <th className="p-4 text-right">التاريخ</th>
                      <th className="p-4 text-right">الوقت النسبي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const visit =
                        log.action === ActivityAction.RECORD_VISITED
                          ? parseVisitDetails(log.details)
                          : null;
                      return (
                        <tr key={log.id} className="border-t align-top">
                          <td className="p-4">
                            <Badge variant="secondary" className="gap-1">
                              <History className="size-3" />
                              {ACTIVITY_LABELS[log.action]}
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
                                  <span className="font-bold text-foreground">
                                    {visit.visitorDisplayName}
                                  </span>{" "}
                                  <span className="ltr-numbers">@{visit.visitorUsername}</span>
                                </span>
                                {visit.fileName ? (
                                  <span className="block">الملف: {visit.fileName}</span>
                                ) : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-4 ltr-numbers text-right">
                            {formatUploadDateTime(log.createdAt)}
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {relativeArabic(log.createdAt)}
                          </td>
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
