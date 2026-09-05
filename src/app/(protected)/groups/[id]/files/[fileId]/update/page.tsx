import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import type { StandardFieldKey } from "@/lib/excel/types";
import { FileUpdateWizard } from "@/features/files/file-update-wizard";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function FileUpdatePage({ params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const [file, categories] = await Promise.all([
    prisma.file.findFirst({ where: { id: fileId, groupId: id }, include: { columns: { orderBy: { columnIndex: "asc" } } } }),
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } }),
  ]);
  if (!file) notFound();
  const columns = file.columns.map((column) => ({ headerRaw: column.headerRaw, headerNormalized: column.headerNormalized, columnIndex: column.columnIndex, standardField: column.standardField ? column.standardField.toLowerCase() as StandardFieldKey : null, categoryId: column.categoryId }));
  return <div className="space-y-7"><Button asChild variant="ghost" size="sm"><Link href={`/groups/${id}`}><ArrowRight className="size-4" />العودة إلى المجموعة</Link></Button><PageHeader eyebrow={`الإصدار ${file.version}`} title={`تحديث ${file.name}`} description="ارفع مصنفًا جديدًا. سيحدد النظام إن كان التحديث مباشرًا أم يتطلب إصدارًا بديلًا." /><FileUpdateWizard fileId={file.id} groupId={id} fileName={file.name} currentRows={file.rowCount} existingColumns={columns} categories={categories} /></div>;
}
