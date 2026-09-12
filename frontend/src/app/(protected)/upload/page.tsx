"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadWizard } from "@/features/upload/upload-wizard";
import { useApiQuery } from "@/hooks/use-api-query";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { categoriesService } from "@/services/categories.service";
import { groupsService } from "@/services/groups.service";
import { uploadService } from "@/services/upload.service";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  const searchParams = useSearchParams();
  const initialGroup = searchParams.get("group") ?? undefined;

  const { data: user } = useApiQuery(() => authService.me(), []);
  const { data: groups } = useApiQuery(() => groupsService.list(), []);
  const { data: categories } = useApiQuery(() => categoriesService.options(), []);
  const { data: templates } = useApiQuery(() => uploadService.templates(), []);

  if (!hasPermission(user?.permissions ?? [], "upload.view")) {
    return (
      <div className="space-y-7">
        <PageHeader
          eyebrow="استيراد البيانات"
          title="رفع ملف Excel"
          description="اختر ورقة واحدة أو عدة أوراق مترابطة بالرقم الوطني، ثم اربط حقول البحث ونظّم أعمدة التفاصيل قبل الاستيراد."
        />
        <p role="alert" className="text-sm text-destructive">غير موجود.</p>
      </div>
    );
  }

  if (!groups || !categories || !templates) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (groups.length === 0) {
    const restrictedToScope = !hasPermission(user?.permissions ?? [], "groups.view");
    return (
      <div className="space-y-7">
        <PageHeader
          eyebrow="استيراد البيانات"
          title="رفع ملف Excel"
          description="اختر ورقة واحدة أو عدة أوراق مترابطة بالرقم الوطني، ثم اربط حقول البحث ونظّم أعمدة التفاصيل قبل الاستيراد."
        />
        {restrictedToScope ? (
          <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            لا توجد مجموعات ضمن نطاق حسابك.
          </p>
        ) : (
          <EmptyState
            title="أنشئ مجموعة أولًا"
            description="يجب أن ينتمي كل ملف إلى مجموعة قبل رفعه."
            action={
              <Button asChild>
                <Link href="/groups">إنشاء مجموعة</Link>
              </Button>
            }
          />
        )}
      </div>
    );
  }

  if (!hasPermission(user?.permissions ?? [], "upload.run")) {
    return (
      <div className="space-y-7">
        <PageHeader
          eyebrow="استيراد البيانات"
          title="رفع ملف Excel"
          description="اختر ورقة واحدة أو عدة أوراق مترابطة بالرقم الوطني، ثم اربط حقول البحث ونظّم أعمدة التفاصيل قبل الاستيراد."
        />
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          حسابك لا يملك صلاحية رفع ملفات إكسل.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="استيراد البيانات"
        title="رفع ملف Excel"
        description="اختر ورقة واحدة أو عدة أوراق مترابطة بالرقم الوطني، ثم اربط حقول البحث ونظّم أعمدة التفاصيل قبل الاستيراد."
      />
      <UploadWizard
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        categories={categories}
        templates={templates}
        initialGroupId={
          initialGroup && groups.some((item) => item.id === initialGroup) ? initialGroup : undefined
        }
      />
    </div>
  );
}
