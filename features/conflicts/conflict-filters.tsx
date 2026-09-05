"use client";

import { AlertTriangle, Files, Filter, ListMinus, RefreshCw, Users } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CONFLICT_CATEGORIES, CONFLICT_FIELDS, CONFLICT_RULES, type ConflictCategory, type ConflictField } from "@/lib/conflicts/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/select-field";
import { useParamNavigation } from "@/hooks/use-param-navigation";
import { cn } from "@/lib/cn";

const icons = { invalid: AlertTriangle, missing: ListMinus, similar: Users, conflicting: Files } as const;

/**
 * Client filter panel for the conflicts page. Writes filter state to the URL;
 * the server re-runs the conflict rules and streams the results table.
 */
export function ConflictFilters({
  pathname,
  params,
  category,
  field,
  rule,
  pageSize,
}: {
  pathname: string;
  params: URLSearchParams;
  category: ConflictCategory;
  field: string;
  rule: string;
  pageSize: number;
}) {
  const { setParams } = useParamNavigation(pathname, params);
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter();

  const categoryRules = CONFLICT_RULES.filter((item) => item.category === category);
  const fields = Array.from(new Set<ConflictField>(categoryRules.map((item) => item.field)));
  const rules = categoryRules.filter((item) => field === "all" || item.field === field);

  return (
    <section aria-label="فلاتر تضارب البيانات" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="الحالات الرئيسية">
        {CONFLICT_CATEGORIES.map((item) => {
          const Icon = icons[item.key];
          const active = category === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => setParams({ category: item.key, field: "all", rule: "all" })}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-5 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/50",
              )}
            >
              <span className={cn("rounded-lg p-2.5", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-bold">{item.label}</span>
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
            <SelectField
              id="conflict-field"
              label="الحقل"
              value={field}
              onChange={(value) => setParams({ field: value, rule: "all" })}
            >
              <option value="all">جميع الحقول</option>
              {fields.map((item) => (
                <option key={item} value={item}>
                  {CONFLICT_FIELDS[item]}
                </option>
              ))}
            </SelectField>
            <SelectField id="conflict-rule" label="الحالة الفرعية" value={rule} onChange={(value) => setParams({ rule: value })}>
              <option value="all">جميع الحالات الفرعية</option>
              {rules.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </SelectField>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
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
            onChange={(event) => setParams({ pageSize: Number(event.target.value) })}
          >
            {[25, 50, 100].map((size) => (
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
