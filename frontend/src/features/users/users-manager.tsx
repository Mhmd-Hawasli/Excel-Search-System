"use client";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useApiQuery } from "@/hooks/use-api-query";
import { usersService } from "@/services/users.service";

export function UsersManager() {
  const { data, loading, error } = useApiQuery(() => usersService.list(), []);
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="الإعدادات" title="المستخدمون" description="إدارة المستخدمين وصلاحياتهم." />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : null}
      {data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((user) => (
            <Card key={user.id}>
              <CardContent className="space-y-2">
                <p className="font-bold">{user.displayName ?? user.username}</p>
                <p className="text-xs text-muted-foreground">@{user.username} • {user.permissions.length} صلاحية</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <EmptyState title="لا يوجد مستخدمون" />
      ) : null}
    </div>
  );
}
