
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/page-header";
import { SearchInterface } from "@/components/search-interface";
import { readSearchParam } from "@/utils/search-params";

export const dynamic = "force-dynamic";

export default async function SearchPage(props: PageProps<"/search">) {
  const searchParams = await props.searchParams;
  const [q, groups] = await Promise.all([
    Promise.resolve(readSearchParam(searchParams, "q")),
    prisma.group.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="بحث عربي مرن"
        title="البحث في جميع السجلات"
        description="تُراعى اختلافات الهمزة والتاء المربوطة والألف المقصورة والأرقام العربية تلقائيًا."
      />
      <SearchInterface key={q ?? ""} groups={groups} initialQuery={q ?? ""} />
    </div>
  );
}
