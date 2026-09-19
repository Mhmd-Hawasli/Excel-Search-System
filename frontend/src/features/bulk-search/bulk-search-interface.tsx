"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, LoaderCircle, Play, RotateCcw, Square, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FieldMappingSelect } from "@/features/fields/field-mapping-select";
import { ScopeSelector } from "@/features/search/scope-selector";
import { groupsService } from "@/services/groups.service";
import { formatShamCash } from "@/lib/conflict-format";
import { STANDARD_FIELD_LABELS, suggestStandardField } from "@/lib/standard-fields";
import { cn } from "@/lib/cn";
import {
  bulkSearchService,
  type BulkInspection,
  type BulkSearchResult,
} from "@/services/bulk-search.service";

/** Reference columns from the archived data (same 14-field catalog as search). */
const REFERENCE_FIELDS = [
  "full_name",
  "national_id",
  "first_name",
  "father_name",
  "last_name",
  "mother_name",
  "sham_cash",
  "personal_no",
  "phone",
  "contract_code",
  "secondary_contract_code",
  "job_title",
  "functional_category",
  "organizational_level",
] as const;

const PREVIEW_ROWS = 100;

function suggestedColumn(headers: string[], field: string): number | null {
  const index = headers.findIndex((header) => suggestStandardField(header) === field);
  return index >= 0 ? index : null;
}

