"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, FunnelX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingScreen } from "@/components/loading-screen";
import { useApiQuery } from "@/hooks/use-api-query";
import { filesService } from "@/services/files.service";

const labels: Record<string, string> = {
  MISSING_NATIONAL_ID: "رقم وطني مفقود",
  INVALID_NATIONAL_ID: "مشكلة تكامل: رقم وطني غير صالح",
  DUPLICATE_NATIONAL_ID: "رقم وطني مكرر",
  INVALID_PHONE: "رقم هاتف غير صالح",
  INVALID_SHAM_CASH: "رقم شام كاش غير صالح",
  DUPLICATE_SHAM_CASH: "الشام كاش مكرر داخل الملف",
  DUPLICATE_FULL_NAME_MOTHER: "الاسم الثلاثي مع اسم الأم مكرر داخل الملف",
  INVALID_FUNCTIONAL_CATEGORY: "فئة وظيفية غير معروفة",
  EMPTY_ROW: "صف فارغ",
};

export function FileQuality({ groupId, fileId }: { groupId: string; fileId: string }) {
  const { data, loading, error } = useApiQuery(() => filesService.quality(fileId, groupId), [fileId, groupId]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const filteredIssues = useMemo(() => {
    if (!data) return [];
    if (!activeFilter) return data.issues;
    return data.issues.filter((issue) => issue.issueType === activeFilter);
  }, [data, activeFilter]);

  function toggleFilter(issueType: string) {
    setActiveFilter((current) => (current === issueType ? null : issueType));
  }

  if (loading && !data) {
    return <LoadingScreen message="جارٍ تحميل تقرير الجودة…" />;
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
  if (!data) return <p role="alert" className="text-sm text-destructive">تعذر تحميل تقرير الجودة.</p>;

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
        {data.counts.map(({ issueType, count }) => {
          const active = activeFilter === issueType;
          return (
            <Card
              key={issueType}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`فلترة حسب: ${labels[issueType] ?? issueType}`}
              title="اضغط للفلترة على هذا النوع"
              onClick={() => toggleFilter(issueType)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleFilter(issueType);
                }
              }}
              className={`cursor-pointer transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary ${
                active ? "border-primary bg-primary/10 ring-2 ring-primary/40" : ""
              }`}
            >
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{labels[issueType] ?? issueType}</p>
                <p className="mt-2 text-2xl font-black">{count.toLocaleString("en-US")}</p>
                {active ? (
                  <p className="mt-1 text-xs font-bold text-primary">مفعّل — اضغط مجددًا للإلغاء</p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {data.issues.length === 0 ? (
        <div className="rounded-xl border bg-primary/5 p-8 text-center">
          <CircleCheck className="mx-auto size-10 text-primary" />
          <h2 className="mt-3 font-bold">لم تُكتشف مشكلات جودة</h2>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="ms-auto">تفاصيل المشكلات</CardTitle>
              {activeFilter ? (
                <>
                  <Badge className="bg-primary/15 text-primary">
                    {labels[activeFilter] ?? activeFilter} — {filteredIssues.length.toLocaleString("en-US")} من{" "}
                    {data.issues.length.toLocaleString("en-US")}
                  </Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => setActiveFilter(null)}>
                    <FunnelX className="size-4" />
                    إلغاء الفلتر
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  اضغط على أي مربع أعلاه للفلترة حسب النوع ({data.issues.length.toLocaleString("en-US")} مشكلة)
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {filteredIssues.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                لا توجد مشكلات من نوع «{labels[activeFilter ?? ""] ?? activeFilter}».
              </p>
            ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-right">pk</th>
                  <th className="p-3 text-right">النوع</th>
                  <th className="p-3 text-right">العمود</th>
                  <th className="p-3 text-right">القيمة الأصلية</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue, index) => (
                  <tr key={`${issue.rowIndex}-${issue.issueType}-${index}`} className="border-t">
                    <td className="p-3 text-right"><span className="ltr-numbers inline-block">{(issue.pk ?? issue.rowIndex).toLocaleString("en-US")}</span></td>
                    <td className="p-3">
                      <Badge variant="outline">{labels[issue.issueType] ?? issue.issueType}</Badge>
                    </td>
                    <td className="p-3">{issue.columnName ?? "—"}</td>
                    <td className="p-3 ltr-numbers text-right">{issue.rawValue || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
