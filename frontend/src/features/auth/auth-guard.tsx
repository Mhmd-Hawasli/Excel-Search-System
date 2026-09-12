"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { authService } from "@/services/auth.service";
import type { CurrentUser } from "@/types/model";

function toShellVisibility(user: CurrentUser): { permissions: string[]; username: string; canBrowseGroups: boolean } {
  const globals = user.permissions
    .filter((row) => row.groupId == null && row.fileId == null)
    .map((row) => (row.permission === "files.viewScoped" ? "groups.viewScoped" : row.permission))
    .filter((key) => key !== "search.view" && key !== "search.scoped");
  const hasSearchView =
    globals.includes("groups.view") ||
    user.permissions.some(
      (row) =>
        (row.permission === "groups.viewScoped" || row.permission === "files.viewScoped") &&
        (row.groupId != null || row.fileId != null),
    );
  const permissions = hasSearchView && !globals.includes("search.view") ? [...globals, "search.view"] : globals;
  const username = user.displayName?.trim() ? user.displayName : user.username;
  // Client approximation for shell navigation only; backend remains authoritative
  // for exact group/file scope (V1 layout expands groups→files via DB).
  const canBrowseGroups =
    permissions.includes("groups.view") ||
    user.permissions.some(
      (row) =>
        (row.permission === "groups.viewScoped" || row.permission === "files.viewScoped") &&
        (row.groupId != null || row.fileId != null),
    );
  return { permissions, username, canBrowseGroups };
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [shell, setShell] = useState<{ permissions: string[]; username: string; canBrowseGroups: boolean } | null>(null);

  useEffect(() => {
    authService.me()
      .then((user) => {
        if (!user) {
          const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
          router.replace(`/login${next}`);
        } else {
          setShell(toShellVisibility(user));
        }
      })
      .catch(() => {
        const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${next}`);
      });
  }, [router, pathname]);

  // No protected-content flash: children stay hidden until `me` resolves.
  if (!shell) return <div className="p-8 text-sm text-muted-foreground">جارٍ التحقق من الجلسة…</div>;
  return (
    <AppShell permissions={shell.permissions} username={shell.username} canBrowseGroups={shell.canBrowseGroups}>
      {children}
    </AppShell>
  );
}
