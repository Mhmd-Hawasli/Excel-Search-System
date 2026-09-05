import Link from "next/link";
import { toLatinDigits } from "@/lib/normalization/arabic";
import type { ConflictResponse, ConflictSortBy, ConflictSortDir } from "@/lib/conflicts/catalog";
import type { ConflictRequest } from "@/lib/conflicts/request";
import { queryConflicts } from "@/lib/conflicts/query";
import { formatFunctionalCategory } from "@/lib/format/functional-category";
import { formatNationalId } from "@/lib/format/national-id";
import { formatShamCash } from "@/lib/format/sham-cash";
import { CircleCheck } from "lucide-react";
import { Pager } from "@/components/pager";
import { SortIcon } from "@/components/sort-icon";
import { buildQueryPath } from "@/utils/query-params";
import { cn } from "@/lib/cn";

/**
 * Server-rendered conflict results: runs the conflict rules over the whole
 * archive and streams the report table with prefetchable sort/pager links.
 */

const SORTABLE_COLUMNS: { key: ConflictSortBy; label: string }[] = [
  { key: "issueNumber", label: "رقم المشكلة" },
  { key: "fileName", label: "ملف المصدر" },
  { key: "fullName", label: "الاسم الثلاثي" },
  { key: "motherName", label: "اسم الأم" },
  { key: "nationalId", label: "الرقم الوطني" },
  { key: "shamCash", label: "الشام كاش" },
  { key: "personalNo", label: "الرقم الذاتي" },
  { key: "functionalCategory", label: "الفئة الوظيفية" },
];

function sortHref(pathname: string, params: URLSearchParams, key: ConflictSortBy, sortBy: ConflictSortBy, sortDir: ConflictSortDir) {
  const nextDir: ConflictSortDir = sortBy === key && sortDir === "asc" ? "desc" : "asc";
  return buildQueryPath(pathname, params, { sortBy: key, sortDir: nextDir });
}

export async function ConflictResults({
  request,
  pathname,
  params,
}: {
  request: ConflictRequest;
  pathname: string;
  params: URLSearchParams;
}) {
  const data: ConflictResponse = await queryConflicts(request);
  const isDefaultSort = request.sortBy === "issueNumber";

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
              الفرز الحالي: {SORTABLE_COLUMNS.find((column) => column.key === request.sortBy)?.label}{" "}
              {request.sortDir === "asc" ? "تصاعدي" : "تنازلي"} — التلوين حسب رقم المشكلة معطّل
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
              {SORTABLE_COLUMNS.map((column) => {
                const active = request.sortBy === column.key;
                return (
                  <th key={column.key} scope="col" className="p-0 text-right font-bold" aria-sort={active ? (request.sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    <Link
                      href={sortHref(pathname, params, column.key, request.sortBy, request.sortDir)}
                      scroll={false}
                      prefetch
                      className={cn(
                        "flex w-full items-center justify-between gap-1 p-4 text-right transition hover:bg-muted",
                        active && "bg-primary/5 text-primary",
                      )}
                      aria-label={`فرز حسب ${column.label} ${active && request.sortDir === "asc" ? "تنازلي" : "تصاعدي"}`}
                    >
                      <span>{column.label}</span>
                      <SortIcon active={active} dir={request.sortDir} />
                    </Link>
                  </th>
                );
              })}
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
                    <Link className="font-semibold text-primary hover:underline" href={`/groups/${row.groupId}/files/${row.fileId}`} prefetch={false}>
                      {row.fileName}
                    </Link>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{row.originalFilename}</p>
                    <p className="mt-1 text-xs text-muted-foreground">صف Excel: {row.rowIndex}</p>
                  </td>
                  <td className="min-w-36 p-4">
                    <Link href={`/records/${row.id}`} prefetch={false} className="font-semibold hover:text-primary hover:underline">
                      {row.fullName || "—"}
                    </Link>
                    {!row.fullName && (
                      <Link className="mt-2 block text-xs text-primary hover:underline" href={`/records/${row.id}`} prefetch={false}>
                        فتح السجل
                      </Link>
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
                  <td className="min-w-80 max-w-xl p-4">
                    <ul className="space-y-3">
                      {row.issues.map((issue, index) => (
                        <li key={`${issue.rule}-${index}`}>
                          <p className="text-xs font-bold text-primary">{issue.label}</p>
                          <p className="mt-1 break-words text-sm leading-7 text-muted-foreground">{toLatinDigits(issue.explanation)}</p>
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
      <Pager pathname={pathname} current={params} page={data.page} pageCount={data.pageCount} />
    </>
  );
}
