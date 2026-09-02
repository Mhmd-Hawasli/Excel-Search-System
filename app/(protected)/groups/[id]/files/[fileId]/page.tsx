import Link from "next/link";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { deleteFile } from "@/lib/actions/files";
import { STANDARD_FIELD_LABELS } from "@/lib/excel/standard-fields";
import type { StandardFieldKey } from "@/lib/excel/types";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/page-header";
import { TypedDeleteButton } from "@/components/typed-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUploadDateTime } from "@/lib/format/date";

export const dynamic = "force-dynamic";

export default async function FilePage({ params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const file = await prisma.file.findFirst({ where: { id: fileId, groupId: id }, include: { columns: { orderBy: { columnIndex: "asc" }, include: { category: true } }, dataQualityIssues: { select: { id: true } } } });
  if (!file) notFound();
  return <div className="space-y-7"><Button asChild variant="ghost" size="sm"><Link href={`/groups/${id}`}><ArrowRight className="size-4" />العودة إلى المجموعة</Link></Button><PageHeader eyebrow={`الإصدار ${file.version}`} title={file.name} description={file.description || file.originalFilename} actions={<><Button asChild variant="outline"><Link href={`/groups/${id}/files/${file.id}/quality`}><ShieldCheck className="size-4" />تقرير الجودة</Link></Button><Button asChild><Link href={`/groups/${id}/files/${file.id}/update`}><RefreshCw className="size-4" />تحديث الملف</Link></Button><TypedDeleteButton id={file.id} entityName={file.name} description={`سيُحذف ${file.rowCount.toLocaleString("en-US")} سجل و${file.columns.length} عمود نهائيًا. لا يمكن التراجع عن ذلك.`} action={deleteFile} /></>} /><div className="grid gap-3 sm:grid-cols-4"><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">السجلات</p><p className="mt-2 text-2xl font-black">{file.rowCount.toLocaleString("en-US")}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">الأعمدة</p><p className="mt-2 text-2xl font-black">{file.columns.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">مشكلات الجودة</p><p className="mt-2 text-2xl font-black">{file.dataQualityIssues.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">تاريخ الرفع</p><p className="mt-2 font-black ltr-numbers text-right">{formatUploadDateTime(file.uploadedAt)}</p></CardContent></Card></div><Card><CardHeader><CardTitle>خريطة الأعمدة</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-3 text-right">#</th><th className="p-3 text-right">عنوان Excel</th><th className="p-3 text-right">حقل البحث</th><th className="p-3 text-right">الفئة</th></tr></thead><tbody>{file.columns.map((column) => <tr key={column.id} className="border-t"><td className="p-3">{column.columnIndex}</td><td className="p-3 font-bold">{column.headerRaw}</td><td className="p-3">{column.standardField ? <Badge variant="secondary">{STANDARD_FIELD_LABELS[column.standardField.toLowerCase() as StandardFieldKey]}</Badge> : "—"}</td><td className="p-3">{column.category?.name ?? "أخرى"}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
