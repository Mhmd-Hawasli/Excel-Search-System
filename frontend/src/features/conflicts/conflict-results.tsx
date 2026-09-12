"use client";

import { CircleCheck, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { IgnoreButton } from "@/features/conflicts/ignore-button";
import { Pager } from "@/components/pager";
import { CONFLICT_SORTABLE } from "@/lib/conflicts-catalog";
import { formatFunctionalCategory, formatNationalId, formatShamCash, toLatinDigits } from "@/lib/conflict-format";
import type { ConflictsResult } from "@/services/conflicts.service";
import { cn } from "@/lib/cn";

function SortGlyph({ active, dir }: { active: boolean; dir: string }) {
  if (!active) return <ChevronsUpDown className="size-4 opacity-50" aria-hidden="true" />;
  return dir === "asc" ? (
    <ArrowUp className="size-4" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-4" aria-hidden="true" />
  );
}

/**
 * Renders the already-computed conflict report: sortable grouped table
 * with per-issue ignore controls and paging.
 */
export function ConflictResults({
  data,
  sortBy,
  sortDir,
  onSort,
  page,
  pageSize,
  onPage,
  canIgnore,
  onChanged,
}: {
  data: ConflictsResult;
  sortBy: string;
  sortDir: string;
  onSort: (key: string) => void;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  canIgnore: boolean;
  onChanged: () => void;
}) {
  const isDefaultSort = sortBy === "issueNumber";

  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-center sm:p-12">
        <CircleCheck className="mx-auto mb-3 size-9 text-primary" aria-hidden="true" />
        <p className="font-bold">لا توجد سجلات تطابق هذه الفلاتر</p>
        <p className="mt-2 text-muted-foreground">يمكنك اختيار حقل أو حالة أخرى لمتابعة المراجعة.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {`${data.total.toLocaleString("en-US")} سجل — يظهر كل سجل مرة واحدة مع مشكلاته المطابقة للفلاتر`}
          </p>
          {isDefaultSort ? (
            <p className="mt-1 text-xs text-muted-foreground">الفرز الافتراضي حسب رقم المشكلة — المشاكل الفردية والزوجية بألوان مختلفة</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              الفرز الحالي: {CONFLICT_SORTABLE.find((column) => column.key === sortBy)?.label}{" "}
              {sortDir === "asc" ? "تصاعدي" : "تنازلي"} — التلوين حسب رقم المشكلة معطّل
            </p>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[1400px] text-sm">
          <caption className="sr-only">
            رقم المشكلة وملف المصدر والاسم الثلاثي واسم الأم والرقم الوطني والشام كاش والرقم الذاتي والفئة الوظيفية والمشكلة وشرحها
          </caption>
          <thead className="bg-muted/70">
            <tr>
              {CONFLICT_SORTABLE.map((column) => {
                const active = sortBy === column.key;
                return (
                  <th key={column.key} scope="col" className="p-0 text-right font-bold" aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                      className={cn(
                        "flex w-full items-center justify-between gap-1 p-4 text-right transition hover:bg-muted",
                        active && "bg-primary/5 text-primary",
                      )}
                      aria-label={`فرز حسب ${column.label} ${active && sortDir === "asc" ? "تنازلي" : "تصاعدي"}`}
                    >
                      <span>{column.label}</span>
                      <SortGlyph active={active} dir={sortDir} />
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="p-4 text-right font-bold">
                رقم الهاتف
              </th>
              <th scope="col" className="p-4 text-right font-bold">
                المشكلة وشرحها
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const isEvenIssue = isDefaultSort && row.issueNumber % 2 === 0;
              const rowBg = isDefaultSort ? (isEvenIssue ? "bg-amber-50/70 dark:bg-amber-950/20" : "bg-white dark:bg-card") : "bg-card";
              return (
                <tr key={row.id} className={cn("border-t align-top transition hover:bg-muted/40", rowBg)}>
                  <td className="p-4 text-center">
                    <span
                      className={cn(
                        "inline-flex min-w-8 justify-center rounded-full px-2 py-1 text-xs font-black",
                        isEvenIssue ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-primary/10 text-primary",
                      )}
                    >
                      {row.issueNumber}
                    </span>
                  </td>
                  <td className="max-w-44 p-4">
                    <a className="font-semibold text-primary hover:underline" href={`/groups/${row.groupId}/files/${row.fileId}`}>
                      {row.fileName}
                    </a>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{row.originalFilename}</p>
                    <p className="mt-1 text-xs text-muted-foreground">صف Excel: {row.rowIndex}</p>
                  </td>
                  <td className="min-w-36 p-4">
                    <a href={`/records/${row.id}`} className="font-semibold hover:text-primary hover:underline">
                      {row.fullName || "—"}
                    </a>
                    {!row.fullName && (
                      <a className="mt-2 block text-xs text-primary hover:underline" href={`/records/${row.id}`}>
                        فتح السجل
                      </a>
                    )}
                  </td>
                  <td className="min-w-28 p-4">{row.motherName || "—"}</td>
                  <td className="p-4">
                    <bdi className="break-all font-mono text-xs">{formatNationalId(row.nationalId) || "—"}</bdi>
                  </td>
                  <td className="p-4">
                    <bdi className="break-all font-mono text-xs ltr-numbers">
                      {row.shamCash ? formatShamCash(row.shamCash) || row.shamCash : "—"}
                    </bdi>
                  </td>
                  <td className="p-4">
                    <bdi className="break-all font-mono text-xs">{row.personalNo || "—"}</bdi>
                  </td>
                  <td className="min-w-36 p-4">{formatFunctionalCategory(row.functionalCategory) || "—"}</td>
                  <td className="p-4">
                    <bdi className="break-all font-mono text-xs ltr-numbers" dir="ltr">
                      {row.phone || "—"}
                    </bdi>
                  </td>
                  <td className="min-w-80 max-w-xl p-4">
                    <ul className="space-y-3">
                      {row.issues.map((issue, index) => (
                        <li key={`${issue.rule}-${index}`}>
                          <p className="text-xs font-bold text-primary">{issue.label}</p>
                          <p className="mt-1 break-words text-sm leading-7 text-muted-foreground">{toLatinDigits(issue.explanation)}</p>
                          {canIgnore ? (
                            <IgnoreButton recordId={row.id} rule={issue.rule} onDone={onChanged} />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={pageSize} total={data.total} onPage={onPage} />
    </>
  );
}
