"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { searchService } from "@/services/search.service";
import { cn } from "@/lib/cn";

export function SearchResults() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const { data, loading, error } = useApiQuery(
    () => searchService.search({ q: deferred, pageSize: 25 }),
    [deferred],
  );

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="بحث عربي مرن" title="البحث في جميع السجلات" description="تُراعى اختلافات الهمزة والتاء المربوطة والأرقام العربية تلقائيًا." />
      <form
        className="flex max-w-2xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم، رقم وطني، هاتف…" />
        <Button type="submit" disabled={loading}>بحث</Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">جارٍ البحث…</p> : null}
      {data?.items.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted text-muted-foreground">
                <th className="p-3 text-right">الاسم</th>
                <th className="p-3 text-right">الرقم الوطني</th>
                <th className="p-3 text-right">الملف</th>
                <th className="p-3 text-right">الصف</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className={cn("border-b last:border-0")}>
                  <td className="p-3">
                    <Link className="font-bold hover:text-primary" href={`/records/${item.id}`}>
                      {item.fullName ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3 tabular-nums">{item.nationalId ?? "—"}</td>
                  <td className="p-3">{item.fileName}</td>
                  <td className="p-3 tabular-nums">{item.rowIndex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data && query ? (
        <p className="text-sm text-muted-foreground">لا توجد نتائج.</p>
      ) : null}
    </div>
  );
}
