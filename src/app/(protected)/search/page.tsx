import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/page-header";
import { Search } from "lucide-react";
import { Suspense } from "react";
import { SearchFilters } from "@/features/search/search-filters";
import { SearchResults } from "@/features/search/search-results";
import { getSessionUser, requirePagePermission, resolveSearchScope } from "@/lib/auth/session-user";
import { parseSearchParameters } from "@/lib/search/request";
import { applySearchScope } from "@/lib/search/scope";
import { toUrlSearchParams } from "@/utils/query-params";

export const dynamic = "force-dynamic";

const PAGE_PATH = "/search";

function ResultsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <p className="text-sm text-muted-foreground">جارٍ البحث…</p>
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

export default async function SearchPage(props: PageProps<"/search">) {
  await requirePagePermission("search.view");
  const actor = await getSessionUser();
  const scope = actor ? await resolveSearchScope(actor) : null;
  const searchParams = await props.searchParams;
  const params = toUrlSearchParams(searchParams);
  const parsed = parseSearchParameters(params);
  const request = parsed.success ? parsed.data : null;
  const scoped = request && scope ? applySearchScope(request, scope) : null;
  const [allGroups] = await Promise.all([
    prisma.group.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        files: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
    }),
  ]);
  // Filter pickers only offer visible groups and files.
  const groups =
    scope?.groupIds === null || scope?.groupIds === undefined
      ? allGroups
      : allGroups
          .filter((group) => scope.groupIds?.includes(group.id))
          .map((group) => ({
            ...group,
            files: group.files.filter((file) => scope.fileIds?.includes(file.id)),
          }));
  const visibleGroupIds = new Set(groups.map((group) => group.id));
  const visibleFileIds = new Set(groups.flatMap((group) => group.files.map((file) => file.id)));
  const groupIds = (request?.groupIds ?? []).filter((id) => visibleGroupIds.has(id));
  const fileIds = (request?.fileIds ?? []).filter((id) => visibleFileIds.has(id));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="بحث عربي مرن"
        title="البحث في جميع السجلات"
        description="تُراعى اختلافات الهمزة والتاء المربوطة والألف المقصورة والأرقام العربية تلقائيًا."
      />
      <SearchFilters
        pathname={PAGE_PATH}
        params={params}
        groups={groups}
        query={request?.q ?? ""}
        mode={request?.mode ?? "full"}
        field={request?.field ?? null}
        groupIds={groupIds}
        fileIds={fileIds}
      />
      {request?.q && scoped ? (
        <Suspense key={params.toString()} fallback={<ResultsSkeleton />}>
          <SearchResults
            request={{ ...request, query: request.q, ...scoped }}
            pathname={PAGE_PATH}
            params={params}
          />
        </Suspense>
      ) : request?.q ? (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center sm:p-12">
          <Search className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-3 font-bold">لا توجد نتائج ضمن نطاقك</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            حسابك مقيد بمجموعات وملفات محددة لا تطابق هذا البحث.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-6 text-center sm:p-12">
          <Search className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-3 font-bold">ابدأ بكتابة عبارة البحث</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            يمكنك استخدام الاسم أو الرقم الوطني أو الهاتف أو أي حقل قياسي.
          </p>
        </div>
      )}
    </div>
  );
}
