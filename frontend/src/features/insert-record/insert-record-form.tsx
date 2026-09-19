"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, PlusCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { STANDARD_FIELD_LABELS } from "@/lib/standard-fields";
import { hasPermission } from "@/lib/permissions";
import { ApiError } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import { groupsService } from "@/services/groups.service";
import { filesService } from "@/services/files.service";
import { recordsService, type ManualTemplate, type ManualTemplateColumn } from "@/services/records.service";
import type { FileItem, Group } from "@/types/model";
import { cn } from "@/lib/cn";

const UNIQUE_FIELDS = new Set(["national_id", "sham_cash", "personal_no", "phone"]);
const UNIQUE_HINT: Record<string, string> = {
  national_id: "الرقم الوطني — ممنوع التكرار داخل هذا الملف",
  sham_cash: "الشام كاش — ممنوع التكرار داخل هذا الملف",
  personal_no: "الرقم الذاتي — ممنوع التكرار داخل هذا الملف",
  phone: "رقم الهاتف — ممنوع التكرار داخل هذا الملف",
};
const NUMERIC_FIELDS = new Set(["national_id", "sham_cash", "personal_no", "phone"]);

// الحقول الشخصية: بلا اقتراحات (إدخال يدوي فقط).
const NO_SUGGEST_STANDARD = new Set([
  "national_id",
  "sham_cash",
  "personal_no",
  "phone",
  "first_name",
  "father_name",
  "last_name",
  "full_name",
  "mother_name",
]);

function headerSuggestBlocked(headerRaw: string): boolean {
  // احتياط للأعمدة غير المربوطة بحقل قياسي (مثل تاريخ الميلاد).
  const h = headerRaw.replace(/[\s_]+/g, " ").trim();
  if (/تاريخ/.test(h) && /(ميلاد|ولادة)/.test(h)) return true;
  if (/(وطني|قومي)/.test(h)) return true;
  if (/شام/.test(h)) return true;
  if (/ذاتي/.test(h)) return true;
  if (/(هاتف|موبايل|جوال)/.test(h)) return true;
  if (/(ثلاثي|الكامل|الأول|الاول)/.test(h) && /اسم/.test(h)) return true;
  if (/الكنية|النسبة|اللقب|الكنيه|النسبه/.test(h)) return true;
  if (/اسم/.test(h) && /(الأب|الاب|الوالد|الأم|الام|الوالده)/.test(h)) return true;
  return false;
}

function shouldSuggest(column: ManualTemplateColumn): boolean {
  if (column.standardField !== null && NO_SUGGEST_STANDARD.has(column.standardField)) return false;
  if (column.standardField === null && headerSuggestBlocked(column.headerRaw)) return false;
  return true;
}

function toLatinDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

function digitsOnly(value: string): string {
  return toLatinDigits(value).replace(/\D/g, "");
}

// فحص صيغة حقل واحد (القيم الفارغة مقبولة دائماً). يرجع رسالة الخطأ أو null.
function formatError(column: ManualTemplateColumn, rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;
  switch (column.standardField) {
    case "national_id": {
      const compact = toLatinDigits(value).replace(/\s/g, "");
      if (!/^[0-9]+$/.test(compact)) return "الرقم الوطني يجب أن يحتوي أرقامًا فقط.";
      const stripped = compact.replace(/^0+/, "") || "0";
      if (stripped.length < 9 || stripped.length > 11)
        return "الرقم الوطني يجب أن يتكون من 9 إلى 11 رقمًا.";
      return null;
    }
    case "sham_cash": {
      if (digitsOnly(value).length !== 16) return "رقم الشام كاش يجب أن يتكون من 16 رقمًا.";
      return null;
    }
    case "phone": {
      const len = digitsOnly(value).length;
      if (len < 7 || len > 15) return "رقم الهاتف يجب أن يتكون من 7 إلى 15 رقمًا.";
      return null;
    }
    case "functional_category": {
      if (/^[1-5]$/.test(value.trim())) return null;
      if (/(اول|أول|ثان|ثالث|ثلث|رابع|خامس|خمس)/.test(value)) return null;
      return "الفئة الوظيفية غير معروفة (1-5 أو الأولى…الخامسة).";
    }
    default:
      return null;
  }
}

