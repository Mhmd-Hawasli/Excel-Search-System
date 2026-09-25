"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, LoaderCircle, Save, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { StandardFieldKey } from "@/lib/standard-fields";
import { STANDARD_FIELD_KEYS, STANDARD_FIELD_LABELS } from "@/lib/standard-fields";
import { CategorySelector } from "@/features/categories/category-selector";
import { FieldMappingSelect } from "@/features/fields/field-mapping-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/services/api-client";
import { filesService } from "@/services/files.service";

type CategoryOption = { id: string; name: string };
type ColumnOption = {
  id: string;
  headerRaw: string;
  headerNormalized: string;
  columnIndex: number;
  standardField: StandardFieldKey | null;
  categoryId: string | null;
};

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
  // id of the column acting as the pk key. Changing it destroys every stored
  // record of the file, so a change requires an explicit acknowledgment.
  const [initialPkColumnId] = useState(
    () => initialColumns.find((col) => col.headerRaw.trim().toLowerCase() === "pk")?.id ?? "",
  );
  const [pkColumnId, setPkColumnId] = useState(initialPkColumnId);
  const [pkConfirm, setPkConfirm] = useState(false);
  const pkChanged = pkColumnId !== initialPkColumnId;

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

  function linkPkColumn(selectedColumnId: string) {
    setPkColumnId(selectedColumnId);
    // A fresh acknowledgment is required for every new key choice.
    if (selectedColumnId !== initialPkColumnId) setPkConfirm(false);
    if (selectedColumnId === "") return;
    // The key column is reserved: it carries no standard field or category.
    setColumns((current) =>
      current.map((col) =>
        col.id === selectedColumnId ? { ...col, standardField: null, categoryId: null } : col,
      ),
    );
  }

  function updateCategory(columnId: string, categoryId: string | null) {
    setColumns((current) =>
      current.map((col) => (col.id === columnId ? { ...col, categoryId } : col)),
    );
  }

  function canSave() {
    if (pkColumnId === "") return false;
    if (pkChanged && !pkConfirm) return false;
    const seen = new Set<string>();
    for (const col of columns) {
      if (!col.standardField) continue;
      if (seen.has(col.standardField)) return false;
      seen.add(col.standardField);
    }
    return true;
  }

  async function handleSave() {
    if (pkColumnId === "") {
      toast.error("يجب تحديد عمود مفتاح الربط الرئيسي (pk) أولًا.");
      return;
    }
    if (pkChanged && !pkConfirm) {
      toast.error("أكّد أولًا أنك تفهم أن تغيير المفتاح سيحذف جميع السجلات.");
      return;
    }
    if (!canSave()) {
      toast.error("لا يمكن ربط حقل قياسي واحد بأكثر من عمود.");
      return;
    }
    setBusy(true);
    try {
      const updatedRecords = await filesService.updateMapping(
        fileId,
        columns.map((col) => ({
          id: col.id,
          standardField: col.id === pkColumnId ? null : col.standardField,
          categoryId: col.id === pkColumnId ? null : col.categoryId,
        })),
        { pkColumnId, confirmPkChange: pkChanged && pkConfirm },
      );
      toast.success(
        pkChanged
          ? "تم تغيير مفتاح الربط وحذف جميع السجلات التابعة لهذا الملف."
          : `تم تحديث الربط وإعادة حساب ${updatedRecords} سجل بنجاح.`,
      );
      router.push(`/groups/${groupId}/files/${fileId}`);
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "تعذر الاتصال بالخادم. حاول مجددًا.");
    } finally {
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
                    <tr className="border-t bg-muted/30">
                      <th scope="row" className="p-3 text-right font-semibold">pk — مفتاح الربط الرئيسي</th>
                      <td className="p-3">
                        <FieldMappingSelect
                          ariaLabel="عمود Excel المرتبط بمفتاح pk"
                          value={pkColumnId}
                          onChange={linkPkColumn}
                          searchLabel="بحث في الخيارات"
                          unmappedLabel="اختر عمود المفتاح…"
                          options={[
                            { value: "", label: "غير مربوط" },
                            ...columns.map((col) => ({
                              value: col.id,
                              label:
                                col.headerRaw +
                                (col.id === initialPkColumnId ? " (الحالي)" : "") +
                                (col.standardField !== null
                                  ? ` — مرتبط بـ ${STANDARD_FIELD_LABELS[col.standardField]}`
                                  : ""),
                            })),
                          ]}
                        />
                      </td>
                    </tr>
                    {STANDARD_FIELD_KEYS.map((key) => {
                      const linked = columns.find((c) => c.standardField === key);
                      return (
                        <tr key={key} className="border-t">
                          <th scope="row" className="p-3 text-right font-semibold">
                            {STANDARD_FIELD_LABELS[key]}
                          </th>
                          <td className="p-3">
                            <FieldMappingSelect
                              ariaLabel={`عمود Excel المرتبط بحقل ${STANDARD_FIELD_LABELS[key]}`}
                              value={linked ? linked.id : ""}
                              onChange={(next) => linkStandardField(key, next)}
                              options={[
                                { value: "", label: "غير مربوط" },
                                ...columns.filter((col) => col.id !== pkColumnId).map((col) => ({
                                  value: col.id,
                                  label:
                                    col.headerRaw +
                                    (col.standardField !== null && col.standardField !== key
                                      ? ` — مرتبط بـ ${STANDARD_FIELD_LABELS[col.standardField]}`
                                      : ""),
                                  disabled:
                                    col.standardField !== null && col.standardField !== key,
                                })),
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pkChanged ? (
                <div
                  role="alert"
                  className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
                >
                  <p className="text-sm font-bold text-destructive">
                    تحذير: تغيير مفتاح الربط الرئيسي سيحذف جميع السجلات التابعة لهذا الملف نهائيًا ولا يمكن التراجع عن ذلك.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    بعد الحفظ سيصبح الملف فارغًا (عدد السجلات صفرًا) وسيُعاد المفتاح التسلسلي إلى 1،
                    وستُحذف مع السجلات تقارير الجودة وسجل التعديلات المرتبطة بها.
                  </p>
                  <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-destructive"
                      checked={pkConfirm}
                      onChange={(event) => setPkConfirm(event.target.checked)}
                    />
                    أفهم أن جميع السجلات سيتم حذفها نهائيًا وأوافق على المتابعة.
                  </label>
                </div>
              ) : null}
              {pkColumnId === "" ? (
                <p className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
                  يجب تحديد عمود مفتاح الربط الرئيسي (pk) قبل الحفظ.
                </p>
              ) : null}
              {hasFullNameFallback ? (
                <p className="rounded-lg bg-primary/10 p-3 text-sm font-semibold text-primary">
                  سيُركّب الاسم الثلاثي تلقائيًا من الاسم واسم الأب والنسبة.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                لا يمكن ربط عمود واحد بأكثر من حقل. الحقول غير المربوطة ستصبح غير قابلة للبحث.
                عمود المفتاح المحدد يُستبعد تلقائيًا من الحقول والفئات.
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
                  {col.id === pkColumnId ? (
                    <p className="text-sm text-muted-foreground">
                      مفتاح الربط الرئيسي — لا يمكن ربطه بحقل قياسي أو تصنيفه ضمن فئة.
                      {pkChanged && col.id !== initialPkColumnId ? " (المفتاح الجديد)" : ""}
                    </p>
                  ) : (
                    <CategorySelector
                      categories={categories}
                      value={col.categoryId}
                      onChange={(categoryId) => updateCategory(col.id, categoryId)}
                      label={`فئة العمود ${col.headerRaw}`}
                    />
                  )}
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
                    <span className="text-muted-foreground">مفتاح الربط الرئيسي</span>
                    <span className="font-bold">
                      {columns.find((c) => c.id === pkColumnId)?.headerRaw ?? "—"}
                      {pkChanged ? " (سيتغير — تُحذف السجلات)" : ""}
                    </span>
                  </div>
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
                {pkChanged ? (
                  <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-bold text-destructive">
                    سيتم حذف جميع السجلات التابعة لهذا الملف نهائيًا بسبب تغيير المفتاح.
                    {pkConfirm ? "" : " أكّد الموافقة من خطوة «حقول البحث» أولًا."}
                  </p>
                ) : null}
              </div>
              <Button
                onClick={handleSave}
                disabled={busy || !canSave()}
                size="lg"
                className="w-full"
                variant={pkChanged ? "destructive" : "default"}
              >
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                {pkChanged ? "حفظ وتغيير المفتاح (سيحذف جميع السجلات)" : "حفظ التعديل وتحديث جميع البيانات"}
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
