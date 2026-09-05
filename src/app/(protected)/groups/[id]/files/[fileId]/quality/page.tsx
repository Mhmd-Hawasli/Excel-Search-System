import Link from "next/link";
import { DataQualityIssueType } from "@/generated/prisma/client";
import { ArrowRight, CircleCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
const labels: Record<DataQualityIssueType, string> = {
  MISSING_NATIONAL_ID: "رقم وطني مفقود",
  INVALID_NATIONAL_ID: "مشكلة تكامل: رقم وطني غير صالح",
  DUPLICATE_NATIONAL_ID: "رقم وطني مكرر",
  INVALID_PHONE: "رقم هاتف غير صالح",
  INVALID_SHAM_CASH: "رقم شام كاش غير صالح",
  INVALID_FUNCTIONAL_CATEGORY: "فئة وظيفية غير معروفة",
  EMPTY_ROW: "صف فارغ",
};

export default async function QualityPage({
  params,
}: {
  params: Promise<{ id: string; fileId: string }>;
}) {
  const { id, fileId } = await params;
  const file = await prisma.file.findFirst({
    where: { id: fileId, groupId: id },
    include: { dataQualityIssues: { orderBy: { rowIndex: "asc" } } },
  });
  if (!file) notFound();
  const counts = Object.values(DataQualityIssueType).map((type) => ({
    type,
    count: file.dataQualityIssues.filter((issue) => issue.issueType === type).length,
  }));
  return (
    <div className="space-y-7">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/groups/${id}`}>
          <ArrowRight className="size-4" />
          العودة إلى المجموعة
        </Link>
      </Button>
      <PageHeader
        eyebrow="تقرير دائم"
        title={`جودة بيانات ${file.name}`}
        description={`استُورد ${file.rowCount.toLocaleString("en-US")} سجل. الرقم الوطني الصحيح يتكون من 9 إلى 11 رقماً قبل تعبئة أصفار العرض. يُعد وجود محارف أو رقم من 8 أرقام أو أقل أو 12 رقماً أو أكثر مشكلة تكامل. القيم الأصلية محفوظة أدناه لتوضيح الخطأ.`}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {counts.map(({ type, count }) => (
          <Card key={type}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{labels[type]}</p>
              <p className="mt-2 text-2xl font-black">{count.toLocaleString("en-US")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {file.dataQualityIssues.length === 0 ? (
        <div className="rounded-xl border bg-primary/5 p-8 text-center">
          <CircleCheck className="mx-auto size-10 text-primary" />
          <h2 className="mt-3 font-bold">لم تُكتشف مشكلات جودة</h2>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>تفاصيل المشكلات</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-right">الصف</th>
                  <th className="p-3 text-right">النوع</th>
                  <th className="p-3 text-right">العمود</th>
                  <th className="p-3 text-right">القيمة الأصلية</th>
                </tr>
              </thead>
              <tbody>
                {file.dataQualityIssues.map((issue) => (
                  <tr key={issue.id} className="border-t">
                    <td className="p-3">{issue.rowIndex}</td>
                    <td className="p-3">
                      <Badge variant="outline">{labels[issue.issueType]}</Badge>
                    </td>
                    <td className="p-3">{issue.columnName ?? "—"}</td>
                    <td className="p-3 ltr-numbers text-right">{issue.rawValue || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
