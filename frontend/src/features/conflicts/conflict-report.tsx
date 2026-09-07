"use client";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { conflictsService } from "@/services/conflicts.service";

export function ConflictReport() {
  const { data, loading, error } = useApiQuery(() => conflictsService.list(), []);
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="تضارب البيانات" title="فحص تضارب البيانات" description="راجع الأرقام الوطنية المكررة والناقصة وغير الصالحة." />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">جارٍ الفحص…</p> : null}
      {data?.rows.length ? (
        <div className="space-y-3">
          {data.rows.map((row) => (
            <Card key={`${row.recordId}-${row.rule}`}>
              <CardContent className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-bold">{row.fullName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{row.fileName} • صف {row.rowIndex}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-destructive">{row.rule}</p>
                  <p className="text-xs text-muted-foreground">{row.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <EmptyState title="لا توجد نتائج" description="لا توجد تضاربات ضمن النطاق الحالي." />
      ) : null}
    </div>
  );
}
