import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser, hasPermission, resolveDataScope } from "@/lib/auth/session-user";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const permissions = user.permissions
    .filter((row) => row.groupId === null && row.fileId === null)
    .map((row) => row.permission);
  if (hasPermission(user, "search.view")) permissions.push("search.view");
  const scope = await resolveDataScope(user);
  const canBrowseGroups =
    scope.groupIds === null || scope.groupIds.length > 0 || (scope.fileIds?.length ?? 0) > 0;
  return (
    <AppShell
      permissions={permissions}
      username={user.displayName?.trim() ? user.displayName : user.username}
      canBrowseGroups={canBrowseGroups}
    >
      {children}
    </AppShell>
  );
}
