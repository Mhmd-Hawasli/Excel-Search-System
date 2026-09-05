"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, LoaderCircle, Save, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { STANDARD_FIELD_KEYS } from "@/lib/excel/types";
import type { StandardFieldKey } from "@/lib/excel/types";
import { STANDARD_FIELD_LABELS } from "@/lib/excel/standard-field-catalog";
import { CategorySelector } from "@/features/categories/category-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CategoryOption = { id: string; name: string };
type ColumnOption = {
  id: string;
  headerRaw: string;
  headerNormalized: string;
  columnIndex: number;
  standardField: StandardFieldKey | null;
  categoryId: string | null;
};

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function EditMappingWizard({
  fileId,
  groupId,
  fileName,
  initialColumns,
  categories,
}: {
  fileId: string;
  groupId: string;
  fileName: string;
  initialColumns: ColumnOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [columns, setColumns] = useState<ColumnOption[]>(() => [...initialColumns].sort((a, b) => a.columnIndex - b.columnIndex));
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0: حقول البحث  1: الفئات  2: المعاينة والتأكيد
  const [busy, setBusy] = useState(false);

  function linkStandardField(standardField: StandardFieldKey, selectedColumnId: string) {
    const targetId = selectedColumnId === "" ? null : selectedColumnId;
    setColumns((current) =>
      current.map((col) => {
        if (col.standardField === standardField) return { ...col, standardField: null };
        if (targetId !== null && col.id === targetId) return { ...col, standardField };
        return col;
      }),
    );
  }

  function updateCategory(columnId: string, categoryId: string | null) {
    setColumns((current) =>
      current.map((col) => (col.id === columnId ? { ...col, categoryId } : col)),
    );
  }

  function canSave() {
    const seen = new Set<string>();
    for (const col of columns) {
      if (!col.standardField) continue;
      if (seen.has(col.standardField)) return false;
      seen.add(col.standardField);
    }
    return true;
  }

  async function handleSave() {
    if (!canSave()) {
      toast.error("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/files/${fileId}/mapping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          columns: columns.map((col) => ({
            id: col.id,
            standardField: col.standardField,
            categoryId: col.categoryId,
          })),
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; updatedRecords?: number };
      if (!response.ok || !result.ok) {
        toast.error(result.error ?? "تعذر حفظ التعديلات.");
        setBusy(false);
        return;
      }
      toast.success(`تم تحديث الربط وإعادة حساب ${result.updatedRecords ?? 0} سجل بنجاح.`);
      router.push(`/groups/${groupId}/files/${fileId}`);
      router.refresh();
    } catch {
      toast.error("تعذر الاتصال بالخادم. حاول مجددًا.");
      setBusy(false);
    }
  }

  const mappedCount = columns.filter((c) => c.standardField).length;
  const hasFullNameFallback =
    !columns.some((c) => c.standardField === "full_name") &&
    (["first_name", "father_name", "last_name"] as StandardFieldKey[]).every((key) =>
      columns.some((c) => c.standardField === key),
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/groups/${groupId}/files/${fileId}`}>
            <ArrowRight className="size-4" />
            العودة إلى تفاصيل الملف
          </Link>
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">الملف: {fileName}</CardTitle>
          <CardDescription>
            تعديل شامل — نفس واجهة الرفع: حدد الأعمدة المرجعية (حقول البحث) والفئات، وسيُعاد حساب جميع البيانات المحفوظة كأنك حدثت الملف.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">{columns.length} عمود</Badge>
          <Badge variant="outline">{mappedCount} حقل مربوط</Badge>
          <Badge variant="outline">{categories.length} فئة متاحة</Badge>
        </CardContent>
      </Card>

      <ol className="grid grid-cols-3 gap-2" aria-label="خطوات التعديل">
        {["حقول البحث", "فئات الأعمدة", "المعاينة والتأكيد"].map((label, index) => (
          <li
            key={label}
            className={`rounded-lg border px-3 py-3 text-sm font-bold ${index === step ? "border-primary bg-primary text-primary-foreground" : index < step ? "border-primary/30 bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}
          >
            <span className="ms-1">{index + 1}.</span> {label}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{step === 0 ? "حقول البحث" : step === 1 ? "فئات الأعمدة" : "المعاينة والتأكيد"}</CardTitle>
          <CardDescription>
            {step === 0
              ? "لكل حقل قياسي ثابت في النظام، اختر عمود Excel الذي يحتوي قيمه. التغيير سيُحدّث البحث والربط عبر الرقم الوطني."
              : step === 1
                ? "وزع الأعمدة على تبويبات صفحة التفاصيل؛ غير المصنف يذهب إلى «أخرى»."
                : "راجع التغييرات قبل الحفظ — سيتم إعادة حساب كل السجلات المحفوظة لهذا الملف."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 ? (
            <div className="space-y-4">
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
                      const linked = columns.find((c) => c.standardField === key);
                      return (
                        <tr key={key} className="border-t">
                          <th scope="row" className="p-3 text-right font-semibold">
                            {STANDARD_FIELD_LABELS[key]}
                          </th>
                          <td className="p-3">
                            <select
                              className={selectClass}
                              aria-label={`عمود Excel المرتبط بحقل ${STANDARD_FIELD_LABELS[key]}`}
                              value={linked ? linked.id : ""}
                              onChange={(event) => linkStandardField(key, event.target.value)}
                            >
                              <option value="">غير مربوط</option>
                              {columns.map((col) => (
                                <option
                                  key={col.id}
                                  value={col.id}
                                  disabled={col.standardField !== null && col.standardField !== key}
                                >
                                  {col.headerRaw}
                                  {col.standardField !== null && col.standardField !== key
                                    ? ` — مرتبط بـ ${STANDARD_FIELD_LABELS[col.standardField]}`
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
              {hasFullNameFallback ? (
                <p className="rounded-lg bg-primary/10 p-3 text-sm font-semibold text-primary">
                  سيُركّب الاسم الثلاثي تلقائيًا من الاسم واسم الأب والنسبة.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                لا يمكن ربط عمود واحد بأكثر من حقل. الحقول غير المربوطة ستصبح غير قابلة للبحث.
              </p>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-1 gap-2 bg-muted px-4 py-3 text-sm font-bold xl:grid-cols-[minmax(12rem,0.3fr)_1fr]">
                <span>العمود</span>
                <span className="hidden xl:block">الفئة</span>
              </div>
              {columns.map((col) => (
                <div
                  key={col.id}
                  className="grid grid-cols-1 gap-3 border-t p-3 xl:grid-cols-[minmax(12rem,0.3fr)_1fr] xl:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold">{col.headerRaw}</p>
                    <p className="text-xs text-muted-foreground">
                      {col.standardField ? STANDARD_FIELD_LABELS[col.standardField] : "غير مربوط بحقل قياسي"}
                    </p>
                  </div>
                  <CategorySelector
                    categories={categories}
                    value={col.categoryId}
                    onChange={(categoryId) => updateCategory(col.id, categoryId)}
                    label={`فئة العمود ${col.headerRaw}`}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-4">
                <h4 className="font-bold">ملخص التغييرات</h4>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الحقول المربوطة</span>
                    <span className="font-bold">{mappedCount} / {columns.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الفئات المستخدمة</span>
                    <span className="font-bold">{new Set(columns.map((c) => c.categoryId ?? "other")).size}</span>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="p-2 text-right font-semibold">العمود</th>
                        <th className="p-2 text-right font-semibold">حقل البحث</th>
                        <th className="p-2 text-right font-semibold">الفئة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((col) => (
                        <tr key={col.id} className="border-t">
                          <td className="p-2 font-medium">{col.headerRaw}</td>
                          <td className="p-2">
                            {col.standardField ? (
                              <Badge variant="secondary" className="text-xs">
                                {STANDARD_FIELD_LABELS[col.standardField]}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2 text-xs">
                            {col.categoryId ? categories.find((c) => c.id === col.categoryId)?.name ?? "—" : "أخرى"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 rounded-lg bg-amber-500/10 p-3 text-sm font-medium text-amber-900 dark:text-amber-200">
                  عند الحفظ سيتم تعديل قاعدة البيانات مباشرة: تُحدّث الأعمدة المرجعية والفئات، ويُعاد حساب أعمدة البحث (النص المطبّع والأرقام) ومؤشرات التطابق لكل سجلات هذا الملف دون إعادة رفع Excel.
                </p>
              </div>
              <Button onClick={handleSave} disabled={busy} size="lg" className="w-full">
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                حفظ التعديل وتحديث جميع البيانات
              </Button>
              {busy ? <p className="text-center text-sm text-muted-foreground">جارٍ حفظ التعديلات وإعادة حساب السجلات… قد تستغرق العملية ثوانٍ للملفات الكبيرة.</p> : null}
            </div>
          ) : null}

          <div className="flex justify-between border-t pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => (s === 0 ? s : ((s - 1) as typeof s)))}
              disabled={step === 0 || busy}
            >
              <ChevronRight className="size-4" /> السابق
            </Button>
            {step < 2 ? (
              <Button type="button" onClick={() => setStep((s) => (s + 1) as typeof s)} disabled={busy}>
                التالي <Check className="size-4" />
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={busy}>
                مراجعة الحقول
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
