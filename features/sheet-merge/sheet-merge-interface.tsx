"use client";

import { useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Layers,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { postNdJson, uploadWorkbookWithProgress } from "@/features/sheet-merge/client";
import { SheetMergeResults } from "@/features/sheet-merge/sheet-merge-results";
import {
  MIN_NATIONAL_ID_DIGITS,
  type SheetMergeResult,
  type UploadInspection,
} from "@/lib/sheet-merge/types";

const steps = ["رفع الملف واختيار الصفحات", "النتائج والتصدير"];

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function SheetMergeInterface() {
  const [inspection, setInspection] = useState<UploadInspection | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDetail, setUploadDetail] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** 0-based national-id column of the first sheet (null = لم يُحدَّد بعد). */
  const [idColumn, setIdColumn] = useState<number | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runDetail, setRunDetail] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<SheetMergeResult | null>(null);
  const [step, setStep] = useState(0);

  const linkedSheets = useMemo(() => (inspection ? inspection.sheets.slice(1) : []), [inspection]);
  const exportColumnCount = inspection
    ? inspection.main.headers.length +
      linkedSheets
        .filter((sheet) => selectedSheets.includes(sheet.name))
        .reduce((sum, sheet) => sum + Math.max(0, sheet.columnCount - 1), 0)
    : 0;
  const blocked = linkedSheets.filter((sheet) => !sheet.linkable);
  const canRun =
    Boolean(inspection) && idColumn !== null && selectedSheets.length > 0 && !uploading && !running;

  async function upload(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setUploadError("الصيغ المقبولة هي XLSX وXLS فقط.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setRunError(null);
    setUploadProgress(0);
    setUploadDetail("جارٍ رفع الملف إلى الخادم…");
    try {
      const payload = await uploadWorkbookWithProgress(file, (percent, detail) => {
        setUploadProgress(percent);
        if (detail) setUploadDetail(detail);
      });
      setInspection(payload);
      setResult(null);
      setStep(0);
      setIdColumn(payload.suggestion.index);
      setSelectedSheets(
        payload.sheets
          .slice(1)
          .filter((sheet) => sheet.linkable)
          .map((sheet) => sheet.name),
      );
    } catch (error) {
      setInspection(null);
      setIdColumn(null);
      setSelectedSheets([]);
      setUploadError(error instanceof Error ? error.message : "تعذر فحص الملف.");
    } finally {
      setUploading(false);
      setUploadDetail(null);
    }
  }

  function toggleSheet(name: string, checked: boolean) {
    setSelectedSheets((current) =>
      checked ? [...current, name] : current.filter((entry) => entry !== name),
    );
  }

  function reset() {
    setInspection(null);
    setIdColumn(null);
    setSelectedSheets([]);
    setResult(null);
    setRunError(null);
    setUploadError(null);
    setStep(0);
  }

  async function run() {
    if (!inspection || idColumn === null) return;
    setRunning(true);
    setRunProgress(0);
    setRunDetail("بدء دمج الصفحات…");
    setRunError(null);
    try {
      const payload = await postNdJson<SheetMergeResult>(
        "/api/sheet-merge/run",
        { uploadId: inspection.uploadId, nationalIdColumn: idColumn, sheetNames: selectedSheets },
        (percent, detail) => {
          setRunProgress(percent);
          if (detail) setRunDetail(detail);
        },
      );
      setResult(payload);
      setStep(1);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "تعذر تنفيذ دمج الصفحات.");
    } finally {
      setRunning(false);
      setRunDetail(null);
    }
  }

  return (
    <div className="space-y-6">
      <nav aria-label="خطوات دمج الصفحات" className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((label, index) => (
          <span key={label} className="flex items-center gap-2">
            {index ? <span className="text-muted-foreground">←</span> : null}
            <Badge variant={step === index ? "default" : "secondary"}>
              {index + 1} — {label}
            </Badge>
          </span>
        ))}
      </nav>

      {step === 1 && result ? (
        <SheetMergeResults result={result} onReset={reset} />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-bold">
                  <FileSpreadsheet className="size-5 text-primary" />
                  رفع ملف الإكسل
                </h2>
                {inspection ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="ltr-numbers">
                      {inspection.sheetCount} صفحات
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={reset}
                      disabled={uploading || running}
                    >
                      <RotateCcw className="size-4" />
                      ملف آخر
                    </Button>
                  </div>
                ) : null}
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                aria-label="ملف الإكسل الذي يحتوي على عدة صفحات"
                className="block w-full cursor-pointer text-sm text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
                disabled={uploading || running}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
              {uploading ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <LoaderCircle className="size-4 animate-spin" />
                      {uploadDetail ?? "جارٍ رفع الملف…"}
                    </span>
                    <span className="font-bold text-foreground ltr-numbers">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} aria-label="نسبة رفع الملف" />
                </div>
              ) : null}
              {inspection ? (
                <p className="text-sm text-muted-foreground">
                  الملف «{inspection.originalFilename}» —{" "}
                  {inspection.sheetCount.toLocaleString("en-US")} صفحات، تم إلغاء عامل التصفية من
                  جميع الأعمدة والصفوف.
                </p>
              ) : null}
              {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
            </CardContent>
          </Card>

          {inspection ? (
            <>
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-bold">
                      <Layers className="size-5 text-primary" />
                      صفحات الملف
                    </h2>
                    <Badge variant="secondary" className="ltr-numbers">
                      {selectedSheets.length} صفحة محددة للدمج
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    الصفحة الأولى هي الصفحة الرئيسية، وتُربط بها بقية الصفحات عن طريق الرقم الوطني
                    الموجود في <span className="font-semibold">العمود الأول</span> من كل صفحة. يمكن
                    تحديد صفحتين أو ثلاث أو أي عدد من الصفحات.
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-3 text-right font-semibold">دمج</th>
                          <th className="p-3 text-right font-semibold">اسم الصفحة</th>
                          <th className="p-3 text-right font-semibold">عدد الأسطر</th>
                          <th className="p-3 text-right font-semibold">عدد الأعمدة</th>
                          <th className="p-3 text-right font-semibold">العمود الأول</th>
                          <th className="p-3 text-right font-semibold">حالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspection.sheets.map((sheet, index) => {
                          const isMain = index === 0;
                          const checked = isMain || selectedSheets.includes(sheet.name);
                          return (
                            <tr
                              key={sheet.name}
                              className={`border-t ${isMain ? "bg-primary/5" : ""}`}
                            >
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-primary disabled:opacity-60"
                                  aria-label={`دمج الصفحة ${sheet.name}`}
                                  checked={checked}
                                  disabled={isMain || !sheet.linkable || running}
                                  onChange={(event) =>
                                    toggleSheet(sheet.name, event.target.checked)
                                  }
                                />
                              </td>
                              <td className="p-3 font-semibold">
                                {sheet.name}
                                {isMain ? (
                                  <Badge className="ms-2" variant="default">
                                    الصفحة الرئيسية
                                  </Badge>
                                ) : null}
                              </td>
                              <td className="p-3 ltr-numbers">
                                {sheet.rowCount.toLocaleString("en-US")}
                              </td>
                              <td className="p-3 ltr-numbers">
                                {sheet.columnCount.toLocaleString("en-US")}
                              </td>
                              <td className="max-w-40 truncate p-3">{sheet.firstColumnHeader}</td>
                              <td className="p-3">
                                <span className="flex flex-wrap gap-1">
                                  {sheet.filtersRemoved ? (
                                    <Badge variant="outline">أُلغيت التصفية</Badge>
                                  ) : null}
                                  {sheet.hidden ? (
                                    <Badge variant="outline">مخفية في Excel</Badge>
                                  ) : null}
                                  {!sheet.linkable ? (
                                    <Badge variant="destructive">لا يمكن ربطها</Badge>
                                  ) : null}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {blocked.length ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {blocked.map((sheet) => (
                        <li key={sheet.name} className="flex items-start gap-2">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                          <span>
                            <span className="font-semibold">{sheet.name}:</span> {sheet.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 p-5">
                  <h2 className="font-bold">تحديد عمود الرقم الوطني في الصفحة الأولى</h2>
                  {inspection.suggestion.reason ? (
                    <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
                      <Sparkles className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {inspection.suggestion.reason}
                        {idColumn !== inspection.suggestion.index ? (
                          <button
                            type="button"
                            className="ms-2 font-bold underline underline-offset-4"
                            onClick={() => setIdColumn(inspection.suggestion.index)}
                          >
                            استخدام الاقتراح
                          </button>
                        ) : null}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      تعذر اقتراح العمود تلقائياً — يرجى اختياره من القائمة.
                    </p>
                  )}
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      عمود الرقم الوطني في الصفحة «{inspection.main.name}»
                    </span>
                    <select
                      className={selectClass}
                      value={idColumn === null ? "" : String(idColumn)}
                      disabled={running}
                      onChange={(event) =>
                        setIdColumn(event.target.value === "" ? null : Number(event.target.value))
                      }
                    >
                      <option value="">— اختر العمود —</option>
                      {inspection.main.headers.map((header, index) => (
                        <option key={`${header}-${index}`} value={index}>
                          {header} (العمود {index + 1})
                        </option>
                      ))}
                    </select>
                  </label>
                  {inspection.main.preview.length ? (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[520px] text-xs">
                        <thead className="bg-muted">
                          <tr>
                            {inspection.main.headers.map((header, index) => (
                              <th
                                key={`${header}-${index}`}
                                className={`whitespace-nowrap p-2 text-right ${
                                  index === idColumn ? "bg-primary/15 text-primary" : ""
                                }`}
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {inspection.main.preview.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-t">
                              {inspection.main.headers.map((_, cellIndex) => (
                                <td
                                  key={cellIndex}
                                  className={`max-w-36 truncate p-2 ${
                                    cellIndex === idColumn
                                      ? "bg-primary/5 font-semibold ltr-numbers"
                                      : ""
                                  }`}
                                >
                                  {row[cellIndex] || "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      لا توجد أسطر بيانات في الصفحة الأولى.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 p-5">
                  <h2 className="font-bold">قاعدة الربط</h2>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>
                      • يُقرأ الرقم الوطني من الخلية ويُحوَّل إلى رقم في جميع الصفحات، ويجب أن يكون
                      أكثر من {MIN_NATIONAL_ID_DIGITS - 1} محارف (تُحوَّل الأرقام العربية وتُحذف
                      الفراغات والأصفار البادئة).
                    </li>
                    <li>• يجب ألا يتكرر الرقم الوطني داخل الصفحة الواحدة.</li>
                    <li>
                      • العمود الأول في كل صفحة مدموجة هو الرقم الوطني الذي يربطها بالصفحة الرئيسية،
                      وتُحذف أعمدة الرقم الوطني من الصفحات المدموجة في ملف التصدير.
                    </li>
                    <li>• الأسطر التي يتعذر ربطها تبقى في النتيجة مع سبب التعذر وقيمها كاملة.</li>
                  </ul>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">الصفحات المدموجة</p>
                      <p className="mt-1 text-xl font-black ltr-numbers">
                        {(selectedSheets.length + 1).toLocaleString("en-US")}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">أعمدة ملف التصدير</p>
                      <p className="mt-1 text-xl font-black ltr-numbers">
                        {exportColumnCount.toLocaleString("en-US")}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">أسطر الصفحة الأولى</p>
                      <p className="mt-1 text-xl font-black ltr-numbers">
                        {inspection.main.rowCount.toLocaleString("en-US")}
                      </p>
                    </div>
                  </div>
                  {runError ? <p className="text-sm text-destructive">{runError}</p> : null}
                  {running ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <LoaderCircle className="size-4 animate-spin" />
                          {runDetail ?? "جارٍ معالجة الصفحات…"}
                        </span>
                        <span className="font-bold text-foreground ltr-numbers">
                          {runProgress}%
                        </span>
                      </div>
                      <Progress value={runProgress} aria-label="نسبة معالجة الصفحات" />
                    </div>
                  ) : null}
                  {!selectedSheets.length && !running ? (
                    <p className="text-sm text-destructive">اختر صفحة واحدة على الأقل لدمجها.</p>
                  ) : null}
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => void run()}
                    disabled={!canRun}
                  >
                    {running ? (
                      <LoaderCircle className="size-5 animate-spin" />
                    ) : (
                      <Play className="size-5" />
                    )}
                    دمج الصفحات
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Upload className="size-4" />
        قسم معزول كلياً: الملف والنتائج جلسة مؤقتة في الذاكرة، ولا يُحفظ أي شيء في قاعدة بيانات
        الأرشيف أو على القرص.
      </p>
    </div>
  );
}
