"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { groupsService } from "@/services/groups.service";

export function GroupsList() {
  const { data, loading, error, refetch } = useApiQuery(() => groupsService.list(), []);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await groupsService.create(name.trim());
      setName("");
      refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="المجموعات" title="مجموعات الأرشيف" description="نظّم ملفات الإكسل في مجموعات." />
      <form className="flex max-w-lg gap-2" onSubmit={create}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المجموعة" required />
        <Button type="submit" disabled={saving}>إضافة</Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : data?.length ? (
          data.map((group) => (
            <Card key={group.id}>
              <CardContent className="space-y-2">
                <Link href={`/groups/${group.id}`} className="text-lg font-bold hover:text-primary">
                  {group.name}
                </Link>
                <p className="text-sm text-muted-foreground">{group.description || "—"}</p>
              </CardContent>
            </Card>
          ))
        ) : (
          <EmptyState title="لا توجد مجموعات" description="أنشئ أول مجموعة للبدء." />
        )}
      </div>
    </div>
  );
}
