import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { EditMappingWizard } from "@/features/files/edit-mapping-wizard";
import type { StandardFieldKey } from "@/lib/excel/types";

export const dynamic = "force-dynamic";

export default async function EditMappingPage({
  params,
}: {
  params: Promise<{ id: string; fileId: string }>;
}) {
  const { id: groupId, fileId } = await params;
  const file = await prisma.file.findFirst({
    where: { id: fileId, groupId },
    include: { columns: { orderBy: { columnIndex: "asc" } } },
  });
  if (!file) notFound();

  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });

  const initialColumns = file.columns.map((c) => ({
    id: c.id,
    headerRaw: c.headerRaw,
    headerNormalized: c.headerNormalized,
    columnIndex: c.columnIndex,
    standardField: c.standardField ? (c.standardField.toLowerCase() as StandardFieldKey) : null,
    categoryId: c.categoryId,
  }));

  return (
    <EditMappingWizard
      fileId={file.id}
      groupId={groupId}
      fileName={file.name}
      initialColumns={initialColumns}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
