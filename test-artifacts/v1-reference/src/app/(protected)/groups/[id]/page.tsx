import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, hasPermission, resolveDataScope } from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";
import { readSearchParam } from "@/utils/search-params";
import { getEditedFileIds } from "@/lib/edits/service";
import { EmptyState } from "@/components/empty-state";
import { FileCard } from "@/components/file-card";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage(props: PageProps<"/groups/[id]">) {
  const { id } = await props.params;
  const error = readSearchParam(await props.searchParams, "error");
  const success = readSearchParam(await props.searchParams, "success");
  const actor = await getSessionUser();
  if (!actor) redirect("/login");
  const canUpload = hasPermission(actor, "upload.view");
  const showEditedBadge = hasPermission(actor, "edits.badge");
  const group = await prisma.group.findUnique({
    where: { id },
    include: { files: { orderBy: { uploadedAt: "desc" }, include: { _count: { select: { columns: true } } } } },
  });
  if (!group) notFound();
  const scope = await resolveDataScope(actor);
  if (scope.groupIds !== null && !scope.groupIds.includes(group.id)) notFound();
  const files =
    scope.fileIds === null ? group.files : group.files.filter((file) => scope.fileIds?.includes(file.id));
  const editedIds = showEditedBadge ? await getEditedFileIds(files.map((f) => f.id)) : new Set<string>();
  return (
    <div className="space-y-7">
      <Button asChild variant="ghost" size="sm">
        <Link href="/groups">
          <ArrowRight className="size-4" />
          العودة إلى المجموعات
        </Link>
      </Button>
      <PageHeader
        title={group.name}
        description={group.description || "ملفات هذه المجموعة وسجلاتها — اضغط على أي ملف لعرض تفاصيله وخيارات التعديل."}
        actions={
          canUpload ? (
          <Button asChild>
            <Link href={`/upload?group=${group.id}`}>
              <Upload className="size-4" />
              رفع ملف
            </Link>
          </Button>
          ) : undefined
        }
      />
      <FlashMessage error={error} success={success} />
      {files.length === 0 ? (
        <EmptyState
          title="لا توجد ملفات في هذه المجموعة"
          description="ارفع ملف Excel وحدد الورقة والحقول القياسية لبدء البحث في بياناته."
          action={
            canUpload ? (
            <Button asChild>
              <Link href={`/upload?group=${group.id}`}>رفع الملف الأول</Link>
            </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3">
          {files.map((file) => (
            <FileCard
              key={file.id}
              href={`/groups/${group.id}/files/${file.id}`}
              name={file.name}
              description={file.description}
              originalFilename={file.originalFilename}
              rowCount={file.rowCount}
              columnCount={file._count.columns}
              version={file.version}
              uploadedAt={file.uploadedAt}
              hasEdits={editedIds.has(file.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
