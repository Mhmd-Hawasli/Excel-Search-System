"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { EditMappingWizard } from "@/features/files/edit-mapping-wizard";
import { useApiQuery } from "@/hooks/use-api-query";
import { hasPermission } from "@/lib/permissions";
import { STANDARD_FIELD_KEYS, type StandardFieldKey } from "@/lib/standard-fields";
import { authService } from "@/services/auth.service";
import { categoriesService } from "@/services/categories.service";
import { filesService } from "@/services/files.service";

export default function EditMappingPage() {
  const params = useParams<{ id: string; fileId: string }>();
  const groupId = params.id;
  const fileId = params.fileId;

  const { data: user } = useApiQuery(() => authService.me(), []);
  const { data: mapping, loading: loadingMapping } = useApiQuery(
    () => filesService.getMapping(fileId),
    [fileId],
  );
  const { data: categories } = useApiQuery(() => categoriesService.options(), []);

  if (!hasPermission(user?.permissions ?? [], "upload.view")) {
    return (
      <div className="space-y-7">
        <p role="alert" className="text-sm text-destructive">غير موجود.</p>
      </div>
    );
  }

  if (loadingMapping || !mapping) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <EditMappingWizard
      fileId={mapping.fileId}
      groupId={groupId}
      fileName={mapping.name}
      initialColumns={mapping.columns.map((column) => ({
        id: column.id,
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
  );
}
