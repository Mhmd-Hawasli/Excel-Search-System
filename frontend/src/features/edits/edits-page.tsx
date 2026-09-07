"use client";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { editsService } from "@/services/edits.service";

export function EditsPage() {
  const { data, loading, error } = useApiQuery(() => editsService.summary(), []);
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="التعديلات" title="الملفات المعدلة" description="راجع التعديلات وصدّر ملفاتك." />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : null}
      {data?.files.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.files.map((file) => (
            <Card key={file.fileId}>
              <CardContent className="space-y-2">
                <p className="font-bold">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">{file.groupName} • {file.editCount} تعديل</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <EmptyState title="لا توجد تعديلات" description="لا يوجد ملفات معدلة بعد." />
      ) : null}
    </div>
  );
}
