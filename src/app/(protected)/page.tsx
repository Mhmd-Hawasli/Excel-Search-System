import Link from "next/link";
import {
  ArrowUpLeft,
  ChevronLeft,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  FileUp,
  FolderKanban,
  Layers,
  Merge,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getEditedFileIds } from "@/lib/edits/service";
import { FileCard } from "@/components/file-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  {
    label: "إجمالي المجموعات",
    detail: "مجموعات لتنظيم ملفاتك",
    icon: FolderKanban,
    href: "/groups",
    tone: "bg-primary/10 text-primary",
  },
  {
    label: "الملفات المؤرشفة",
    detail: "ملفات محفوظة في الأرشيف",
    icon: FileSpreadsheet,
    href: "/groups",
    tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    label: "إجمالي السجلات",
    detail: "سجلات متاحة للبحث",
    icon: UsersRound,
    href: "/search",
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
];

const quickActions = [
  { href: "/upload", label: "رفع ملف جديد", description: "أضف بياناتك إلى الأرشيف", icon: FileUp },
  {
    href: "/edits",
    label: "تصدير ملفات الإكسل",
    description: "راجع التعديلات وصدّر ملفاتك",
    icon: Download,
  },
  { href: "/merge", label: "دمج ملفات", description: "اجمع البيانات من عدة ملفات", icon: Merge },
  {
    href: "/merge-sheets",
    label: "دمج صفحات إكسل",
    description: "وحّد الصفحات في ملف واحد",
    icon: Layers,
  },
];

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [groupCount, fileCount, recordCount, recentFiles] = await Promise.all([
    prisma.group.count(),
    prisma.file.count(),
    prisma.record.count(),
    prisma.file.findMany({
      orderBy: { uploadedAt: "desc" },
      take: 5,
      include: { group: true, _count: { select: { columns: true } } },
    }),
  ]);
  const values = [groupCount, fileCount, recordCount];
  const editedIds = await getEditedFileIds(recentFiles.map((file) => file.id));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="لوحة التحكم"
        title="نظرة عامة على الأرشيف"
        description="ملفاتك وسجلاتك وأدوات العمل، في مكان واحد."
        actions={
          <Button asChild>
            <Link href="/upload">
              <Plus className="size-4" />
              رفع ملف جديد
            </Link>
          </Button>
        }
      />
      <section className="grid gap-4 sm:grid-cols-3" aria-label="ملخص الأرشيف">
        {stats.map(({ label, detail, icon: Icon, href, tone }, index) => (
          <Link href={href} key={label} className="stat-card group">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="my-2 text-[32px] font-extrabold leading-tight tracking-tight tabular-nums">
                {values[index].toLocaleString("en-US")}
              </p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </div>
            <span className={`stat-icon ${tone}`}>
              <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </section>

      <div className="dashboard-panels">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-5">
            <div>
              <CardTitle className="text-base">أحدث الملفات المرفوعة</CardTitle>
              <CardDescription className="mt-1">آخر الإضافات والتحديثات في أرشيفك</CardDescription>
            </div>
            <Link
              href="/groups"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              عرض الكل
              <ChevronLeft className="size-3.5" />
            </Link>
          </CardHeader>
          {recentFiles.length ? (
            <div>
              {recentFiles.map((file) => (
                <FileCard
                  key={file.id}
                  compact
                  href={`/groups/${file.groupId}/files/${file.id}`}
                  name={file.name}
                  description={file.description}
                  originalFilename={file.originalFilename}
                  rowCount={file.rowCount}
                  columnCount={file._count.columns}
                  version={file.version}
                  uploadedAt={file.uploadedAt}
                  groupName={file.group.name}
                  showGroup
                  hasEdits={editedIds.has(file.id)}
                />
              ))}
              <div className="flex items-center justify-between border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
                <span>عرض أحدث {recentFiles.length} ملفات</span>
                <span>{fileCount.toLocaleString("en-US")} ملف في الأرشيف</span>
              </div>
            </div>
          ) : (
            <CardContent className="space-y-4 border-t p-8 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <FileSpreadsheet className="size-6" />
              </span>
              <h2 className="font-bold">ابدأ بإضافة أول ملف</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                أنشئ مجموعة لتنظيم ملفاتك، ثم ارفع ملف إكسل لبدء البحث في سجلاته.
              </p>
              <Button asChild variant="outline">
                <Link href="/groups">
                  إنشاء مجموعة
                  <ArrowUpLeft className="size-4" />
                </Link>
              </Button>
            </CardContent>
          )}
        </Card>

        <div className="dashboard-supplementary space-y-5 max-xl:space-y-0">
          <Card>
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-base">إجراءات سريعة</CardTitle>
              <CardDescription>أدواتك اليومية، بخطوة واحدة</CardDescription>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {quickActions.map(({ href, label, description, icon: Icon }) => (
                <Link className="quick-action group" href={href} key={href}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground group-hover:border-primary/25 group-hover:text-primary">
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {description}
                    </span>
                  </span>
                  <ChevronLeft
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </CardContent>
          </Card>
          <div className="rounded-xl border border-primary/15 bg-accent p-5">
            <DatabaseBackup
              className="mb-3 size-6 text-primary"
              strokeWidth={1.7}
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold">احتفظ بنسخة من بياناتك</h2>
            <p className="mb-4 mt-2 text-xs leading-6 text-muted-foreground">
              حمّل نسخة احتياطية من الأرشيف لاستعادة بياناتك عند الحاجة.
            </p>
            <Link
              href="/settings/backup"
              className="flex items-center justify-between text-xs font-bold text-primary"
            >
              إدارة النسخ الاحتياطي
              <ArrowUpLeft className="size-4" />
            </Link>
          </div>
        </div>
      </div>
      <Link
        href="/search"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-card/50 px-5 py-4 transition hover:border-primary/40 hover:bg-card"
      >
        <Search className="size-5 text-primary" aria-hidden="true" />
        <span className="flex-1 text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">تبحث عن سجل محدد؟</strong> ابحث بالاسم
          أو الرقم الوطني أو الهاتف عبر جميع الملفات.
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          فتح البحث
          <ChevronLeft className="size-4" />
        </span>
      </Link>
    </div>
  );
}
