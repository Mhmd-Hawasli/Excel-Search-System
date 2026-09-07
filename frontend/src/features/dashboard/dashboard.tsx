"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { groupsService } from "@/services/groups.service";

export function Dashboard() {
  const { data: groups, loading, error, refetch } = useApiQuery(() => groupsService.list(), []);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="لوحة التحكم"
        title="نظرة عامة على الأرشيف"
        description="ملفاتك وسجلاتك وأدوات العمل، في مكان واحد."
        actions={
          <Link href="/upload">
            <Button>رفع ملف جديد</Button>
          </Link>
        }
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="size-4" /> إجمالي المجموعات
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[32px] font-extrabold tabular-nums">
            {loading ? <Skeleton className="h-8 w-16" /> : (groups?.length ?? 0)}
          </CardContent>
          <CardDescription className="px-5 pb-5">مجموعات لتنظيم ملفاتك</CardDescription>
        </Card>
      </section>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>أحدث الملفات</CardTitle>
          <CardDescription>آخر الإضافات والتحديثات في أرشيفك</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : groups?.length ? (
            <p className="text-sm text-muted-foreground">اختر مجموعة من قائمة المجموعات لاستكشاف الملفات.</p>
          ) : (
            <EmptyState title="ابدأ بإضافة أول مجموعة" description="أنشئ مجموعة لتنظيم ملفاتك، ثم ارفع ملف إكسل لبدء البحث." />
          )}
        </CardContent>
      </Card>
      <button onClick={refetch} className="text-xs text-muted-foreground underline">تحديث</button>
    </div>
  );
}
