"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileSpreadsheet,
  LoaderCircle,
  Save,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import type { SheetInspection, StandardFieldKey, WorkbookInspection } from "@/lib/excel/types";
import { STANDARD_FIELD_KEYS } from "@/lib/excel/types";
import { STANDARD_FIELD_LABELS } from "@/lib/excel/standard-field-catalog";
import { ensureUniqueStandardFields } from "@/lib/excel/mapping";
import { formatShamCash } from "@/lib/format/sham-cash";
import { CategorySelector } from "@/components/category-selector";
import { WorkbookSheetSelector } from "@/components/workbook-sheet-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

type GroupOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };
type TemplateOption = { id: string; groupId: string; name: string; mapping: unknown };
type ColumnMapping = SheetInspection["columns"][number] & {
  standardField: StandardFieldKey | null;
  categoryId: string | null;
};
type JobState = {
  id: string;
  fileId: string | null;
  status: "PENDING" | "PARSING" | "INSERTING" | "DONE" | "FAILED";
  totalRows: number;
  processedRows: number;
  errorMessage: string | null;
};

const steps = ["الملف والورقة", "هوية الملف", "حقول البحث", "فئات الأعمدة", "المعاينة والتأكيد"];
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function UploadWizard({
  groups,
  categories,
  templates,
  initialGroupId,
}: {
  groups: GroupOption[];
  categories: CategoryOption[];
  templates: TemplateOption[];
  initialGroupId?: string;
}) {
  const [step, setStep] = useState(0);
  const [groupId, setGroupId] = useState(initialGroupId ?? groups[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<WorkbookInspection | null>(null);
  const [sheet, setSheet] = useState<SheetInspection | null>(null);
  const [columns, setColumns] = useState<ColumnMapping[]>([]);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  const notifiedJob = useRef<string | null>(null);

  const groupTemplates = useMemo(
    () => templates.filter((template) => template.groupId === groupId),
    [templates, groupId],
  );
  const progress = job ? Math.round((job.processedRows / Math.max(job.totalRows, 1)) * 100) : 0;

  function useSheet(next: SheetInspection | null) {
    setSheet(next);
    if (!next) {
      setColumns([]);
      return;
    }
    setColumns(
      ensureUniqueStandardFields(
        next.columns.map((column) => ({
          ...column,
          standardField: column.suggestedField,
          categoryId: null,
        })),
        next.linkedSheets?.nationalIdColumnIndex,
      ),
    );
  }

  async function inspect() {
    if (!file) return toast.error("اختر ملف Excel أولًا.");
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/workbooks/inspect", { method: "POST", body });
    const result = (await response.json()) as WorkbookInspection & { error?: string };
    setBusy(false);
    if (!response.ok) return toast.error(result.error ?? "تعذر فحص الملف.");
    setInspection(result);
    useSheet(result.selected);
    setName(file.name.replace(/\.(xlsx|xls)$/i, ""));
    setNameError(null);
  }

  function updateColumn(
    index: number,
    patch: Partial<Pick<ColumnMapping, "standardField" | "categoryId">>,
  ) {
    setColumns((current) =>
      current.map((column, columnIndex) =>
        columnIndex === index ? { ...column, ...patch } : column,
      ),
    );
  }

  function linkStandardField(standardField: StandardFieldKey, selectedColumnIndex: string) {
    const columnIndex = selectedColumnIndex === "" ? null : Number(selectedColumnIndex);
    setColumns((current) =>
      current.map((column) => {
        if (column.standardField === standardField) return { ...column, standardField: null };
        if (columnIndex !== null && column.columnIndex === columnIndex)
          return { ...column, standardField };
        return column;
      }),
    );
  }

  function applyTemplate(templateId: string) {
    const selected = templates.find((template) => template.id === templateId);
    if (
      !selected ||
      typeof selected.mapping !== "object" ||
      selected.mapping === null ||
      !("columns" in selected.mapping) ||
      !Array.isArray(selected.mapping.columns)
    )
      return;
    const saved = selected.mapping.columns.filter(
      (
        item,
      ): item is {
        headerRaw: string;
        standardField: StandardFieldKey | null;
        categoryId: string | null;
      } =>
        typeof item === "object" &&
        item !== null &&
        "headerRaw" in item &&
        typeof item.headerRaw === "string",
    );
    setColumns((current) =>
      ensureUniqueStandardFields(
        current.map((column) => {
          const match = saved.find((item) => item.headerRaw === column.headerRaw);
          return match
            ? {
                ...column,
                standardField: STANDARD_FIELD_KEYS.includes(match.standardField as StandardFieldKey)
                  ? match.standardField
                  : null,
                categoryId: categories.some((category) => category.id === match.categoryId)
                  ? match.categoryId
                  : null,
              }
            : column;
        }),
        sheet?.linkedSheets?.nationalIdColumnIndex,
      ),
    );
    toast.success("تم تطبيق القالب على الأعمدة المطابقة.");
  }

  function canContinue() {
    if (step === 0) return Boolean(groupId && inspection && sheet);
    if (step === 1) return name.trim().length >= 2 && name.trim().length <= 160;
    return true;
  }

  async function goToNextStep() {
    if (step !== 1) {
      setStep((current) => Math.min(4, current + 1));
      return;
    }

    const trimmedName = name.trim();
    setBusy(true);
    setNameError(null);
    try {
      const response = await fetch("/api/files/check-name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const result = (await response.json()) as { available?: boolean; error?: string };
      if (!response.ok || !result.available) {
        setNameError(result.error ?? "تعذر التحقق من اسم الملف.");
        return;
      }
      setName(trimmedName);
      setStep(2);
    } catch {
      setNameError("تعذر التحقق من اسم الملف. تحقق من الاتصال ثم حاول مجددًا.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!inspection || !sheet) return;
    setBusy(true);
    const response = await fetch("/api/upload-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: inspection.token,
        groupId,
        name,
        description,
        originalFilename: inspection.originalFilename,
        sheetName: sheet.sheetName,
        sheetIndex: sheet.sheetIndex,
        totalRows: sheet.rowCount,
        linkedSheets: sheet.linkedSheets,
        columns: columns.map(
          ({ headerRaw, headerNormalized, columnIndex, standardField, categoryId }) => ({
            headerRaw,
            headerNormalized,
            columnIndex,
            standardField,
            categoryId,
          }),
        ),
      }),
    });
    const result = (await response.json()) as { jobId?: string; error?: string };
    setBusy(false);
    if (!response.ok || !result.jobId) return toast.error(result.error ?? "تعذر بدء الاستيراد.");
    setJob({
      id: result.jobId,
      fileId: null,
      status: "PENDING",
      totalRows: sheet.rowCount,
      processedRows: 0,
      errorMessage: null,
    });
  }

  useEffect(() => {
    if (!job || job.status === "DONE" || job.status === "FAILED") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/upload-jobs/${job.id}`, { cache: "no-store" });
      if (response.ok) setJob((await response.json()) as JobState);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!job || notifiedJob.current === job.id) return;
    if (job.status === "DONE") {
      notifiedJob.current = job.id;
      toast.success("تم حفظ الملف وأصبحت سجلاته جاهزة للبحث.");
    } else if (job.status === "FAILED") {
      notifiedJob.current = job.id;
      toast.error(job.errorMessage ?? "فشل حفظ الملف.");
    }
  }, [job]);

  async function saveTemplate() {
    if (!job || !templateName.trim()) return;
    const response = await fetch(`/api/upload-jobs/${job.id}/template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: templateName }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) return toast.error(result.error ?? "تعذر حفظ القالب.");
    setTemplateSaved(true);
    toast.success("تم حفظ قالب الربط.");
  }

  if (job)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {job.status === "DONE" ? (
              <FileCheck2 className="size-6 text-primary" />
            ) : (
              <LoaderCircle className="size-6 animate-spin text-primary" />
            )}
            {job.status === "DONE"
              ? "اكتمل استيراد الملف"
              : job.status === "FAILED"
                ? "فشل استيراد الملف"
                : "جارٍ استيراد البيانات"}
          </CardTitle>
          <CardDescription>
            {job.status === "DONE"
              ? "أصبحت السجلات جاهزة للبحث."
              : "يمكنك مغادرة الصفحة والعودة؛ التقدم محفوظ في النظام."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Progress value={job.status === "DONE" ? 100 : progress} />
          <div className="flex justify-between text-sm">
            <span>
              {job.processedRows.toLocaleString("en-US")} من {job.totalRows.toLocaleString("en-US")}{" "}
              صف
            </span>
            <span>{job.status === "DONE" ? 100 : progress}%</span>
          </div>
          {job.errorMessage ? (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              {job.errorMessage}
            </p>
          ) : null}
          {job.status === "DONE" ? (
            <div className="space-y-4 rounded-xl border bg-muted/25 p-4">
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/groups/${groupId}`}>عرض ملفات المجموعة</Link>
                </Button>
                {job.fileId ? (
                  <Button asChild variant="outline">
                    <Link href={`/groups/${groupId}/files/${job.fileId}/quality`}>
                      عرض تقرير جودة البيانات
                    </Link>
                  </Button>
                ) : null}
              </div>
              {!templateSaved ? (
                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                  <Input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder="اسم قالب الربط (اختياري)"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={saveTemplate}
                    disabled={!templateName.trim()}
                  >
                    <Save className="size-4" />
                    حفظ قالب الربط
                  </Button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-primary">
                  <Check className="ms-1 inline size-4" />
                  تم حفظ القالب بنجاح.
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-5" aria-label="خطوات رفع الملف">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`rounded-lg border px-3 py-3 text-sm font-bold ${index === step ? "border-primary bg-primary text-primary-foreground" : index < step ? "border-primary/30 bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}
          >
            <span className="ms-2">{index + 1}.</span>
            {label}
          </li>
        ))}
      </ol>
      <Card>
        <CardHeader>
          <CardTitle>{steps[step]}</CardTitle>
          <CardDescription>
            {step === 0
              ? "اختر المجموعة والملف ثم ورقة واحدة أو عدة أوراق مترابطة بالرقم الوطني."
              : step === 1
                ? "امنح الملف اسمًا فريدًا ووصفًا يساعد في التعرف إليه."
                : step === 2
                  ? "لكل حقل قياسي ثابت في النظام، اختر عمود Excel الذي يحتوي قيمه."
                  : step === 3
                    ? "وزع الأعمدة على تبويبات صفحة التفاصيل؛ غير المصنف يذهب إلى «أخرى»."
                    : "راجع أول 20 صفًا وإعدادات الربط قبل بدء المهمة."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="upload-group">المجموعة</Label>
                <select
                  id="upload-group"
                  className={selectClass}
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workbook-file">ملف Excel</Label>
                <div className="flex gap-2">
                  <Input
                    id="workbook-file"
                    type="file"
                    accept=".xlsx,.xls"
                    disabled={busy}
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setInspection(null);
                      useSheet(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={inspect}
                    disabled={!file || busy}
                  >
                    {busy ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <UploadCloud className="size-4" />
                    )}
                    فحص
                  </Button>
                </div>
              </div>
              {inspection ? (
                <div className="md:col-span-2">
                  <WorkbookSheetSelector
                    key={inspection.token}
                    inspection={inspection}
                    sheet={sheet}
                    onChange={useSheet}
                    busy={busy}
                    onBusyChange={setBusy}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {step === 1 ? (
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="file-name">اسم الملف داخل النظام</Label>
                <Input
                  id="file-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(null);
                  }}
                  maxLength={160}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "file-name-error" : undefined}
                  required
                />
                {nameError ? (
                  <p
                    id="file-name-error"
                    role="alert"
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive"
                  >
                    {nameError}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="file-description">الوصف (اختياري)</Label>
                <Textarea
                  id="file-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="مثال: كشف العقود المحدث لشهر آب 2026"
                />
              </div>
            </div>
          ) : null}
          {step === 2 ? (
            <div className="space-y-4">
              {groupTemplates.length ? (
                <div className="space-y-2 rounded-lg border bg-muted/25 p-4">
                  <Label htmlFor="mapping-template">تطبيق قالب سابق</Label>
                  <select
                    id="mapping-template"
                    className={selectClass}
                    defaultValue=""
                    onChange={(event) => applyTemplate(event.target.value)}
                  >
                    <option value="" disabled>
                      اختر قالبًا…
                    </option>
                    {groupTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="w-2/5 p-3 text-right">الحقل القياسي في النظام</th>
                      <th className="p-3 text-right">عمود Excel المرتبط</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STANDARD_FIELD_KEYS.map((key) => {
                      const linkedColumn = columns.find((column) => column.standardField === key);
                      return (
                        <tr key={key} className="border-t">
                          <th scope="row" className="p-3 text-right font-semibold">
                            {STANDARD_FIELD_LABELS[key]}
                          </th>
                          <td className="p-3">
                            <select
                              className={selectClass}
                              aria-label={`عمود Excel المرتبط بحقل ${STANDARD_FIELD_LABELS[key]}`}
                              value={linkedColumn ? String(linkedColumn.columnIndex) : ""}
                              disabled={Boolean(sheet?.linkedSheets && key === "national_id")}
                              onChange={(event) => linkStandardField(key, event.target.value)}
                            >
                              <option value="">غير مربوط</option>
                              {columns.map((column) => (
                                <option
                                  key={column.columnIndex}
                                  value={column.columnIndex}
                                  disabled={
                                    column.standardField !== null && column.standardField !== key
                                  }
                                >
                                  {column.headerRaw}
                                  {column.suggestedField === key
                                    ? " — مقترح"
                                    : column.standardField !== null && column.standardField !== key
                                      ? ` — مرتبط بـ ${STANDARD_FIELD_LABELS[column.standardField]}`
                                      : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                لا يمكن ربط عمود Excel بأكثر من حقل قياسي. الحقول التي لا يقابلها عمود في الملف يمكن
                تركها «غير مربوط».
              </p>
              {!columns.some((column) => column.standardField === "full_name") &&
              ["first_name", "father_name", "last_name"].every((key) =>
                columns.some((column) => column.standardField === key),
              ) ? (
                <p className="rounded-lg bg-primary/10 p-3 text-sm font-semibold text-primary">
                  سيُركّب الاسم الثلاثي تلقائيًا من الاسم واسم الأب والنسبة.
                </p>
              ) : null}
            </div>
          ) : null}
          {step === 3 ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-1 gap-2 bg-muted px-4 py-3 text-sm font-bold xl:grid-cols-[minmax(10rem,0.25fr)_1fr]">
                <span>العمود</span>
                <span className="hidden xl:block">الفئة</span>
              </div>
              {columns.map((column, index) => (
                <div
                  key={column.columnIndex}
                  className="grid grid-cols-1 gap-3 border-t p-3 xl:grid-cols-[minmax(10rem,0.25fr)_1fr] xl:items-center"
                >
                  <p className="text-sm font-semibold">{column.headerRaw}</p>
                  <CategorySelector
                    categories={categories}
                    value={column.categoryId}
                    onChange={(categoryId) => updateColumn(index, { categoryId })}
                    label={`فئة العمود ${column.headerRaw}`}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {step === 4 && sheet ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">اسم الملف</p>
                  <p className="mt-1 font-bold">{name}</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">عدد الصفوف</p>
                  <p className="mt-1 font-bold">{sheet.rowCount.toLocaleString("en-US")}</p>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs text-muted-foreground">الأعمدة القابلة للبحث</p>
                  <p className="mt-1 font-bold">
                    {columns.filter((column) => column.standardField).length} من {columns.length}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-max text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {columns.map((column) => (
                        <th key={column.columnIndex} className="p-3 text-right">
                          {column.headerRaw}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.preview.slice(0, 20).map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="max-w-56 truncate p-3 ltr-numbers text-right"
                          >
                            {columns[cellIndex]?.standardField === "sham_cash"
                              ? formatShamCash(cell) || "—"
                              : cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={confirmImport}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-4" />
                )}
                تأكيد وبدء الاستيراد
              </Button>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || busy}
            >
              <ChevronRight className="size-4" />
              السابق
            </Button>
            {step < 4 ? (
              <Button
                type="button"
                onClick={() => void goToNextStep()}
                disabled={!canContinue() || busy}
              >
                {busy && step === 1 ? <LoaderCircle className="size-4 animate-spin" /> : null}التالي
                <ChevronLeft className="size-4" />
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
