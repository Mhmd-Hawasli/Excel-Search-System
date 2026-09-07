import { ConflictFilters } from "./conflict-filters";
import { ConflictResults } from "./conflict-results";
import { ConflictStats } from "./conflict-stats";
import { conflictScopeFilter, queryConflicts, queryConflictStats } from "@/lib/conflicts/query";
import { CONFLICT_CATEGORIES, type ConflictCategory } from "@/lib/conflicts/catalog";
import type { ConflictRequest } from "@/lib/conflicts/request";
import type { DataScope } from "@/lib/auth/session-user";

export async function ConflictReport({
  request,
  pathname,
  params,
  scope,
  canEditFilters,
}: {
  request: ConflictRequest;
  pathname: string;
  params: URLSearchParams;
  scope: DataScope;
  canEditFilters: boolean;
}) {
  // Stats and page results are cached independently: statistics depend only
  // on the data scope (shared across every filter/page/sort combination),
  // while the table evaluates just the selected rules. Pagination and
  // sorting therefore never recompute the archive-wide aggregates.
  const [stats, results] = await Promise.all([
    queryConflictStats(scope),
    queryConflicts(request, undefined, conflictScopeFilter(scope)),
  ]);
  const counts = Object.fromEntries(
    CONFLICT_CATEGORIES.map((category) => [
      category.key,
      stats.rules
        .filter((rule) => rule.category === category.key)
        .reduce((sum, rule) => sum + rule.instances, 0),
    ]),
  ) as Record<ConflictCategory, number>;

  return (
    <>
      <ConflictStats stats={stats} />
      {canEditFilters ? (
        <ConflictFilters
          pathname={pathname}
          params={params}
          category={request.category}
          field={request.field}
          rule={request.rule}
          pageSize={request.pageSize}
          counts={counts}
        />
      ) : (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          عرض افتراضي: الحقول غير الصالحة في جميع الحقول.
        </p>
      )}
      <section aria-label="نتائج تضارب البيانات" className="space-y-3">
        <h2 className="text-lg font-bold">السجلات المطابقة</h2>
        <ConflictResults
          request={request}
          pathname={pathname}
          params={params}
          data={results}
          canIgnore={canEditFilters}
        />
      </section>
    </>
  );
}
