import Link from "next/link";
import { getSessionUser, hasPermission, requirePagePermission, resolveDataScope } from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { UploadWizard } from "@/features/upload/upload-wizard";
import { Button } from "@/components/ui/button";
import { readSearchParam } from "@/utils/search-params";

export const dynamic = "force-dynamic";

export default async function UploadPage(props: PageProps<"/upload">) {
  await requirePagePermission("upload.view");
  const actor = await getSessionUser();
  const canRun = actor ? hasPermission(actor, "upload.run") : false;
  const searchParams = await props.searchParams;
  const scope = actor ? await resolveDataScope(actor) : { groupIds: [], fileIds: [] };
  const [group, allGroups, categories, templates] = await Promise.all([
    Promise.resolve(readSearchParam(searchParams, "group")),
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
  const groups =
    scope.groupIds === null ? allGroups : allGroups.filter((item) => scope.groupIds?.includes(item.id));
  const restrictedToScope = scope.groupIds !== null;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="استيراد البيانات"
        title="رفع ملف Excel"
        description="اختر ورقة واحدة أو عدة أوراق مترابطة بالرقم الوطني، ثم اربط حقول البحث ونظّم أعمدة التفاصيل قبل الاستيراد."
      />
      {groups.length === 0 ? (
        restrictedToScope ? (
          <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            لا توجد مجموعات ضمن نطاق حسابك.
          </p>
        ) : (
          <EmptyState
            title="أنشئ مجموعة أولًا"
            description="يجب أن ينتمي كل ملف إلى مجموعة قبل رفعه."
            action={
              <Button asChild>
                <Link href="/groups">إنشاء مجموعة</Link>
              </Button>
            }
          />
        )
      ) : !canRun ? (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          حسابك لا يملك صلاحية رفع ملفات إكسل.
        </p>
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
