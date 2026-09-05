import { Pager } from "@/components/pager";
import { SearchResultsTable } from "@/features/search/search-results-table";
import type { SearchRequest } from "@/lib/search/query";
import { searchRecords } from "@/lib/search/query";
import type { SearchSortDirection, SearchSortKey } from "@/lib/search/sort";
import Link from "next/link";
import { ArrowUp, ArrowUpDown } from "lucide-react";
import { buildQueryPath } from "@/utils/query-params";

/**
 * Server component for search results: runs the query against PostgreSQL and
 * streams the table (plus prefetchable sort headers and pager) to the client.
 * Rendered inside `<Suspense>` by the search page.
 */

const SORT_COLUMNS: { key: SearchSortKey; label: string }[] = [
  { key: "source", label: "المصدر" },
  { key: "full_name", label: "الاسم الثلاثي" },
  { key: "national_id", label: "الرقم الوطني" },
  { key: "mother_name", label: "اسم الأم" },
  { key: "sham_cash", label: "الشام كاش" },
  { key: "personal_no", label: "الرقم الذاتي" },
  { key: "job_title", label: "المسمى الوظيفي" },
  { key: "functional_category", label: "الفئة الوظيفية" },
  { key: "organizational_level", label: "السوية التنظيمية" },
];

function SortHeader({
  label,
  sortKey,
  sortBy,
  sortDirection,
  pathname,
  params,
}: {
  label: string;
  sortKey: SearchSortKey;
  sortBy: SearchSortKey;
  sortDirection: SearchSortDirection;
  pathname: string;
  params: URLSearchParams;
}) {
  const active = sortBy === sortKey;
  const nextDirection: SearchSortDirection = active && sortDirection === "asc" ? "desc" : "asc";
  return (
    <th scope="col" className="p-0 text-right font-bold" aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={buildQueryPath(pathname, params, { sortBy: sortKey, sortDirection: nextDirection })}
        scroll={false}
        prefetch
        className="group flex w-full items-center gap-2 p-3 text-right transition hover:bg-muted"
        title={active && sortDirection === "asc" ? "ترتيب تنازلي" : "ترتيب تصاعدي"}
      >
        <span>{label}</span>
        {active ? (
          <ArrowUp aria-hidden="true" className={`size-4 shrink-0 text-primary ${sortDirection === "desc" ? "rotate-180" : ""}`} />
        ) : (
          <ArrowUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60 transition group-hover:text-foreground" />
        )}
      </Link>
    </th>
  );
}

export async function SearchResults({
  request,
  pathname,
  params,
}: {
  request: SearchRequest;
  pathname: string;
  params: URLSearchParams;
}) {
  const data = await searchRecords(request);
  const { sortBy } = request;
  const sortDirection: SearchSortDirection = request.sortDirection ?? "asc";

  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-center sm:p-12">
        <h2 className="font-bold">لم نعثر على نتائج مطابقة</h2>
        <p className="mt-2 text-sm text-muted-foreground">جرّب كتابة كلمات أقل، أو غيّر نطاق البحث إلى جميع الملفات.</p>
      </div>
    );
  }

  const header = (
    <>
      {SORT_COLUMNS.map((column) => (
        <SortHeader
          key={column.key}
          label={column.label}
          sortKey={column.key}
          sortBy={sortBy ?? "source"}
          sortDirection={sortDirection}
          pathname={pathname}
          params={params}
        />
      ))}
      <th scope="col" className="p-3 text-right font-bold">المطابقة</th>
      <th scope="col" className="w-14 p-3 text-right font-bold">
        <span className="sr-only">فتح في علامة تبويب جديدة</span>
      </th>
    </>
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          تم العثور على <strong className="text-foreground">{data.total.toLocaleString("en-US")}</strong> نتيجة
        </p>
        <p className="text-sm text-muted-foreground">
          الصفحة {data.page} من {data.pageCount}
        </p>
      </div>
      <SearchResultsTable rows={data.rows} query={request.query} header={header} />
      <Pager pathname={pathname} current={params} page={data.page} pageCount={data.pageCount} />
    </>
  );
}