// ربط رسالة التكرار من الخادم بعمود (الوطني/شام/ذاتي/هاتف).
function duplicateFieldKey(message: string): string | null {
  if (/الوطني/.test(message)) return "national_id";
  if (/شام/.test(message)) return "sham_cash";
  if (/الذاتي/.test(message)) return "personal_no";
  if (/الهاتف/.test(message)) return "phone";
  return null;
}

type CategoryGroup = {
  key: string;
  name: string;
  order: number;
  columns: ManualTemplateColumn[];
};

function groupByCategory(columns: ManualTemplateColumn[]): CategoryGroup[] {
  const byKey = new Map<string, CategoryGroup>();
  for (const column of columns) {
    const key = column.categoryId ?? "other";
    const group = byKey.get(key) ?? {
      key,
      name: column.categoryName ?? "أخرى",
      order: column.categoryOrder ?? Number.MAX_SAFE_INTEGER,
      columns: [],
    };
    group.columns.push(column);
    byKey.set(key, group);
  }
  return Array.from(byKey.values())
    .map((g) => ({ ...g, columns: [...g.columns].sort((a, b) => a.columnIndex - b.columnIndex) }))
    .sort((a, b) => a.order - b.order);
}

function fieldLabel(column: ManualTemplateColumn): string {
  if (column.standardField && column.standardField in STANDARD_FIELD_LABELS) {
    return STANDARD_FIELD_LABELS[column.standardField as keyof typeof STANDARD_FIELD_LABELS];
  }
  return column.headerRaw;
}

