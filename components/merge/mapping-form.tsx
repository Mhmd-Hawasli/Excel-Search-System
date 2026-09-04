"use client";

import {
  MERGE_FIELD_KEYS,
  MERGE_FIELD_LABELS,
  type MergeFieldKey,
  type MergeMapping,
} from "@/lib/merge/types";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function MappingForm({
  title,
  headers,
  mapping,
  rowCount,
  onChange,
}: {
  title: string;
  headers: string[];
  mapping: MergeMapping;
  rowCount: number;
  onChange: (mapping: MergeMapping) => void;
}) {
  const used = new Set(Object.values(mapping));
  function setField(field: MergeFieldKey, value: string) {
    const next = { ...mapping };
    if (value === "") delete next[field];
    else next[field] = Number(value) - 1;
    onChange(next);
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/60 px-4 py-3">
        <h3 className="font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">{rowCount.toLocaleString("en-US")} صف</span>
      </div>
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
                  <select
                    className={selectClass}
                    aria-label={`عمود ${MERGE_FIELD_LABELS[field]} في ${title}`}
                    value={mapping[field] !== undefined ? String(mapping[field] + 1) : ""}
                    onChange={(event) => setField(field, event.target.value)}
                  >
                    <option value="">غير مربوط</option>
                    {headers.map((header, index) => (
                      <option
                        key={index}
                        value={index + 1}
                        disabled={used.has(index) && mapping[field] !== index}
                      >
                        {header}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
