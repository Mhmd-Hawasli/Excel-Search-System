"use client";

import { useState } from "react";
import {
  CircleCheck,
  CircleX,
  Download,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  downloadPreparedExport,
  postNdJson,
  type ExportReady,
} from "@/components/sheet-merge/client";
import type { SheetMergeResult, SheetMergeSheetStat } from "@/lib/sheet-merge/types";

/** عدد الأسطر غير المرتبطة المعروضة في الواجهة لكل صفحة. */
const MAX_ROWS_SHOWN = 50;

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-black ltr-numbers">
          {typeof value === "number" ? value.toLocaleString("en-US") : value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function UnlinkedRows({ stat, idColumn }: { stat: SheetMergeSheetStat; idColumn: number }) {
  const shown = stat.unlinked.slice(0, MAX_ROWS_SHOWN);
  return (
    <div className="space-y-2">
      <div className="max-h-80 overflow-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="whitespace-nowrap p-2 text-right">رقم الصف</th>
              <th className="whitespace-nowrap p-2 text-right">الرقم الوطني</th>
              <th className="whitespace-nowrap p-2 text-right">سبب التعذر</th>
              {stat.unlinkedHeaders.map((header, index) => (
                <th
                  key={`${header}-${index}`}
                  className={`whitespace-nowrap p-2 text-right ${
                    index === idColumn ? "bg-amber-500/15" : ""
                  }`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.rowNumber} className="border-t align-top">
                <td className="whitespace-nowrap p-2 ltr-numbers">{row.rowNumber}</td>
                <td className="whitespace-nowrap p-2 font-mono ltr-numbers">{row.value || "—"}</td>
                <td className="max-w-56 p-2 text-muted-foreground">{row.reason}</td>
                {row.cells.map((cell, index) => (
                  <td
                    key={index}
                    className={`max-w-40 truncate p-2 ${
                      index === idColumn ? "bg-amber-500/10 font-semibold" : ""
                    }`}
                  >
                    {cell || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stat.unlinkedTotal > shown.length ? (
        <p className="text-xs text-muted-foreground">
          تُعرض أول {shown.length.toLocaleString("en-US")} حالة من{" "}
          {stat.unlinkedTotal.toLocaleString("en-US")} — بقية الحالات موجودة في صفحات «غير مرتبط»
          داخل ملف Excel المصدَّر.
        </p>
      ) : null}
    </div>
  );
}

function SheetStatCard({ stat, idColumn }: { stat: SheetMergeSheetStat; idColumn: number }) {
  const [open, setOpen] = useState(false);
  const complete = stat.percent >= 100;
  const facts = [
    { label: "عدد الأسطر", value: stat.rowCount },
    {
      label: stat.role === "main" ? "مرتبطة بصفحة واحدة على الأقل" : "أسطر مرتبطة",
      value: stat.linkedCount,
    },
    { label: "أرقام وطنية صالحة", value: stat.validKeyCount },
    { label: "قيم غير صالحة", value: stat.invalidCount },
    { label: "أرقام مكررة", value: stat.duplicateCount },
    ...(stat.role === "linked"
      ? [{ label: "غير موجودة في الرئيسية", value: stat.missingCount }]
      : []),
  ];
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-bold">{stat.sheetName}</h3>
            <Badge variant={stat.role === "main" ? "default" : "secondary"}>
              {stat.role === "main" ? "الصفحة الرئيسية" : "صفحة مدموجة"}
            </Badge>
            {stat.headers.length ? (
              <span className="text-xs text-muted-foreground ltr-numbers">
                {stat.headers.length} عمود في التصدير
              </span>
            ) : null}
          </div>
          <span
            className={`text-lg font-black ltr-numbers ${
              complete
                ? "text-emerald-600"
                : stat.percent > 0
                  ? "text-amber-600"
                  : "text-destructive"
            }`}
          >
            {stat.percent}%
          </span>
        </div>
        <Progress value={stat.percent} aria-label={`نسبة الربط في الصفحة ${stat.sheetName}`} />
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 text-xl font-black ltr-numbers">
                {fact.value.toLocaleString("en-US")}
              </dd>
            </div>
          ))}
        </dl>
        {stat.unlinkedTotal ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-500">
                <TriangleAlert className="size-4" />
                {stat.unlinkedTotal.toLocaleString("en-US")} سطر تعذر ربطه
              </p>
              <Button variant="outline" size="sm" onClick={() => setOpen((current) => !current)}>
                {open
                  ? "إخفاء القيم"
                  : `عرض القيم (${Math.min(stat.unlinkedTotal, stat.unlinked.length).toLocaleString("en-US")})`}
              </Button>
            </div>
            {open ? <UnlinkedRows stat={stat} idColumn={idColumn} /> : null}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-500">
            <CircleCheck className="size-4" />
            كل أسطر هذه الصفحة تم ربطها.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SheetMergeResults({
  result,
  onReset,
}: {
  result: SheetMergeResult;
  onReset: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportDetail, setExportDetail] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const unlinkedTotal = result.sheets.reduce((sum, sheet) => sum + sheet.unlinkedTotal, 0);
  const complete = result.linkPercent >= 100;

  async function exportFile() {
    setExporting(true);
    setExportError(null);
    setExportProgress(0);
    setExportDetail("تجهيز ملف Excel…");
    try {
      const ready = await postNdJson<ExportReady>(
        "/api/sheet-merge/export",
        { sessionId: result.sessionId },
        (percent, detail) => {
          setExportProgress(Math.min(60, percent));
          if (detail) setExportDetail(detail);
        },
      );
      setExportDetail(`جارٍ تنزيل ${ready.filename}…`);
      await downloadPreparedExport(ready.downloadId, ready.filename, (percent) =>
        setExportProgress(60 + Math.round(percent * 0.4)),
      );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "تعذر تصدير الملف.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className={`flex flex-1 flex-wrap items-center gap-4 rounded-xl border p-5 ${
            complete
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
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
              {complete ? "تم ربط جميع الأسطر" : `نسبة الربط العامة ${result.linkPercent}%`}
            </p>
            <p className="text-sm text-muted-foreground">
              دُمجت {result.sheets.length.toLocaleString("en-US")} صفحات من «
              {result.originalFilename}» بالرقم الوطني «{result.nationalIdHeader}» في ملف واحد.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void exportFile()} disabled={exporting}>
            {exporting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {exporting ? "جارٍ تصدير الملف…" : "تصدير ملف Excel"}
          </Button>
          <Button variant="outline" onClick={onReset}>
            <RotateCcw className="size-4" />
            دمج جديد
          </Button>
        </div>
      </div>

      {exporting ? (
        <div className="space-y-2 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              {exportDetail ?? "جارٍ تصدير الملف…"}
            </span>
            <span className="font-bold text-foreground ltr-numbers">{exportProgress}%</span>
          </div>
          <Progress value={exportProgress} aria-label="نسبة تصدير الملف" />
        </div>
      ) : null}
      {exportError ? <p className="text-sm text-destructive">{exportError}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ملخص دمج الصفحات">
        <SummaryCard label="عدد الصفحات المدموجة" value={result.sheets.length} />
        <SummaryCard
          label="أسطر الصفحة الأولى"
          value={result.exportRowCount}
          hint={`من الصفحة «${result.mainSheetName}»`}
        />
        <SummaryCard label="أعمدة ملف التصدير" value={result.exportHeaders.length} />
        <SummaryCard
          label="أسطر تعذر ربطها"
          value={unlinkedTotal}
          hint="قيمها معروضة في الأسفل وفي ملف التصدير"
        />
      </div>

      <section className="space-y-4" aria-label="نسبة الربط في كل صفحة">
        <h2 className="text-lg font-black">عدد الأسطر ونسبة الربط في كل صفحة</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {result.sheets.map((stat) => (
            <SheetStatCard
              key={stat.sheetName}
              stat={stat}
              idColumn={stat.role === "main" ? result.nationalIdColumn : 0}
            />
          ))}
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <CircleX className="mt-0.5 size-4 shrink-0" />
        <p>
          ملف التصدير يحتوي على صفحة «الدمج» (أعمدة الصفحة الأولى ثم أعمدة كل صفحة أخرى بدون عمودها
          الأول)، وصفحة «غير مرتبط» لكل صفحة فيها أسطر لم تُربط. النتائج مؤقتة في الذاكرة وتختفي عند
          إغلاق الصفحة أو إعادة تشغيل الخادم، ولا تُحفظ في قاعدة بيانات الأرشيف.
        </p>
      </div>
    </div>
  );
}