export function InsertRecordForm() {
  const [canInsert, setCanInsert] = useState<boolean | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [groupId, setGroupId] = useState("");
  const [fileId, setFileId] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [template, setTemplate] = useState<ManualTemplate | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeStep, setActiveStep] = useState(0);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [loadingSuggest, setLoadingSuggest] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ id: string; rowIndex: number } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [me, list] = await Promise.all([authService.me(), groupsService.list()]);
        if (!active) return;
        const perms = me?.permissions ?? [];
        setCanInsert(hasPermission(perms, "records.view"));
        setCanCreate(hasPermission(perms, "records.create"));
        setGroups(list);
      } catch {
        if (active) setCanInsert(false);
      } finally {
        if (active) setLoadingGroups(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onGroupChange(next: string) {
    setGroupId(next);
    setFileId("");
    setTemplate(null);
    setValues({});
    setActiveStep(0);
    setCreated(null);
    setSaveError(null);
    setStepError(null);
    setFieldErrors({});
    if (!next) {
      setFiles([]);
      return;
    }
    setLoadingFiles(true);
    try {
      const list = await filesService.listByGroup(next);
      setFiles(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحميل ملفات المجموعة.");
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }

  async function onFileChange(next: string) {
    setFileId(next);
    setTemplate(null);
    setValues({});
    setActiveStep(0);
    setCreated(null);
    setSaveError(null);
    setStepError(null);
    setFieldErrors({});
    setSuggestions({});
    if (!next) return;
    setLoadingTemplate(true);
    setTemplateError(null);
    try {
      const tpl = await recordsService.template(next);
      setTemplate(tpl);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "تعذر تحميل أعمدة الملف.");
    } finally {
      setLoadingTemplate(false);
    }
  }

  const categoryGroups = useMemo(
    () => (template ? groupByCategory(template.columns) : []),
    [template],
  );
  const activeGroup = categoryGroups[activeStep];

  // اقتراحات الفئة النشطة: فقط للأعمدة غير الشخصية (الحقول الشخصية إدخال يدوي فقط).
  useEffect(() => {
    if (!template || !activeGroup) return;
    let active = true;
    void (async () => {
      const suggestible = activeGroup.columns.filter(shouldSuggest);
      const missing = suggestible.filter((c) => suggestions[c.id] === undefined);
      // علّم الأعمدة الشخصية كمنتهية كي لا تُطلب اقتراحاتها أبداً.
      const blocked = activeGroup.columns.filter((c) => !shouldSuggest(c) && suggestions[c.id] === undefined);
      if (blocked.length > 0 && active) {
        setSuggestions((cur) => {
          const next = { ...cur };
          for (const c of blocked) next[c.id] = [];
          return next;
        });
      }
      if (missing.length === 0) return;
      setLoadingSuggest((cur) => {
        const next = { ...cur };
        for (const c of missing) next[c.id] = true;
        return next;
      });
      await Promise.all(
        missing.map(async (column) => {
          try {
            const res = await recordsService.suggestions(template.fileId, {
              columnId: column.id,
              take: 50,
            });
            if (active) setSuggestions((cur) => ({ ...cur, [column.id]: res.values }));
          } catch {
            if (active) setSuggestions((cur) => ({ ...cur, [column.id]: [] }));
          }
        }),
      );
      if (active) {
        setLoadingSuggest((cur) => {
          const next = { ...cur };
          for (const c of missing) next[c.id] = false;
          return next;
        });
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.fileId, activeStep]);

  function setValue(columnId: string, value: string) {
    setValues((cur) => ({ ...cur, [columnId]: value }));
    setFieldErrors((cur) => {
      if (!(columnId in cur)) return cur;
      const next = { ...cur };
      delete next[columnId];
      return next;
    });
  }

  const filledCount = useMemo(
    () => Object.values(values).filter((v) => v.trim().length > 0).length,
    [values],
  );

  // فحص صيغة حقول خطوة واحدة محلياً. يرجع true عند عدم وجود أخطاء.
  function checkStepFormat(stepIndex: number): boolean {
    const group = categoryGroups[stepIndex];
    if (!group) return true;
    const errors: Record<string, string> = {};
    for (const column of group.columns) {
      const err = formatError(column, values[column.id] ?? "");
      if (err) errors[column.id] = err;
    }
    setFieldErrors((cur) => {
      const next = { ...cur };
      for (const column of group.columns) delete next[column.id];
      return { ...next, ...errors };
    });
    if (Object.keys(errors).length > 0) {
      setStepError("راجع الحقول المحددة بالأحمر في هذه الفئة قبل المتابعة.");
      return false;
    }
    return true;
  }

  // فحص التكرار داخل الملف عبر الخادم. يرجع true عند السلامة.
  async function checkDuplicates(): Promise<boolean> {
    if (!template) return true;
    try {
      await recordsService.validateManual(template.fileId, values);
      return true;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "تعذر التحقق من البيانات.";
      const key = duplicateFieldKey(message);
      if (key && template) {
        const column = template.columns.find((c) => c.standardField === key);
        if (column) {
          setFieldErrors((cur) => ({ ...cur, [column.id]: message }));
          setStepError(message);
          const idx = categoryGroups.findIndex((g) => g.columns.some((c) => c.id === column.id));
          if (idx >= 0) setActiveStep(idx);
          return false;
        }
      }
      setStepError(message);
      return false;
    }
  }

  // زر "الفئة التالية": فحص الصيغة ثم التكرار قبل المتابعة.
  async function handleNext() {
    if (!template || validating || saving) return;
    setStepError(null);
    if (!checkStepFormat(activeStep)) return;
    setValidating(true);
    try {
      if (!(await checkDuplicates())) return;
      setActiveStep((s) => Math.min(categoryGroups.length - 1, s + 1));
    } finally {
      setValidating(false);
    }
  }

  // التنقل عبر تبويبات الفئات: الرجوع حر، والتقدم للأمام يفحص الخطوات الوسيطة.
  async function handleGotoStep(target: number) {
    if (target === activeStep || validating || saving) return;
    if (target < activeStep) {
      setStepError(null);
      setActiveStep(target);
      return;
    }
    setStepError(null);
    for (let step = activeStep; step < target; step++) {
      if (!checkStepFormat(step)) {
        setActiveStep(step);
        return;
      }
    }
    setValidating(true);
    try {
      if (!(await checkDuplicates())) return;
      setActiveStep(target);
    } finally {
      setValidating(false);
    }
  }

  async function handleSave() {
    if (!template || saving) return;
    setSaveError(null);
    setStepError(null);
    setCreated(null);
    if (!canCreate) {
      setSaveError("لا تملك صلاحية إدخال سجل جديد (records.create).");
      return;
    }
    if (filledCount === 0) {
      setSaveError("أدخل قيمة واحدة على الأقل قبل الحفظ.");
      return;
    }
    // فحص شامل لكل الفئات قبل الحفظ النهائي.
    let firstBad = -1;
    const allErrors: Record<string, string> = {};
    categoryGroups.forEach((group, gi) => {
      for (const column of group.columns) {
        const err = formatError(column, values[column.id] ?? "");
        if (err) {
          allErrors[column.id] = err;
          if (firstBad < 0) firstBad = gi;
        }
      }
    });
    if (firstBad >= 0) {
      setFieldErrors((cur) => ({ ...cur, ...allErrors }));
      setActiveStep(firstBad);
      setSaveError("راجع الحقول المحددة بالأحمر قبل الحفظ.");
      return;
    }
    setSaving(true);
    try {
      const result = await recordsService.createManual(template.fileId, values);
      setCreated({ id: result.id, rowIndex: result.rowIndex });
      toast.success(`تم إدخال السجل الجديد بنجاح — صف ${result.rowIndex}.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "تعذر حفظ السجل.";
      const key = duplicateFieldKey(message);
      if (key) {
        const column = template.columns.find((c) => c.standardField === key);
        if (column) {
          setFieldErrors((cur) => ({ ...cur, [column.id]: message }));
          const idx = categoryGroups.findIndex((g) => g.columns.some((c) => c.id === column.id));
          if (idx >= 0) setActiveStep(idx);
        }
      }
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setValues({});
    setActiveStep(0);
    setCreated(null);
    setSaveError(null);
    setStepError(null);
    setFieldErrors({});
  }

  if (loadingGroups || canInsert === null) {
    return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (!canInsert) {
    return (
      <div className="space-y-7">
        <PageHeader
          eyebrow="إدخال يدوي"
          title="إدخال سجل جديد"
          description="إضافة سجل واحد يدوياً إلى ملف موجود، مقسماً حسب الفئات."
        />
        <p role="alert" className="rounded-lg bg-destructive/10 p-4 text-sm font-semibold text-destructive">
          لا تملك صلاحية إظهار صفحة إدخال السجلات. تواصل مع مدير النظام لمنحك الصلاحية.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="إدخال يدوي"
        title="إدخال سجل جديد"
        description="أولاً حدد المجموعة والملف، ثم عبئ البيانات حسب الفئات: البيانات الشخصية أولاً ثم الفئات التالية. الحقول الأربعة المميزة لا تتكرر داخل الملف الواحد."
      />

      <Card>
        <CardHeader>
          <CardTitle>1 — المجموعة والملف</CardTitle>
          <CardDescription>اختر أين سيُضاف السجل الجديد. الأعمدة والفئات تختلف من ملف لآخر.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="insert-group">المجموعة</Label>
            <select
              id="insert-group"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={groupId}
              onChange={(e) => void onGroupChange(e.target.value)}
            >
              <option value="">— اختر المجموعة —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="insert-file">الملف</Label>
            <select
              id="insert-file"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={fileId}
              disabled={!groupId || loadingFiles}
              onChange={(e) => void onFileChange(e.target.value)}
            >
              <option value="">{loadingFiles ? "جارٍ تحميل الملفات…" : "— اختر الملف —"}</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.rowCount} سجل)
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {loadingTemplate ? (
        <p className="text-sm text-muted-foreground">جارٍ تحميل أعمدة الملف وفئاتها…</p>
      ) : null}
      {templateError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {templateError}
        </p>
      ) : null}

      {template && categoryGroups.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>2 — تعبئة البيانات حسب الفئات</CardTitle>
            <CardDescription>
              {template.groupName} — {template.fileName} — {template.columns.length} عمود في {categoryGroups.length}{" "}
              فئات. معبأ {filledCount} حقل.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="overflow-x-auto" role="tablist" aria-label="فئات الأعمدة">
              <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
                {categoryGroups.map((group, index) => (
                  <button
                    key={group.key}
                    type="button"
                    role="tab"
                    aria-selected={activeStep === index}
                    onClick={() => void handleGotoStep(index)}
                    className={cn(
                      "rounded-md px-4 py-2 text-sm font-bold",
                      activeStep === index ? "bg-background shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {index + 1}. {group.name}
                  </button>
                ))}
              </div>
            </div>

            {activeGroup ? (
              <section aria-label={activeGroup.name} className="space-y-4">
                <h2 className="text-base font-bold">
                  الفئة {activeStep + 1} من {categoryGroups.length}: {activeGroup.name}
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeGroup.columns.map((column) => {
                    const isUnique = column.standardField !== null && UNIQUE_FIELDS.has(column.standardField);
                    const isNumeric = column.standardField !== null && NUMERIC_FIELDS.has(column.standardField);
                    const suggest = shouldSuggest(column);
                    const listId = `suggest-${column.id}`;
                    const opts = suggest ? (suggestions[column.id] ?? []) : [];
                    const fieldErr = fieldErrors[column.id];
                    return (
                      <div
                        key={column.id}
                        className={cn(
                          "space-y-2 rounded-xl border bg-card p-4",
                          fieldErr && "border-destructive",
                        )}
                      >
                        <Label htmlFor={`col-${column.id}`} className="flex flex-col gap-1">
                          <span className="font-bold">{column.headerRaw}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {fieldLabel(column)}
                            {isUnique && column.standardField ? ` — ${UNIQUE_HINT[column.standardField]}` : ""}
                          </span>
                        </Label>
                        <Input
                          id={`col-${column.id}`}
                          value={values[column.id] ?? ""}
                          list={opts.length > 0 ? listId : undefined}
                          onChange={(e) => setValue(column.id, e.target.value)}
                          placeholder={suggest ? "اختر من الاقتراحات أو اكتب يدوياً…" : "اكتب القيمة…"}
                          dir={isNumeric ? "ltr" : undefined}
                          inputMode={isNumeric ? "numeric" : undefined}
                          className={isNumeric ? "text-left" : undefined}
                          aria-invalid={fieldErr ? true : undefined}
                          autoComplete="off"
                        />
                        {opts.length > 0 ? (
                          <datalist id={listId}>
                            {opts.map((opt) => (
                              <option key={opt} value={opt} />
                            ))}
                          </datalist>
                        ) : null}
                        {fieldErr ? (
                          <p role="alert" className="text-xs font-semibold text-destructive">
                            {fieldErr}
                          </p>
                        ) : loadingSuggest[column.id] ? (
                          <p className="text-xs text-muted-foreground">جارٍ تحميل الاقتراحات…</p>
                        ) : opts.length > 0 ? (
                          <p className="text-xs text-muted-foreground">{opts.length} اقتراح من بيانات الملف.</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {stepError ? (
                  <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
                    {stepError}
                  </p>
                ) : null}
                {saveError ? (
                  <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
                    {saveError}
                  </p>
                ) : null}
                {created ? (
                  <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <CheckCircle2 className="size-5 text-primary" />
                    <p className="text-sm font-bold">تم حفظ السجل الجديد — صف {created.rowIndex}.</p>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/records/${created.id}`} target="_blank" rel="noopener noreferrer">
                          عرض السجل
                        </Link>
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={handleReset}>
                        <RotateCcw className="size-4" />
                        إدخال سجل آخر
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={activeStep === 0 || saving || validating}
                    onClick={() => {
                      setStepError(null);
                      setActiveStep((s) => Math.max(0, s - 1));
                    }}
                  >
                    <ArrowRight className="size-4" />
                    الفئة السابقة
                  </Button>
                  {activeStep < categoryGroups.length - 1 ? (
                    <Button type="button" disabled={validating || saving} onClick={() => void handleNext()}>
                      {validating ? <Loader2 className="size-4 animate-spin" /> : null}
                      {validating ? "جارٍ التحقق…" : "الفئة التالية"}
                      {validating ? null : <ArrowLeft className="size-4" />}
                    </Button>
                  ) : (
                    <div className="flex flex-col items-end gap-2">
                      {!canCreate ? (
                        <p className="text-xs text-muted-foreground">العرض مسموح، لكن الحفظ يحتاج صلاحية «إدخال سجل جديد».</p>
                      ) : null}
                      <Button
                        type="button"
                        disabled={saving || filledCount === 0 || !canCreate}
                        onClick={() => void handleSave()}
                        title={canCreate ? undefined : "لا تملك صلاحية إدخال سجل جديد"}
                      >
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
                        {saving ? "جارٍ الحفظ…" : "حفظ السجل الجديد"}
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
