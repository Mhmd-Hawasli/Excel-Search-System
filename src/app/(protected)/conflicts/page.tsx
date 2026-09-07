import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ConflictFilters } from "@/features/conflicts/conflict-filters";
import { ConflictReport } from "@/features/conflicts/conflict-report";
import {
  getSessionUser,
  hasPermission,
  requirePagePermission,
  resolveDataScope,
} from "@/lib/auth/session-user";
import { parseConflictParameters } from "@/lib/conflicts/request";
import { toUrlSearchParams } from "@/utils/query-params";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/conflicts";

function ResultsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <p className="text-sm text-muted-foreground">
        جارٍ فحص السجلات… يشمل الفحص جميع الملفات المكتملة في الأرشيف
      </p>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export default async function ConflictsPage(props: PageProps<"/conflicts">) {
  await requirePagePermission("conflicts.view");
  const actor = await getSessionUser();
  const canEditFilters = actor ? hasPermission(actor, "conflicts.filters") : false;
  const canExport = actor ? hasPermission(actor, "export.run") : false;
  const rawParams = await props.searchParams;
  const params = toUrlSearchParams(rawParams);
  const parsed = parseConflictParameters(params);
  const request = parsed.success ? parsed.data : null;
  // Without the filters permission the report always runs with the default
  // filters; only navigation (page, page size, sorting) stays adjustable.
  const effective =
    request && !canEditFilters
      ? { ...request, category: "invalid" as const, field: "all", rule: "all" }
      : request;
  const scope = actor ? await resolveDataScope(actor) : { groupIds: [], fileIds: [] };
  // The export always matches the displayed report: effective (permission-aware)
  // filters plus the current sort order. Paging is irrelevant (export capped).
  const exportParams = effective
    ? new URLSearchParams({
        category: effective.category,
        field: effective.field,
        rule: effective.rule,
        sortBy: effective.sortBy,
        sortDir: effective.sortDir,
      })
    : null;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="مراجعة جودة الأرشيف"
        title="تضارب البيانات"
        description="راجع البيانات الخاطئة والناقصة وتشابه الأسماء والتضارب بين سجلات جميع الملفات، مع توضيح المشكلة في كل سجل."
        actions={
          canExport && exportParams ? (
            <Button asChild variant="outline">
              <Link href={`/api/conflicts/export?${exportParams.toString()}`} prefetch={false}>
                <Download className="size-4" />
                تصدير Excel للحالة الحالية
              </Link>
            </Button>
          ) : undefined
        }
      />
      {effective ? (
        <Suspense key={params.toString()} fallback={<ResultsSkeleton />}>
          <ConflictReport
            request={effective}
            pathname={PAGE_PATH}
            params={params}
            scope={scope}
            canEditFilters={canEditFilters}
          />
        </Suspense>
      ) : (
        <>
          {canEditFilters ? (
            <ConflictFilters
              pathname={PAGE_PATH}
              params={params}
              category={request?.category ?? "invalid"}
              field={request?.field ?? "all"}
              rule={request?.rule ?? "all"}
              pageSize={request?.pageSize ?? 25}
            />
          ) : (
            <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
              عرض افتراضي: الحقول غير الصالحة في جميع الحقول.
            </p>
          )}
          <section aria-label="نتائج تضارب البيانات" className="space-y-3">
            <h2 className="text-lg font-bold">السجلات المطابقة</h2>
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive"
            >
              معايير التصفية غير صالحة. اختر الحالة والحقل والحالة الفرعية من القائمة.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
