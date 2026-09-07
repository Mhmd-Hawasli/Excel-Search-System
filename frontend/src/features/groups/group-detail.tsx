"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { filesService } from "@/services/files.service";

export function GroupDetail({ groupId }: { groupId: string }) {
  const { data, loading, error } = useApiQuery(() => filesService.listByGroup(groupId), [groupId]);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="مجموعة" title="ملفات المجموعة" description="الملفات المؤرشفة في هذه المجموعة." />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((file) => (
            <Card key={file.id}>
              <CardContent className="space-y-2">
                <Link href={`/groups/${groupId}/files/${file.id}`} className="text-lg font-bold hover:text-primary">
                  {file.name}
                </Link>
                <p className="text-sm text-muted-foreground">{file.description || "—"}</p>
                <p className="text-xs text-muted-foreground">{file.rowCount.toLocaleString("en-US")} سجل • {file.columnCount ?? 0} عمود</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="لا توجد ملفات" description="ارفع ملفًا في هذه المجموعة." />
      )}
    </div>
  );
}
