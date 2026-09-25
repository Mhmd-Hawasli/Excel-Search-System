"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, History, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatUploadDateTime } from "@/lib/format/date";
import { filesService } from "@/services/files.service";

const KIND_LABELS: Record<string, string> = {
  manual: "رفع يدوي",
  update: "تحديث ملف",
  upload: "رفع أولي",
  seed: "إصدار سابق",
};

export function VersionHistoryCard({ fileId, canExport, canViewHistory = true }: { fileId: string; canExport: boolean; canViewHistory?: boolean }) {
  const { data, loading } = useApiQuery(() => filesService.listVersions(fileId), [fileId]);
  const [markEdits, setMarkEdits] = useState(false);

  if (loading) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (!data || data.versions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            سجل الإصدارات (الإصدار الحالي {data.currentVersion})
          </span>
          {canExport ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={markEdits}
                onChange={(e) => setMarkEdits(e.target.checked)}
              />
              تعليم القيم المعدلة في ملفات التصدير
            </label>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {data.versions.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3">
              <div className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  <Badge>الإصدار {entry.version}</Badge>
                  <Badge variant="secondary">{KIND_LABELS[entry.kind] ?? entry.kind}</Badge>
                  {entry.editCount > 0 ? (
                    <Badge variant="outline">{entry.editCount} تعديل</Badge>
                  ) : null}
                </p>
                <p className="text-sm leading-6">{entry.note}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.createdBy ? `بواسطة ${entry.createdBy} — ` : ""}
                  <span className="ltr-numbers">{formatUploadDateTime(new Date(entry.createdAt))}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canViewHistory ? (
                  <Button asChild size="sm" variant="outline" title={`عرض سجل تعديلات الإصدار ${entry.version}`}>
                    <Link href={`/edits/${fileId}?version=${entry.version}`}>
                      <PencilLine className="size-4" />
                      عرض سجل التعديلات
                    </Link>
                  </Button>
                ) : null}
                {canExport && entry.canExport ? (
                  <Button asChild size="sm" variant="outline" title={`تنزيل نسخة الإصدار ${entry.version}`}>
                    <a href={`/api/files/${fileId}/export?version=${entry.version}${markEdits ? "&markEdits=true" : ""}`}>
                      <Download className="size-4" />
                      تصدير الإصدار {entry.version}
                    </a>
                  </Button>
                ) : canExport ? <span className="text-xs text-muted-foreground">لا تتوفر نسخة دقيقة محفوظة لهذا الإصدار</span> : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
