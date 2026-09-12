"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileUpdateWizard } from "@/features/files/file-update-wizard";
import { useApiQuery } from "@/hooks/use-api-query";
import { hasPermission } from "@/lib/permissions";
import { STANDARD_FIELD_KEYS, type StandardFieldKey } from "@/lib/standard-fields";
import { authService } from "@/services/auth.service";
import { categoriesService } from "@/services/categories.service";
import { filesService } from "@/services/files.service";

export default function FileUpdatePage() {
  const params = useParams<{ id: string; fileId: string }>();
  const groupId = params.id;
  const fileId = params.fileId;

  const { data: user } = useApiQuery(() => authService.me(), []);
  const { data: detail, loading: loadingFile } = useApiQuery(
    () => filesService.detail(fileId, groupId),
    [fileId, groupId],
  );
  const { data: categories } = useApiQuery(() => categoriesService.options(), []);

  if (!hasPermission(user?.permissions ?? [], "upload.view")) {
    return (
      <div className="space-y-7">
        <p role="alert" className="text-sm text-destructive">غير موجود.</p>
      </div>
    );
  }

  if (loadingFile || !detail) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/groups/${groupId}`}>
          <ArrowRight className="size-4" />
          العودة إلى المجموعة
        </Link>
      </Button>
      <PageHeader
        eyebrow={`الإصدار ${detail.file.version}`}
        title={`تحديث ${detail.file.name}`}
        description="ارفع مصنفًا جديدًا. سيحدد النظام إن كان التحديث مباشرًا أم يتطلب إصدارًا بديلًا."
      />
      <FileUpdateWizard
        fileId={detail.file.id}
        groupId={groupId}
        fileName={detail.file.name}
        currentRows={detail.file.rowCount}
        existingColumns={detail.columns.map((column) => ({
          headerRaw: column.headerRaw,
          headerNormalized: column.headerNormalized,
          columnIndex: column.columnIndex,
          standardField: (STANDARD_FIELD_KEYS as readonly string[]).includes(column.standardField ?? "")
            ? (column.standardField as StandardFieldKey)
            : null,
          categoryId: column.categoryId,
        }))}
        categories={categories ?? []}
      />
    </div>
  );
}
