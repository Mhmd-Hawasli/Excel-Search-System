"use client";

import { AlertTriangle, Files, ListMinus, RefreshCw, Users, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CONFLICT_CATEGORIES, CONFLICT_FIELDS, CONFLICT_RULES } from "@/lib/conflicts-catalog";
import { cn } from "@/lib/cn";

const icons = { invalid: AlertTriangle, missing: ListMinus, similar: Users, conflicting: Files } as const;

export interface ConflictFilterState {
  category: string;
  field: string;
  rule: string;
  pageSize: number;
}

/**
 * Client filter panel for the conflicts page. Category cards plus dependent
 * field/rule selectors; illegal combinations reset to "all" like V1.
 */
export function ConflictFilters({
  value,
  onChange,
  onRefresh,
  refreshing,
  canEdit,
  counts,
}: {
  value: ConflictFilterState;
  onChange: (next: ConflictFilterState, resetPage: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  canEdit: boolean;
  counts?: Record<string, number>;
}) {
  const { category, field, rule, pageSize } = value;
  const categoryRules = CONFLICT_RULES.filter((item) => item.category === category);
  const fields = Array.from(new Set(categoryRules.map((item) => item.field)));
  const rules = categoryRules.filter((item) => field === "all" || item.field === field);

  function setCategory(next: string) {
    onChange({ category: next, field: "all", rule: "all", pageSize }, true);
  }

  return (
    <section aria-label="فلاتر تضارب البيانات" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="الحالات الرئيسية">
        {CONFLICT_CATEGORIES.map((item) => {
          const Icon = icons[item.key as keyof typeof icons] ?? Files;
          const active = category === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              disabled={!canEdit}
              onClick={() => setCategory(item.key)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-5 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70",
                active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/50",
              )}
            >
              <span className={cn("rounded-lg p-2.5", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="flex items-center gap-2 font-bold">
                  {item.label}
                  {counts ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                      {(counts[item.key] ?? 0).toLocaleString("en-US")}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs leading-6 text-muted-foreground">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Filter className="size-4 text-primary" aria-hidden="true" />
            تصفية الحالات
          </div>
          <div className="grid items-end gap-4 md:grid-cols-[1fr_2fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="conflict-field">الحقل</Label>
              <select
                id="conflict-field"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={field}
                disabled={!canEdit}
                onChange={(e) => onChange({ category, field: e.target.value, rule: "all", pageSize }, true)}
              >
                <option value="all">جميع الحقول</option>
                {fields.map((item) => (
                  <option key={item} value={item}>
                    {CONFLICT_FIELDS[item] ?? item}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conflict-rule">الحالة الفرعية</Label>
              <select
                id="conflict-rule"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={rule}
                disabled={!canEdit}
                onChange={(e) => onChange({ category, field, rule: e.target.value, pageSize }, true)}
              >
                <option value="all">جميع الحالات الفرعية</option>
                {rules.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden="true" />
              تحديث الفحص
            </Button>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {category === "invalid" &&
              "تُقبل الأرقام العربية وتُحذف الفراغات من الرقم الوطني والشام كاش. يُفحص طول الرقم الوطني كرقم قبل تعبئة الأصفار: 8 أرقام أو أقل، و12 رقماً أو أكثر، مشكلة تكامل. يُعرض بـ11 خانة دون اقتطاع الأرقام الأطول. الشام كاش مطلوب 16 خانة. يُقارن الاسم الثلاثي بالاسم + اسم الأب + النسبة بعد التطبيع. تُفحص القيم غير الفارغة في أعمدة «تاريخ». الفئة الوظيفية تُحوَّل من أي صيغة عربية أو رقمية إلى 1–5؛ النص غير المعروف يُخزن 0 ويظهر هنا."}
            {category === "missing" &&
              "يُفحص الرقم الوطني والشام كاش والرقم الذاتي واسم الأم في جميع السجلات. يُفحص الاسم الثلاثي والاسم واسم الأب والنسبة عندما تكون مربوطة بأعمدة Excel؛ ويُعتمد فراغ الخلية الأصلية حتى لو ركّب النظام اسماً للعرض."}
            {category === "similar" &&
              "التشابه هنا هو تطابق الاسم الثلاثي بعد التطبيع مع اختلاف اسم الأم. تظهر جميع السجلات المعنية مرتبة بالاسم الثلاثي؛ اسم الأم الفارغ يُراجع في البيانات الناقصة."}
            {category === "conflicting" &&
              "التكرار يُفحص داخل الملف نفسه، والارتباطات تُفحص عبر جميع الملفات. الشخص = الاسم الثلاثي + اسم الأم بعد التطبيع. تُقارن الأرقام الوطنية والشام كاش بقيمتها الرقمية بعد حذف الفراغات، دون تأثير لأصفار العرض. تُقارن الفئة الوظيفية برقمها من 1 إلى 5، فمثلاً نفس الرقم الوطني بفئتين مختلفتين عبر ملفين يظهر تضارباً. القيم الفارغة والمعرّفات ذات المحارف تُراجع في البيانات الناقصة والخاطئة."}
          </p>
          <Label htmlFor="conflict-page-size" className="sr-only">
            سجلات الصفحة
          </Label>
          <select
            id="conflict-page-size"
            aria-label="سجلات الصفحة"
            className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
            value={pageSize}
            onChange={(e) => onChange({ category, field, rule, pageSize: Number(e.target.value) }, true)}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>
    </section>
  );
}
