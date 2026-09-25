"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronsUp, Download, PencilLine, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { MoveFileButton } from "@/components/move-file-button";
import { TypedDeleteButton } from "@/components/typed-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { STANDARD_FIELD_LABELS, type StandardFieldKey } from "@/lib/standard-fields";
import { formatUploadDateTime } from "@/lib/format/date";
import { hasPermission } from "@/lib/permissions";
import { authService } from "@/services/auth.service";
import { filesService } from "@/services/files.service";
import { VersionBumpDialog } from "@/features/files/version-bump-dialog";
import { VersionHistoryCard } from "@/features/files/version-history-card";

export function FileDetail({ groupId, fileId }: { groupId: string; fileId: string }) {
  const { data: user } = useApiQuery(() => authService.me(), []);
  const { data, loading, error, refetch } = useApiQuery(() => filesService.detail(fileId, groupId), [fileId, groupId]);
  const { data: versions, refetch: refetchVersions } = useApiQuery(() => filesService.listVersions(fileId), [fileId]);
  const [markEdits, setMarkEdits] = useState(false);
  const [bumpOpen, setBumpOpen] = useState(false);

  const permissions = user?.permissions ?? [];
  const canEditMapping = hasPermission(permissions, "upload.view");
  const canBumpVersion = hasPermission(permissions, "versions.bump");
  const canViewHistory = hasPermission(permissions, "edits.view");
  const canExport = hasPermission(permissions, "export.run");
  const canManageFiles = hasPermission(permissions, "groups.view");
  const canMoveFiles = hasPermission(permissions, "groups.update");
  const showEditedBadge = hasPermission(permissions, "edits.badge");

  if (loading || !data) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-7">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/groups/${groupId}`}>
            <ArrowRight className="size-4" />
            العودة إلى المجموعة
          </Link>
        </Button>
        <p role="alert" className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  const { file, columns, qualityIssueCount, editCount } = data;
  const exportHref = `/api/files/${file.id}/export${markEdits ? "?markEdits=true" : ""}`;

  return (
    <div className="space-y-7">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/groups/${groupId}`}>
          <ArrowRight className="size-4" />
          العودة إلى المجموعة
        </Link>
      </Button>

      <PageHeader
        eyebrow={`الإصدار ${file.version}`}
        title={file.name}
        description={file.description || file.originalFilename}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/groups/${groupId}/files/${file.id}/quality`}>
                <ShieldCheck className="size-4" />
                تقرير الجودة
              </Link>
            </Button>
            {canEditMapping ? (
              <Button asChild variant="secondary">
                <Link href={`/groups/${groupId}/files/${file.id}/edit`}>
                  <SlidersHorizontal className="size-4" />
                  تعديل الأعمدة والفئات
                </Link>
              </Button>
            ) : null}
            {canEditMapping ? (
              <Button asChild>
                <Link href={`/groups/${groupId}/files/${file.id}/update`}>
                  <RefreshCw className="size-4" />
                  تحديث الملف
                </Link>
              </Button>
            ) : null}
            {canBumpVersion ? (
              <Button variant="secondary" onClick={() => setBumpOpen(true)} title="رفع الإصدار N إلى N+1 مع رسالة تصف التغيرات">
                <ChevronsUp className="size-4" />
                رفع إصدار الملف
              </Button>
            ) : null}
            {canViewHistory ? (
              <Button asChild variant="outline">
                <Link href={`/edits/${file.id}`}>
                  <PencilLine className="size-4" />
                  سجل التعديلات{editCount ? ` (${editCount})` : ""}
                </Link>
              </Button>
            ) : null}
            {canExport ? (
              <Button asChild variant="outline">
                <a href={exportHref}>
                  <Download className="size-4" />
                  تصدير Excel
                </a>
              </Button>
            ) : null}
            {canMoveFiles ? (
              <MoveFileButton
                fileId={file.id}
                fileName={file.name}
                currentGroupId={groupId}
                label="نقل إلى مجموعة"
                size="default"
              />
            ) : null}
            {canManageFiles ? (
              <TypedDeleteButton
                id={file.id}
                entityName={file.name}
                description={`سيُحذف ${file.rowCount.toLocaleString("en-US")} سجل و${columns.length} عمود نهائيًا. لا يمكن التراجع عن ذلك.`}
                action={(formData) => filesService.removeByForm(formData, groupId)}
              />
            ) : null}
          </div>
        }
      />

      {file.version > 1 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm md:flex-row md:items-center md:justify-between">
          <p className="font-bold flex items-center gap-2 text-primary">
            <RefreshCw className="size-4" />
            هذا إصدار جديد (الإصدار {file.version}) — سجل تعديلات الإصدارات السابقة محفوظ ومؤرشف في سجل التعديلات
          </p>
          {canViewHistory ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/edits/${file.id}`}>عرض سجل التعديلات</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      {showEditedBadge && editCount > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/60 bg-amber-50 p-4 text-sm md:flex-row md:items-center md:justify-between dark:bg-amber-950/20">
          <p className="font-bold flex items-center gap-2 text-amber-900 dark:text-amber-100">
            <PencilLine className="size-4" />
            هذا الملف تم تعديله يدويًا
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canExport ? (
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-amber-400/60 bg-background px-3 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={markEdits}
                  onChange={(e) => setMarkEdits(e.target.checked)}
                />
                تعليم القيم التي تم تعديلها
              </label>
            ) : null}
            {canViewHistory ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/edits/${file.id}`}>عرض سجل التعديلات</Link>
              </Button>
            ) : null}
            {canExport ? (
              <Button asChild size="sm">
                <a href={exportHref}>
                  <Download className="size-4" />
                  تصدير Excel بالقيم المعدلة
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <VersionHistoryCard fileId={file.id} canExport={canExport} canViewHistory={canViewHistory} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">السجلات</p>
            <p className="mt-2 text-2xl font-black">{file.rowCount.toLocaleString("en-US")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">الأعمدة</p>
            <p className="mt-2 text-2xl font-black">{columns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">مشكلات الجودة</p>
            <p className="mt-2 text-2xl font-black">{qualityIssueCount.toLocaleString("en-US")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">تاريخ الرفع</p>
            <p className="mt-2 font-black ltr-numbers text-right">{formatUploadDateTime(new Date(file.uploadedAt))}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>خريطة الأعمدة</CardTitle>
          <CardDescription>
            الأعمدة كما حُفظت من Excel، مع الحقل القياسي والفئة الحالية. استخدم &quot;تعديل الأعمدة والفئات&quot; لتغيير الربط وإعادة حساب البيانات.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-right">#</th>
                <th className="p-3 text-right">عنوان Excel</th>
                <th className="p-3 text-right">حقل البحث</th>
                <th className="p-3 text-right">الفئة</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column.id} className="border-t">
                  <td className="p-3">{column.columnIndex}</td>
                  <td className="p-3 font-bold">{column.headerRaw}</td>
                  <td className="p-3">
                    {column.standardField ? (
                      <Badge variant="secondary">
                        {STANDARD_FIELD_LABELS[column.standardField as StandardFieldKey]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">{column.categoryName ?? "أخرى"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canBumpVersion ? (
        <VersionBumpDialog
          fileId={file.id}
          fileName={file.name}
          currentVersion={file.version}
          pendingEditCount={versions?.pendingEditCount ?? 0}
          open={bumpOpen}
          onOpenChange={setBumpOpen}
          onDone={() => {
            refetch();
            refetchVersions();
          }}
        />
      ) : null}
    </div>
  );
}
