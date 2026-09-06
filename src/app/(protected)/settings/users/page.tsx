import { PERMISSION_GROUPS } from "@/lib/auth/permissions";
import { getSessionUser, hasPermission, requirePagePermission } from "@/lib/auth/session-user";
import { prisma } from "@/lib/db/prisma";
import { UsersManager } from "@/features/users/users-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePagePermission("users.view");
  const actor = await getSessionUser();
  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        isActive: true,
        createdAt: true,
        permissions: { select: { permission: true, groupId: true, fileId: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.group.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        files: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
    }),
  ]);
  return (
    <UsersManager
      initialUsers={users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }))}
      groups={groups}
      catalog={PERMISSION_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        permissions: group.permissions.map((permission) => ({ ...permission })),
      }))}
      canCreate={actor ? hasPermission(actor, "users.create") : false}
      canUpdate={actor ? hasPermission(actor, "users.update") : false}
      canDelete={actor ? hasPermission(actor, "users.delete") : false}
      currentUserId={actor?.id ?? ""}
    />
  );
}
