import Link from "next/link";
import { ArrowDown, ArrowUp, FolderOpen, Plus } from "lucide-react";
import { createGroup, deleteGroup, reorderGroup, updateGroup } from "@/lib/actions/groups";
import { prisma } from "@/lib/db/prisma";
import { EmptyState } from "@/components/empty-state";
import { MutationForm } from "@/components/mutation-form";
import { PageHeader } from "@/components/page-header";
import { TypedDeleteButton } from "@/components/typed-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await prisma.group.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { files: { select: { rowCount: true } } },
  });

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="تنظيم الأرشيف" title="المجموعات" description="اجمع الملفات ذات الغرض المشترك، ورتبها بالطريقة التي تناسب سير العمل." />
      <Card>
        <CardHeader>
          <CardTitle>مجموعة جديدة</CardTitle>
          <CardDescription>مثال: ملفات العقود أو الملفات المالية أو بيانات الوزارة.</CardDescription>
        </CardHeader>
        <CardContent>
          <MutationForm action={createGroup} resetOnSuccess pendingMessage="جارٍ إنشاء المجموعة…" className="grid gap-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
            <div className="space-y-2"><Label htmlFor="new-group-name">اسم المجموعة</Label><Input id="new-group-name" name="name" required /></div>
            <div className="space-y-2"><Label htmlFor="new-group-description">الوصف</Label><Input id="new-group-description" name="description" /></div>
            <Button type="submit"><Plus className="size-4" />إنشاء المجموعة</Button>
          </MutationForm>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <EmptyState title="لا توجد مجموعات بعد" description="أنشئ المجموعة الأولى، وبعدها ستتمكن من رفع ملفات Excel إليها." />
      ) : (
        <div className="grid gap-4">
          {groups.map((group, index) => {
            const records = group.files.reduce((sum, file) => sum + file.rowCount, 0);
            return (
              <Card key={group.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{group.name}</CardTitle>
                        <Badge variant="secondary">{group.files.length} ملف</Badge>
                        <Badge variant="outline">{records.toLocaleString("en-US")} سجل</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{group.description || "لا يوجد وصف لهذه المجموعة."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm"><Link href={`/groups/${group.id}`}><FolderOpen className="size-4" />فتح</Link></Button>
                      <MutationForm action={reorderGroup} pendingMessage="جارٍ حفظ الترتيب…">
                        <input type="hidden" name="id" value={group.id} /><input type="hidden" name="direction" value="up" />
                        <Button type="submit" size="icon" variant="outline" disabled={index === 0} aria-label="نقل المجموعة إلى الأعلى"><ArrowUp className="size-4" /></Button>
                      </MutationForm>
                      <MutationForm action={reorderGroup} pendingMessage="جارٍ حفظ الترتيب…">
                        <input type="hidden" name="id" value={group.id} /><input type="hidden" name="direction" value="down" />
                        <Button type="submit" size="icon" variant="outline" disabled={index === groups.length - 1} aria-label="نقل المجموعة إلى الأسفل"><ArrowDown className="size-4" /></Button>
                      </MutationForm>
                      <TypedDeleteButton id={group.id} entityName={group.name} description={`سيُحذف ${group.files.length} ملف و${records.toLocaleString("en-US")} سجل نهائيًا. لا يمكن التراجع عن هذا الإجراء.`} action={deleteGroup} />
                    </div>
                  </div>
                  <details className="mt-4 border-t pt-4">
                    <summary className="cursor-pointer text-sm font-bold text-primary">تعديل الاسم والوصف</summary>
                    <MutationForm action={updateGroup} className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
                      <input type="hidden" name="id" value={group.id} />
                      <div className="space-y-2"><Label htmlFor={`group-name-${group.id}`}>الاسم</Label><Input id={`group-name-${group.id}`} name="name" defaultValue={group.name} required /></div>
                      <div className="space-y-2"><Label htmlFor={`group-description-${group.id}`}>الوصف</Label><Input id={`group-description-${group.id}`} name="description" defaultValue={group.description} /></div>
                      <Button type="submit" variant="secondary">حفظ التعديلات</Button>
                    </MutationForm>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
