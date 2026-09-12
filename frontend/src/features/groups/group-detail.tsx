"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Upload } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FileCard } from "@/components/file-card";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { groupsService } from "@/services/groups.service";

export function GroupDetail({ groupId }: { groupId: string }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") ?? undefined;
  const success = searchParams.get("success") ?? undefined;
  const { data: user } = useApiQuery(() => authService.me(), []);
  const { data, loading, error: loadError } = useApiQuery(() => groupsService.get(groupId), [groupId]);

  const canUpload = hasPermission(user?.permissions ?? [], "upload.view");

  if (loadError) {
    return (
      <div className="space-y-7">
        <Button asChild variant="ghost" size="sm">
          <Link href="/groups">
            <ArrowRight className="size-4" />
            العودة إلى المجموعات
          </Link>
        </Button>
        <p role="alert" className="text-sm text-destructive">{loadError}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const { group, files } = data;

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
              columnCount={file.columnCount}
              version={file.version}
              uploadedAt={new Date(file.uploadedAt)}
              hasEdits={file.hasEdits}
            />
          ))}
        </div>
      )}
    </div>
  );
}
