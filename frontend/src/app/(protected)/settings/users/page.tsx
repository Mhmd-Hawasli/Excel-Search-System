"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { UsersManager, type GroupOption, type ManagedUser } from "@/features/users/users-manager";
import { hasPermission } from "@/lib/permissions";
import { PERMISSION_GROUPS } from "@/lib/permission-catalog";
import { ApiError } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import { groupsService } from "@/services/groups.service";
import { usersService } from "@/services/users.service";

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [rights, setRights] = useState({ canCreate: false, canUpdate: false, canDelete: false });
  const [currentUserId, setCurrentUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [list, groupList, me] = await Promise.all([
          usersService.list(),
          groupsService.list(),
          authService.me(),
        ]);
        const details = await Promise.all(
          groupList.map((group) =>
            groupsService.get(group.id).catch(() => ({ group, files: [] as { id: string; name: string }[] })),
          ),
        );
        if (!active) return;
        setUsers(list);
        setGroups(
          details.map((detail) => ({
            id: detail.group.id,
            name: detail.group.name,
            files: detail.files.map((file) => ({ id: file.id, name: file.name })),
          })),
        );
        const perms = me?.permissions ?? [];
        setRights({
          canCreate: hasPermission(perms, "users.create"),
          canUpdate: hasPermission(perms, "users.update"),
          canDelete: hasPermission(perms, "users.delete"),
        });
        setCurrentUserId(me?.id ?? "");
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "تعذر تحميل المستخدمين.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-7">
        <PageHeader eyebrow="إدارة النظام" title="إدارة المستخدمين" description="إنشاء المستخدمين وتعديل بياناتهم وحذفهم والتحكم الكامل بصلاحيات كل مستخدم." />
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      </div>
    );
  }

  if (!users) {
    return (
      <div className="space-y-7">
        <PageHeader eyebrow="إدارة النظام" title="إدارة المستخدمين" description="إنشاء المستخدمين وتعديل بياناتهم وحذفهم والتحكم الكامل بصلاحيات كل مستخدم." />
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      </div>
    );
  }

  return (
    <UsersManager
      initialUsers={users}
      groups={groups}
      catalog={PERMISSION_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        permissions: group.permissions.map((permission) => ({ ...permission })),
      }))}
      canCreate={rights.canCreate}
      canUpdate={rights.canUpdate}
      canDelete={rights.canDelete}
      currentUserId={currentUserId}
    />
  );
}