export function BulkSearchInterface() {
  const [inspection, setInspection] = useState<BulkInspection | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sheetName, setSheetName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [field, setField] = useState<string>("full_name");
  /** 1-based column number as string (FieldMappingSelect contract), "" = unmapped. */
  const [column, setColumn] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [fileIds, setFileIds] = useState<string[]>([]);

  // Initial scope honors each group's "تضمين في البحث الافتراضي" flag: when
  // some group is excluded, preselect the included ones instead of everything.
  useEffect(() => {
    let active = true;
    groupsService
      .list()
      .then((list) => {
        if (!active || list.length === 0) return;
        const included = list.filter((g) => g.includeInDefaultSearch !== false).map((g) => g.id);
        if (included.length === 0 || included.length === list.length) return; // none or all → keep "all"
        setGroupIds(included);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runDetail, setRunDetail] = useState<string | null>(null);
  const [result, setResult] = useState<BulkSearchResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const suggested = useMemo(() => suggestedColumn(headers, field), [headers, field]);
  const ready = Boolean(inspection && sheetName && headers.length > 0 && field && column && !running && !uploading && !loadingSheet);

  async function uploadFile(file: File) {
    if (uploading || running) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError("الصيغ المقبولة هي XLSX وXLS فقط.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("حجم الملف يتجاوز الحد المسموح وهو 50 ميغابايت.");
      return;
    }
    resetAll();
    setFileName(file.name);
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const payload = await bulkSearchService.inspect(file, setUploadProgress);
      setInspection(payload);
      setSheetName(payload.selected.sheetName);
      setHeaders(payload.selected.headers);
      setPreview(payload.selected.preview);
      setRowCount(payload.selected.rowCount);
      const initial = suggestedColumn(payload.selected.headers, "full_name");
      setColumn(initial === null ? "" : String(initial + 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر فحص الملف.");
    } finally {
      setUploading(false);
    }
  }

  async function selectSheet(name: string) {
    if (!inspection || uploading || running) return;
    setSheetName(name);
    setColumn("");
    setResult(null);
    setError(null);
    setLoadingSheet(true);
    try {
      const selected = await bulkSearchService.sheet(inspection.token, name);
      setHeaders(selected.headers);
      setPreview(selected.preview);
      setRowCount(selected.rowCount);
      const next = suggestedColumn(selected.headers, field);
      setColumn(next === null ? "" : String(next + 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر فحص الورقة.");
    } finally {
      setLoadingSheet(false);
    }
  }

  function changeField(next: string) {
    setField(next);
    setResult(null);
    // Auto-apply the smart suggestion only when nothing is mapped yet,
    // so a manual choice is never overwritten silently.
    if (!column) {
      const nextSuggested = suggestedColumn(headers, next);
      if (nextSuggested !== null) setColumn(String(nextSuggested + 1));
    }
  }

  function applySuggestion() {
    if (suggested === null) return;
    setColumn(String(suggested + 1));
  }

  async function run() {
    if (!ready || !inspection) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setRunProgress(0);
    setRunDetail("بدء البحث الجماعي…");
    setError(null);
    setStopped(false);
    setResult(null);
    try {
      const payload = await bulkSearchService.run(
        { token: inspection.token, sheetName, field, column: Number(column) - 1, groupIds, fileIds },
        (percent, detail) => {
          setRunProgress(percent);
          setRunDetail(detail);
        },
        controller.signal,
      );
      setResult(payload);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setStopped(true);
      } else {
        setError(cause instanceof Error ? cause.message : "تعذر تنفيذ البحث الجماعي.");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function exportFile() {
    if (!inspection || !result || exporting) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);
    setError(null);
    setStopped(false);
    try {
      // The workbook lists every searched value in order: matches in full
      // detail, values without matches as rows with empty match cells.
      await bulkSearchService.downloadExport(result.rows.map((row) => ({
        sequence: row.sequence,
        queryValue: row.queryValue,
        field: row.field,
        fileName: row.fileName,
        rowIndex: row.rowIndex,
        fullName: row.fullName,
        nationalId: row.nationalId,
        shamCash: row.shamCash,
        personalNo: row.personalNo,
        matchPercent: row.matchPercent,
      })), result.unmatchedQueries.map((item) => ({
        sequence: item.sequence,
        queryValue: item.query,
        field: result.field,
      })), controller.signal);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setStopped(true);
      } else {
        setError(cause instanceof Error ? cause.message : "تعذر تصدير ملف النتائج.");
      }
    } finally {
      abortRef.current = null;
      setExporting(false);
    }
  }

  function resetAll() {
    abortRef.current?.abort();
    abortRef.current = null;
    setInspection(null);
    setFileName("");
    setSheetName("");
    setHeaders([]);
    setPreview([]);
    setRowCount(0);
    setField("full_name");
    setColumn("");
    setGroupIds([]);
    setFileIds([]);
    setResult(null);
    setRunProgress(0);
    setRunDetail(null);
    setError(null);
    setStopped(false);
  }

  const shownRows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-black">1 — رفع ملف القيم</h2>
            {inspection ? <Badge variant="secondary">{fileName}</Badge> : null}
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            aria-label="ملف Excel لقيم البحث الجماعي"
            className="block w-full cursor-pointer text-sm text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
            disabled={uploading || running}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadFile(file);
              event.target.value = "";
            }}
          />
          {uploading ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" />
                  {uploadProgress < 100 ? "جارٍ رفع الملف…" : "جارٍ فحص الملف على الخادم…"}
                </span>
                <span className="font-bold text-foreground ltr-numbers">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} aria-label="نسبة رفع الملف" />
            </div>
          ) : null}
          {inspection && inspection.sheets.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-sheet">2 — الورقة المراد البحث فيها</Label>
              <select
                id="bulk-sheet"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                disabled={uploading || running || loadingSheet}
                value={sheetName}
                onChange={(event) => void selectSheet(event.target.value)}
              >
                {inspection.sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>
                    {sheet.name} — {sheet.rowCount.toLocaleString("en-US")} صف
                  </option>
                ))}
              </select>
            </div>
          ) : inspection ? (
            <p className="text-sm text-muted-foreground">
              2 — الورقة: <strong className="text-foreground">{sheetName}</strong> (
              {rowCount.toLocaleString("en-US")} صف)
            </p>
          ) : null}
          {loadingSheet ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              جارٍ فحص الورقة…
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {inspection && headers.length > 0 ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-black">3 — العمود المرجعي وعمود الاكسيل المرتبط</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              اختر العمود المرجعي من البيانات المحفوظة في النظام، ثم اختر عمود الاكسيل المرتبط
              به. يُقترح العمود تلقائيًا من عناوين الملف (اقتراح ذكي) ويمكن البحث داخل القائمة
              بالكتابة وإلغاء أي ارتباط بزر ×. تُجلب أول 10 نتائج عالية (≥ 80%) لكل قيمة فقط،
              والقيم النصية العامة بكلمة واحدة (مثل «محمد») لا تُبحث لاستحالة التطابق العالي —
              اكتب كلمتين على الأقل.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-field">العمود المرجعي (بيانات النظام)</Label>
                <select
                  id="bulk-field"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  disabled={running}
                  value={field}
                  onChange={(event) => changeField(event.target.value)}
                >
                  {REFERENCE_FIELDS.map((key) => (
                    <option key={key} value={key}>
                      {STANDARD_FIELD_LABELS[key as keyof typeof STANDARD_FIELD_LABELS]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="bulk-column">عمود الاكسيل المرتبط</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={running || suggested === null}
                    onClick={applySuggestion}
                    aria-label="إعادة تطبيق الاقتراح الذكي لعمود الاكسيل"
                    title={suggested === null ? "لا يوجد اقتراح مطابق" : "إعادة تطبيق الاقتراح الذكي"}
                  >
                    <WandSparkles className="size-4" />
                    اقتراح ذكي
                  </Button>
                </div>
                <FieldMappingSelect
                  id="bulk-column"
                  ariaLabel={`عمود الاكسيل المرتبط بـ ${STANDARD_FIELD_LABELS[field as keyof typeof STANDARD_FIELD_LABELS]}`}
                  value={column}
                  disabled={running}
                  onChange={(next) => {
                    setColumn(next);
                    setResult(null);
                  }}
                  options={[
                    { value: "", label: "غير مربوط" },
                    ...headers.map((header, index) => ({
                      value: String(index + 1),
                      label: header + (suggested === index ? " (مقترح)" : ""),
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>الملفات التي يجب البحث فيها</Label>
              <ScopeSelector
                groupIds={groupIds}
                fileIds={fileIds}
                onChange={(scope) => {
                  setGroupIds(scope.groupIds);
                  setFileIds(scope.fileIds);
                  setResult(null);
                }}
              />
              {(groupIds.length > 0 || fileIds.length > 0) && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    setGroupIds([]);
                    setFileIds([]);
                    setResult(null);
                  }}
                >
                  إعادة تعيين النطاق إلى جميع الملفات
                </button>
              )}
            </div>
            {preview.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[420px] text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {headers.map((header, index) => (
                        <th
                          key={index}
                          className={cn(
                            "whitespace-nowrap p-2 text-right",
                            column === String(index + 1) && "bg-primary/10 text-primary",
                          )}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={cn(
                              "max-w-36 truncate p-2",
                              column === String(cellIndex + 1) && "bg-primary/5 font-semibold",
                            )}
                          >
                            {cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {running ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>{runDetail ?? "جارٍ البحث…"}</span>
                  <span className="font-bold text-foreground ltr-numbers">{runProgress}%</span>
                </div>
                <Progress value={runProgress} aria-label="نسبة تنفيذ البحث الجماعي" />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {running || exporting ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  className="flex-1"
                  onClick={stop}
                  aria-label="إيقاف العملية بشكل كامل"
                >
                  <Square className="size-5" />
                  إيقاف العملية
                </Button>
              ) : (
                <>
                  <Button size="lg" className="flex-1" disabled={!ready} onClick={() => void run()}>
                    <Play className="size-5" />
                    تشغيل البحث الجماعي
                  </Button>
                  <Button type="button" variant="outline" size="lg" disabled={uploading} onClick={resetAll}>
                    <RotateCcw className="size-4" />
                    بحث جديد
                  </Button>
                </>
              )}
            </div>
            {stopped && !running && !exporting ? (
              <p role="status" className="rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
                تم إيقاف العملية من قبلك بشكل كامل.
              </p>
            ) : null}
            {!column ? (
              <p className="text-xs text-muted-foreground">
                حدد عمود الاكسيل المرتبط بالعمود المرجعي لبدء البحث.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-black">النتائج — تُكرر كل قيمة بحث لكل نتيجة مطابقة (≥ 80%، أول 10 لكل قيمة)</h2>
              <Button
                type="button"
                disabled={exporting}
                onClick={() => void exportFile()}
                title="يشمل ملف التصدير جميع القيم المدروسة بالترتيب: المطابقات بتفاصيلها، والقيم بلا نتائج بصفوف فارغة البيانات"
              >
                {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                تصدير ملف النتائج (XLSX)
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">القيم: {result.totalValues.toLocaleString("en-US")}</Badge>
              <Badge variant="default">قيم لها نتائج: {result.matchedValues.toLocaleString("en-US")}</Badge>
              <Badge variant="outline">قيم بلا نتائج: {result.unmatchedValues.toLocaleString("en-US")}</Badge>
              <Badge variant="outline">إجمالي المطابقات: {result.totalMatches.toLocaleString("en-US")}</Badge>
            </div>
            {result.rows.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                لم يتم العثور على نتائج فوق نسبة التطابق العالية (80%) لأي قيمة.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="bg-muted">
                      <tr>
                        {[
                          "التسلسل",
                          "القيمة التي بحثت عنها",
                          "نوع القيمة",
                          "اسم الملف",
                          "رقم السطر",
                          "الاسم الثلاثي",
                          "الرقم الوطني",
                          "الشام كاش",
                          "الرقم الذاتي",
                          "نسبة التطابق",
                        ].map((title) => (
                          <th key={title} className="whitespace-nowrap p-3 text-right font-bold">
                            {title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map((row, index) => (
                        <tr
                          key={`${row.sequence}-${index}`}
                          className={cn("border-t", row.sequence % 2 === 0 && "bg-primary/[0.04]")}
                        >
                          <td className="p-3 ltr-numbers">{row.sequence}</td>
                          <td className="p-3 font-semibold">{row.queryValue}</td>
                          <td className="p-3">
                            {STANDARD_FIELD_LABELS[result.field as keyof typeof STANDARD_FIELD_LABELS] ?? result.field}
                          </td>
                          <td className="p-3">{row.fileName}</td>
                          <td className="p-3 ltr-numbers">{row.rowIndex}</td>
                          <td className="p-3">{row.fullName || "—"}</td>
                          <td className="p-3 ltr-numbers">{row.nationalId || "—"}</td>
                          <td dir="ltr" className="p-3 ltr-numbers">{row.shamCash ? formatShamCash(row.shamCash) || row.shamCash : "—"}</td>
                          <td className="p-3 ltr-numbers">{row.personalNo || "—"}</td>
                          <td className="p-3 font-bold ltr-numbers">{row.matchPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.rows.length > PREVIEW_ROWS ? (
                  <p className="text-xs text-muted-foreground">
                    عرض أول {PREVIEW_ROWS.toLocaleString("en-US")} من{" "}
                    {result.totalMatches.toLocaleString("en-US")} نتيجة — الملف المصدَّر يحوي
                    جميع القيم بالترتيب، والقيم بلا نتائج تظهر فيه بصفوف فارغة البيانات.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    الملف المصدَّر يحوي جميع القيم بالترتيب، والقيم بلا نتائج تظهر فيه بصفوف فارغة البيانات.
                  </p>
                )}
              </>
            )}
            {result.unmatchedQueries.length > 0 ? (
              <details className="rounded-lg border p-4 text-sm">
                <summary className="cursor-pointer font-bold">
                  قيم بلا نتائج ({result.unmatchedQueries.length.toLocaleString("en-US")})
                </summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-muted-foreground">
                  {result.unmatchedQueries.slice(0, 100).map((item) => (
                    <li key={item.sequence}>
                      <span className="ltr-numbers">{item.sequence}</span> — {item.query}
                    </li>
                  ))}
                </ul>
                {result.unmatchedQueries.length > 100 ? (
                  <p className="mt-1 text-xs">
                    …و{(result.unmatchedQueries.length - 100).toLocaleString("en-US")} قيمة أخرى.
                  </p>
                ) : null}
              </details>
            ) : null}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileUp className="size-4" />
              قسم معزول: ملف الرفع مؤقت ولا يُحفظ في الأرشيف، وملف النتائج يُبنى مباشرة عند
              التصدير دون تخزينه على الخادم.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
