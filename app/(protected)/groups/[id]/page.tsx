import Link from "next/link";
import { ArrowRight, FileSpreadsheet, FolderOpen, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUploadDateTime } from "@/lib/format/date";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ id }, { error, success }] = await Promise.all([params, searchParams]);
  const group = await prisma.group.findUnique({ where: { id }, include: { files: { orderBy: { uploadedAt: "desc" }, include: { _count: { select: { columns: true } } } } } });
  if (!group) notFound();
  return <div className="space-y-7"><Button asChild variant="ghost" size="sm"><Link href="/groups"><ArrowRight className="size-4" />العودة إلى المجموعات</Link></Button><PageHeader title={group.name} description={group.description || "ملفات هذه المجموعة وسجلاتها."} actions={<Button asChild><Link href={`/upload?group=${group.id}`}><Upload className="size-4" />رفع ملف</Link></Button>} /><FlashMessage error={error} success={success} />{group.files.length === 0 ? <EmptyState title="لا توجد ملفات في هذه المجموعة" description="ارفع ملف Excel وحدد الورقة والحقول القياسية لبدء البحث في بياناته." action={<Button asChild><Link href={`/upload?group=${group.id}`}>رفع الملف الأول</Link></Button>} /> : <div className="grid gap-4">{group.files.map((file) => <Card key={file.id}><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" />{file.name}</CardTitle><CardDescription className="mt-2">{file.description || file.originalFilename}</CardDescription></div><Badge>الإصدار {file.version}</Badge></CardHeader><CardContent className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>{file.rowCount.toLocaleString("en-US")} سجل</span><span>·</span><span>{file._count.columns} عمود</span><span>·</span><span className="ltr-numbers">{formatUploadDateTime(file.uploadedAt)}</span><div className="me-auto flex gap-1"><Button asChild variant="ghost" size="sm"><Link href={`/groups/${group.id}/files/${file.id}`}><FolderOpen className="size-4" />فتح</Link></Button><Button asChild variant="ghost" size="sm"><Link href={`/groups/${group.id}/files/${file.id}/quality`}><ShieldCheck className="size-4" />الجودة</Link></Button><Button asChild variant="ghost" size="sm"><Link href={`/groups/${group.id}/files/${file.id}/update`}><RefreshCw className="size-4" />تحديث</Link></Button></div></CardContent></Card>)}</div>}</div>;
}
