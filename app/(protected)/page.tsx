import Link from "next/link";
import { FileSpreadsheet, FolderKanban, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatUploadDateTime } from "@/lib/format/date";

const cards = [
  { label: "المجموعات", value: "—", icon: FolderKanban },
  { label: "الملفات", value: "—", icon: FileSpreadsheet },
  { label: "السجلات", value: "—", icon: UsersRound },
];

import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [groupCount, fileCount, recordCount, recentFiles] = await Promise.all([prisma.group.count(), prisma.file.count(), prisma.record.count(), prisma.file.findMany({ orderBy: { uploadedAt: "desc" }, take: 5, include: { group: true } })]);
  const values = [groupCount, fileCount, recordCount];
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/12 via-card to-card p-6 shadow-soft md:p-9">
        <div className="max-w-3xl space-y-4">
          <p className="text-sm font-bold text-primary">بحث واحد عبر جميع ملفاتك</p>
          <h1 className="text-balance text-3xl font-black leading-tight md:text-4xl">اعثر على سجل أي شخص، مهما اختلفت كتابة اسمه</h1>
          <p className="max-w-2xl text-muted-foreground">ابحث بالاسم أو الرقم الوطني أو الهاتف، ثم شاهد جميع الملفات المرتبطة بالشخص في مكان واحد.</p>
          <form action="/search" className="flex max-w-2xl flex-col gap-2 sm:flex-row">
            <Input name="q" className="h-12 bg-background text-base" placeholder="اكتب اسمًا أو رقمًا للبحث…" aria-label="عبارة البحث" />
            <Button size="lg" className="h-12"><Search className="size-5" />ابدأ البحث</Button>
          </form>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="ملخص الأرشيف">
        {cards.map(({ label, icon: Icon }, index) => (
          <Card key={label}><CardContent className="flex items-center justify-between p-6"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-black">{values[index].toLocaleString("en-US")}</p></div><span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-6" /></span></CardContent></Card>
        ))}
      </section>
      <Card><CardHeader><CardTitle>{recentFiles.length ? "أحدث الملفات المرفوعة" : "ابدأ بإضافة أول ملف"}</CardTitle><CardDescription>{recentFiles.length ? "آخر ما أضيف أو استُبدل في الأرشيف." : "أنشئ مجموعة لتنظيم الملفات، ثم استخدم معالج الرفع لربط الأعمدة القابلة للبحث."}</CardDescription></CardHeader><CardContent>{recentFiles.length ? <div className="grid gap-2">{recentFiles.map((file) => <Link key={file.id} href={`/groups/${file.groupId}/files/${file.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:border-primary"><div><p className="font-bold">{file.name}</p><p className="text-xs text-muted-foreground">{file.group.name} · {file.rowCount.toLocaleString("en-US")} سجل</p></div><span className="ltr-numbers text-xs text-muted-foreground">{formatUploadDateTime(file.uploadedAt)}</span></Link>)}</div> : <div className="flex flex-wrap gap-3"><Button asChild><Link href="/groups">إدارة المجموعات</Link></Button><Button asChild variant="outline"><Link href="/upload">رفع ملف Excel</Link></Button></div>}</CardContent></Card>
    </div>
  );
}
