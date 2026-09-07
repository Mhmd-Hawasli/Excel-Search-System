"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { recordsService } from "@/services/records.service";

export function RecordDetails({ recordId }: { recordId: string }) {
  const { data, loading, error } = useApiQuery(() => recordsService.get(recordId), [recordId]);

  useEffect(() => {
    recordsService.visit(recordId).catch(() => undefined);
  }, [recordId]);

  if (loading) return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  if (error || !data) return <p className="text-sm text-destructive">{error ?? "غير موجود."}</p>;

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="سجل" title={`سجل الصف ${data.rowIndex}`} description={`${data.fileName} — ${data.groupName}`} />
      <Card>
        <CardContent className="space-y-3">
          {Object.entries(data.data).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4 border-b pb-2 last:border-0">
              <span className="font-semibold">{key}</span>
              <span className="text-muted-foreground">{String(value ?? "")}</span>
            </div>
          ))}
          {data.edits.length ? (
            <>
              <h3 className="pt-3 font-bold">سجل التعديلات</h3>
              {data.edits.map((edit) => (
                <div key={edit.id} className="border-t pt-2 text-sm">
                  <p className="font-semibold">{edit.headerRaw}</p>
                  <p className="text-muted-foreground">{edit.oldValue} ← {edit.newValue}</p>
                </div>
              ))}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
