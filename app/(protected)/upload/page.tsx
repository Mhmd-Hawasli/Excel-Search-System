import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { UploadWizard } from "@/components/upload-wizard";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const [{ group }, groups, categories, templates] = await Promise.all([
    searchParams,
    prisma.group.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.mappingTemplate.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, groupId: true, name: true, mapping: true },
    }),
  ]);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="استيراد البيانات"
        title="رفع ملف Excel"
        description="سيرشدك المعالج لاختيار الورقة وربط حقول البحث وتنظيم أعمدة التفاصيل قبل الاستيراد."
      />
      {groups.length === 0 ? (
        <EmptyState
          title="أنشئ مجموعة أولًا"
          description="يجب أن ينتمي كل ملف إلى مجموعة قبل رفعه."
          action={
            <Button asChild>
              <Link href="/groups">إنشاء مجموعة</Link>
            </Button>
          }
        />
      ) : (
        <UploadWizard
          groups={groups}
          categories={categories}
          templates={templates}
          initialGroupId={group && groups.some((item) => item.id === group) ? group : undefined}
        />
      )}
    </div>
  );
}
