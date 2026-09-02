import { History } from "lucide-react";
import { ACTIVITY_LABELS, relativeArabic } from "@/lib/activity";
import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return <div className="space-y-7"><PageHeader eyebrow="أثر تشغيلي" title="سجل النشاط" description="آخر العمليات التي جرت في النظام، مرتبة من الأحدث إلى الأقدم." />{logs.length === 0 ? <EmptyState title="لا يوجد نشاط مسجل" description="ستظهر هنا عمليات الرفع والتحديث والحذف وإدارة الإعدادات." /> : <Card><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[700px] text-sm"><thead className="bg-muted"><tr><th className="p-4 text-right">العملية</th><th className="p-4 text-right">الهدف</th><th className="p-4 text-right">التاريخ</th><th className="p-4 text-right">الوقت النسبي</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t"><td className="p-4"><Badge variant="secondary" className="gap-1"><History className="size-3" />{ACTIVITY_LABELS[log.action]}</Badge></td><td className="p-4 font-semibold">{log.targetName}</td><td className="p-4 ltr-numbers text-right">{log.createdAt.toISOString().replace("T", " ").slice(0, 16)}</td><td className="p-4 text-muted-foreground">{relativeArabic(log.createdAt)}</td></tr>)}</tbody></table></CardContent></Card>}</div>;
}
