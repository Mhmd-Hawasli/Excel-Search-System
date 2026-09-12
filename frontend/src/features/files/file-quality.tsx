"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { filesService } from "@/services/files.service";

const labels: Record<string, string> = {
  MISSING_NATIONAL_ID: "رقم وطني مفقود",
  INVALID_NATIONAL_ID: "مشكلة تكامل: رقم وطني غير صالح",
  DUPLICATE_NATIONAL_ID: "رقم وطني مكرر",
  INVALID_PHONE: "رقم هاتف غير صالح",
  INVALID_SHAM_CASH: "رقم شام كاش غير صالح",
  INVALID_FUNCTIONAL_CATEGORY: "فئة وظيفية غير معروفة",
  EMPTY_ROW: "صف فارغ",
};

export function FileQuality({ groupId, fileId }: { groupId: string; fileId: string }) {
  const { data, loading, error } = useApiQuery(() => filesService.quality(fileId, groupId), [fileId, groupId]);

  if (loading || !data) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-7">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/groups/${groupId}`}>
            <ArrowRight className="size-4" />
            العودة إلى المجموعة
          </Link>
        </Button>
        <p role="alert" className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/groups/${groupId}`}>
          <ArrowRight className="size-4" />
          العودة إلى المجموعة
        </Link>
      </Button>
      <PageHeader
        eyebrow="تقرير دائم"
        title={`جودة بيانات ${data.name}`}
        description={`استُورد ${data.rowCount.toLocaleString("en-US")} سجل. الرقم الوطني الصحيح يتكون من 9 إلى 11 رقماً قبل تعبئة أصفار العرض. يُعد وجود محارف أو رقم من 8 أرقام أو أقل أو 12 رقماً أو أكثر مشكلة تكامل. القيم الأصلية محفوظة أدناه لتوضيح الخطأ.`}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {data.counts.map(({ issueType, count }) => (
          <Card key={issueType}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{labels[issueType] ?? issueType}</p>
              <p className="mt-2 text-2xl font-black">{count.toLocaleString("en-US")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {data.issues.length === 0 ? (
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
                {data.issues.map((issue, index) => (
                  <tr key={`${issue.rowIndex}-${issue.issueType}-${index}`} className="border-t">
                    <td className="p-3">{issue.rowIndex}</td>
                    <td className="p-3">
                      <Badge variant="outline">{labels[issue.issueType] ?? issue.issueType}</Badge>
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
