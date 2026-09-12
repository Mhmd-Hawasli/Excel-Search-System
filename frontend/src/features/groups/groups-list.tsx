"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, FolderOpen, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MutationForm } from "@/components/mutation-form";
import { PageHeader } from "@/components/page-header";
import { TypedDeleteButton } from "@/components/typed-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { groupsService } from "@/services/groups.service";

export function GroupsList() {
  const { data: user } = useApiQuery(() => authService.me(), []);
  const { data: groups, loading, error, refetch } = useApiQuery(() => groupsService.list(), []);

  const canCreate = hasPermission(user?.permissions ?? [], "groups.create");
  const canUpdate = hasPermission(user?.permissions ?? [], "groups.update");

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="تنظيم الأرشيف" title="المجموعات" description="اجمع الملفات ذات الغرض المشترك، ورتبها بالطريقة التي تناسب سير العمل." />
      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>مجموعة جديدة</CardTitle>
            <CardDescription>مثال: ملفات العقود أو الملفات المالية أو بيانات الوزارة.</CardDescription>
          </CardHeader>
          <CardContent>
            <MutationForm action={groupsService.create} resetOnSuccess onSuccess={refetch} pendingMessage="جارٍ إنشاء المجموعة…" className="grid gap-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
              <div className="space-y-2"><Label htmlFor="new-group-name">اسم المجموعة</Label><Input id="new-group-name" name="name" required /></div>
              <div className="space-y-2"><Label htmlFor="new-group-description">الوصف</Label><Input id="new-group-description" name="description" /></div>
              <Button type="submit"><Plus className="size-4" />إنشاء المجموعة</Button>
            </MutationForm>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <div className="grid gap-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      ) : !groups?.length ? (
        <EmptyState title="لا توجد مجموعات بعد" description="أنشئ المجموعة الأولى، وبعدها ستتمكن من رفع ملفات Excel إليها." />
      ) : (
        <div className="grid gap-4">
          {groups.map((group, index) => (
            <Card key={group.id}>
              <CardContent className="p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle><Link href={`/groups/${group.id}`} className="hover:underline">{group.name}</Link></CardTitle>
                      <Badge variant="secondary">{group.fileCount} ملف</Badge>
                      <Badge variant="outline">{group.recordCount.toLocaleString("en-US")} سجل</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{group.description || "لا يوجد وصف لهذه المجموعة."}</p>
                  </div>
                  {canUpdate ? (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm"><Link href={`/groups/${group.id}`}><FolderOpen className="size-4" />فتح</Link></Button>
                      <MutationForm action={groupsService.reorder} onSuccess={refetch} pendingMessage="جارٍ حفظ الترتيب…">
                        <input type="hidden" name="id" value={group.id} /><input type="hidden" name="direction" value="up" />
                        <Button type="submit" size="icon" variant="outline" disabled={index === 0} aria-label="نقل المجموعة إلى الأعلى"><ArrowUp className="size-4" /></Button>
                      </MutationForm>
                      <MutationForm action={groupsService.reorder} onSuccess={refetch} pendingMessage="جارٍ حفظ الترتيب…">
                        <input type="hidden" name="id" value={group.id} /><input type="hidden" name="direction" value="down" />
                        <Button type="submit" size="icon" variant="outline" disabled={index === groups.length - 1} aria-label="نقل المجموعة إلى الأسفل"><ArrowDown className="size-4" /></Button>
                      </MutationForm>
                      <TypedDeleteButton id={group.id} entityName={group.name} description={`سيُحذف ${group.fileCount} ملف و${group.recordCount.toLocaleString("en-US")} سجل نهائيًا. لا يمكن التراجع عن هذا الإجراء.`} action={groupsService.remove} onSuccess={refetch} />
                    </div>
                  ) : null}
                </div>
                {canUpdate ? (
                  <details className="mt-4 border-t pt-4">
                    <summary className="cursor-pointer text-sm font-bold text-primary">تعديل الاسم والوصف</summary>
                    <MutationForm action={groupsService.update} onSuccess={refetch} className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
                      <input type="hidden" name="id" value={group.id} />
                      <div className="space-y-2"><Label htmlFor={`group-name-${group.id}`}>الاسم</Label><Input id={`group-name-${group.id}`} name="name" defaultValue={group.name} required /></div>
                      <div className="space-y-2"><Label htmlFor={`group-description-${group.id}`}>الوصف</Label><Input id={`group-description-${group.id}`} name="description" defaultValue={group.description} /></div>
                      <Button type="submit" variant="secondary">حفظ التعديلات</Button>
                    </MutationForm>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
