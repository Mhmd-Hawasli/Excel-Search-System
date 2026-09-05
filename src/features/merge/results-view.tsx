"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CircleCheck, CircleX, Download, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import {
  type MergeRow,
  type MergeRuleKey,
  type MergeStatus,
  type RuleStat,
} from "@/lib/merge/types";

export type MergeClientResult = {
  sessionId: string;
  leftHeaders: string[];
  rightHeaders: string[];
  left: MergeRow[];
  right: MergeRow[];
  pairs: Array<{
    key: string;
    rule: MergeRuleKey;
    leftRowNumber: number;
    rightRowNumber: number;
    confirmed: boolean;
    leftValue: string;
    rightValue: string;
  }>;
  rules: RuleStat[];
  status: MergeStatus;
};

const MAX_PAIRS_PER_RULE = 200;

function StatusBanner({ status }: { status: MergeStatus }) {
  const complete = status.state === "complete";
  return (
    <div
      className={`flex flex-wrap items-center gap-4 rounded-xl border p-5 ${
        complete ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"
      }`}
      role="status"
    >
      <span
        className={`grid size-12 shrink-0 place-items-center rounded-xl ${
          complete ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
        }`}
      >
        {complete ? <CircleCheck className="size-6" /> : <TriangleAlert className="size-6" />}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-black">
          {complete ? "حالة دمج كاملة" : `حالة دمج بنسبة ${status.percent}%`}
        </p>
        <p className="text-sm text-muted-foreground">
          {complete
            ? "كل الأسطر في أحد الجدولين أصبحت مرتبطة بمفتاح ربط."
            : `تم إيجاد ${status.matchedPairs.toLocaleString("en-US")} من أصل ${status.total.toLocaleString("en-US")} بعد تطبيق جميع قواعد الربط.`}
        </p>
      </div>
      <div className="ms-auto flex gap-6 text-center">
        <div>
          <p className="text-2xl font-black">{status.matchedPairs.toLocaleString("en-US")}</p>
          <p className="text-xs text-muted-foreground">أزواج مرتبطة</p>
        </div>
        <div>
          <p className="text-2xl font-black">{status.total.toLocaleString("en-US")}</p>
          <p className="text-xs text-muted-foreground">أقصى عدد ممكن</p>
        </div>
      </div>
    </div>
  );
}

function RuleCard({ rule }: { rule: RuleStat }) {
  const [open, setOpen] = useState(false);
  const visible = rule.pairs.slice(0, MAX_PAIRS_PER_RULE);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 py-4">
        <div className="space-y-1">
          <CardTitle className="text-base">{rule.label}</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">{rule.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {rule.available ? (
            <Badge variant={rule.matchedPairs ? "default" : "secondary"}>
              {rule.matchedPairs
                ? `${rule.matchedPairs.toLocaleString("en-US")} حالة`
                : "لم تطابق شيئاً"}
            </Badge>
          ) : (
            <Badge variant="outline">غير متاحة</Badge>
          )}
        </div>
      </CardHeader>
      {rule.reason ? (
        <p className="px-6 pb-4 text-sm text-muted-foreground">{rule.reason}</p>
      ) : null}
      {rule.available && rule.matchedPairs > 0 ? (
        <CardContent className="space-y-2 border-t pt-4">
          {open ? (
            <>
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-2 text-right">المفتاح</th>
                      <th className="p-2 text-right">الجدول الأول</th>
                      <th className="p-2 text-right">الجدول الثاني</th>
                      <th className="p-2 text-right">القيمة</th>
                      <th className="p-2 text-right">التأكد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((pair) => (
                      <tr key={pair.key} className="border-t">
                        <td className="p-2 ltr-numbers font-mono">{pair.key}</td>
                        <td className="p-2 ltr-numbers">صف {pair.leftRowNumber}</td>
                        <td className="p-2 ltr-numbers">صف {pair.rightRowNumber}</td>
                        <td className="max-w-64 truncate p-2" dir="rtl">
                          {pair.leftValue || pair.rightValue || "—"}
                        </td>
                        <td className="p-2">
                          {pair.confirmed ? (
                            <Badge variant="secondary">مؤكد</Badge>
                          ) : (
                            <Badge variant="outline">بدون تأكد</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rule.pairs.length > MAX_PAIRS_PER_RULE ? (
                <p className="text-xs text-muted-foreground">
                  تُعرض أول {MAX_PAIRS_PER_RULE} حالة من {rule.pairs.length.toLocaleString("en-US")}{" "}
                  — الحالات الكاملة متوفرة في ملف Excel المصدَّر.
                </p>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                إخفاء الحالات
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              عرض الحالات ({rule.matchedPairs.toLocaleString("en-US")})
            </Button>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function ResultsView({
  result,
  onReset,
}: {
  result: MergeClientResult;
  onReset: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function downloadExport() {
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch(`/api/merge/export?sessionId=${result.sessionId}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "تعذر تصدير الملف.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `دمج-الملفات-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "تعذر تصدير الملف.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusBanner status={result.status} />
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={() => void downloadExport()} disabled={exporting}>
            {exporting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {exporting ? `جارٍ تصدير الملف…` : "تصدير ملف Excel"}
          </Button>
          <Button variant="outline" onClick={onReset}>
            <RotateCcw className="size-4" />
            دمج جديد
          </Button>
        </div>
      </div>
      {exportError ? <p className="text-sm text-destructive">{exportError}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ملخص الدمج">
        {[
          {
            label: "صفوف الجدول الأول",
            value: result.left.length,
            matched: result.left.filter((row) => row.key).length,
          },
          {
            label: "صفوف الجدول الثاني",
            value: result.right.length,
            matched: result.right.filter((row) => row.key).length,
          },
          { label: "أزواج مرتبطة", value: result.pairs.length, matched: null },
          {
            label: "تطابق مُؤكَّد",
            value: result.pairs.filter((pair) => pair.confirmed).length,
            matched: null,
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-3xl font-black">
                {item.value.toLocaleString("en-US")}
                {item.matched !== null && item.value > 0 ? (
                  <span className="ms-2 text-sm font-normal text-muted-foreground">
                    ({item.matched.toLocaleString("en-US")} مربوط)
                  </span>
                ) : null}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-4" aria-label="قواعد الربط">
        <h2 className="text-lg font-black">الحالات الموجودة في كل قاعدة</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {result.rules.map((rule) => (
            <RuleCard key={rule.key} rule={rule} />
          ))}
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <CircleX className="mt-0.5 size-4 shrink-0" />
        <p>
          نتائج الدمج مؤقتة وتختفي عند إغلاق الصفحة أو إعادة تشغيل الخادم. صدّر ملف Excel
          للاحتفاظ بالنتيجة الكاملة.
        </p>
      </div>
    </div>
  );
}
