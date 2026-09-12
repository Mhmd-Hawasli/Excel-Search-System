"use client";

import { useMemo } from "react";
import { ArrowLeftRight, WandSparkles } from "lucide-react";
import {
  MERGE_FIELD_KEYS,
  MERGE_FIELD_LABELS,
  type MergeFieldKey,
  type MergeMapping,
} from "@/lib/merge/types";
import { importMappingByHeader, suggestMergeMapping } from "@/lib/merge/suggest";
import { FieldMappingSelect } from "@/features/fields/field-mapping-select";
import { Button } from "@/components/ui/button";

const PART_FIELDS: MergeFieldKey[] = ["firstName", "fatherName", "lastName"];

export function MappingForm({
  title,
  headers,
  mapping,
  rowCount,
  onChange,
  importSource,
}: {
  title: string;
  headers: string[];
  mapping: MergeMapping;
  rowCount: number;
  onChange: (mapping: MergeMapping) => void;
  /**
   * The other table's settings. When provided, an «import from the other
   * table» button copies its field mapping by matching header names.
   */
  importSource?: { title: string; headers: string[]; mapping: MergeMapping };
}) {
  const used = new Set(Object.values(mapping));
  const fullNameMapped = mapping.fullName !== undefined;
  const partsMapped = PART_FIELDS.some((field) => mapping[field] !== undefined);

  // Smart suggestion for the current headers (same engine applied on upload).
  // Shown as «(مقترح)» on the matching options and re-appliable below.
  const suggested = useMemo(() => suggestMergeMapping(headers), [headers]);

  const canImport = Boolean(
    importSource &&
      importSource.headers.length > 0 &&
      Object.keys(importSource.mapping).length > 0,
  );

  function setField(field: MergeFieldKey, value: string) {
    const next = { ...mapping };
    if (value === "") {
      delete next[field];
    } else {
      next[field] = Number(value) - 1;
      // The triple full name and its split parts are mutually exclusive:
      // mapping one side clears the other.
      if (field === "fullName") {
        for (const part of PART_FIELDS) delete next[part];
      } else if ((PART_FIELDS as string[]).includes(field)) {
        delete next.fullName;
      }
    }
    onChange(next);
  }

  function disabledFor(field: MergeFieldKey) {
    if (field === "fullName") return partsMapped;
    if ((PART_FIELDS as string[]).includes(field)) return fullNameMapped;
    return false;
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/60 px-4 py-3">
        <h3 className="font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">{rowCount.toLocaleString("en-US")} صف</span>
      </div>
      {headers.length ? (
        <div className="flex flex-wrap gap-2 border-b px-4 py-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(suggestMergeMapping(headers))}
            aria-label={`إعادة تطبيق الاقتراح الذكي على ${title}`}
          >
            <WandSparkles className="size-4" />
            اقتراح ذكي
          </Button>
          {importSource ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canImport}
              onClick={() =>
                onChange(importMappingByHeader(importSource.headers, importSource.mapping, headers))
              }
              aria-label={`استيراد الإعدادات من ${importSource.title} إلى ${title}`}
              title={
                canImport
                  ? `نسخ ربط الحقول من ${importSource.title} بمطابقة أسماء الأعمدة`
                  : "لا توجد إعدادات للاستيراد بعد"
              }
            >
              <ArrowLeftRight className="size-4" />
              استيراد من {importSource.title}
            </Button>
          ) : null}
        </div>
      ) : null}
      {fullNameMapped ? (
        <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          تم ربط الاسم الثلاثي — الاسم واسم الأب والنسبة معطلة. لإدخالها ألغِ ربط الاسم الثلاثي
          أولاً.
        </p>
      ) : partsMapped ? (
        <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          تم ربط الاسم أو اسم الأب أو النسبة — الاسم الثلاثي معطل. لإدخاله ألغِ ربط الحقول
          الثلاثة أولاً.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="p-3 text-right font-semibold">الحقل</th>
              <th className="p-3 text-right font-semibold">عمود Excel المرتبط</th>
            </tr>
          </thead>
          <tbody>
            {MERGE_FIELD_KEYS.map((field) => (
              <tr key={field} className="border-t">
                <th scope="row" className="whitespace-nowrap p-3 text-right font-semibold">
                  {MERGE_FIELD_LABELS[field]}
                </th>
                <td className="p-3">
                  <FieldMappingSelect
                    ariaLabel={`عمود ${MERGE_FIELD_LABELS[field]} في ${title}`}
                    value={mapping[field] !== undefined ? String(mapping[field] + 1) : ""}
                    disabled={disabledFor(field)}
                    onChange={(next) => setField(field, next)}
                    options={[
                      { value: "", label: "غير مربوط" },
                      ...headers.map((header, index) => {
                        const takenBy =
                          used.has(index) && mapping[field] !== index
                            ? Object.entries(mapping).find(([, column]) => column === index)?.[0]
                            : undefined;
                        return {
                          value: String(index + 1),
                          label:
                            header +
                            (suggested[field] === index ? " (مقترح)" : "") +
                            (takenBy
                              ? ` — مرتبط بـ ${MERGE_FIELD_LABELS[takenBy as MergeFieldKey]}`
                              : ""),
                          disabled: takenBy !== undefined,
                        };
                      }),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
