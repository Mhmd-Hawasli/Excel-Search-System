import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ConflictFilters } from "@/features/conflicts/conflict-filters";
import { ConflictResults } from "@/features/conflicts/conflict-results";
import { parseConflictParameters } from "@/lib/conflicts/request";
import { toUrlSearchParams } from "@/utils/query-params";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/conflicts";

function ResultsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <p className="text-sm text-muted-foreground">جارٍ فحص السجلات… يشمل الفحص جميع الملفات المكتملة في الأرشيف</p>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export default async function ConflictsPage(props: PageProps<"/conflicts">) {
  const rawParams = await props.searchParams;
  const params = toUrlSearchParams(rawParams);
  const parsed = parseConflictParameters(params);
  const request = parsed.success ? parsed.data : null;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="مراجعة جودة الأرشيف"
        title="تضارب البيانات"
        description="راجع البيانات الخاطئة والناقصة وتشابه الأسماء والتضارب بين سجلات جميع الملفات، مع توضيح المشكلة في كل سجل."
      />
      <ConflictFilters
        pathname={PAGE_PATH}
        params={params}
        category={request?.category ?? "invalid"}
        field={request?.field ?? "all"}
        rule={request?.rule ?? "all"}
        pageSize={request?.pageSize ?? 25}
      />
      <section aria-label="نتائج تضارب البيانات" className="space-y-3">
        <h2 className="text-lg font-bold">السجلات المطابقة</h2>
        {request ? (
          <Suspense key={params.toString()} fallback={<ResultsSkeleton />}>
            <ConflictResults request={request} pathname={PAGE_PATH} params={params} />
          </Suspense>
        ) : (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            معايير التصفية غير صالحة. اختر الحالة والحقل والحالة الفرعية من القائمة.
          </p>
        )}
      </section>
    </div>
  );
}
