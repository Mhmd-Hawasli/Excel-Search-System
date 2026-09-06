import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";
import { unifyDataPermissions } from "@/lib/auth/permissions";

export type SessionPermissionRow = {
  permission: string;
  groupId: string | null;
  fileId: string | null;
};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string | null;
  permissions: SessionPermissionRow[];
};

/** Current request user (cached per request). Null when signed out, unknown or deactivated. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      isActive: true,
      permissions: { select: { permission: true, groupId: true, fileId: true } },
    },
  });
  if (!user || !user.isActive || user.username !== payload.username) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    permissions: unifyDataPermissions(user.permissions),
  };
});

/** Global (unscoped) grant check. Scoped rows never satisfy a global permission. */
export function hasPermission(user: SessionUser, key: string): boolean {
  if (key === "search.view") {
    return unifyDataPermissions(user.permissions).some((row) =>
      (row.permission === "groups.view" && !row.groupId && !row.fileId) ||
      (row.permission === "groups.viewScoped" && Boolean(row.groupId || row.fileId)),
    );
  }
  return user.permissions.some(
    (row) => row.permission === key && row.groupId === null && row.fileId === null,
  );
}

export type DataScope = {
  /** Null means every group; otherwise exactly the visible group ids. */
  groupIds: string[] | null;
  /** Null means every file; otherwise exactly the visible file ids. */
  fileIds: string[] | null;
};

/**
 * Browsable data scope. Full `groups.view` sees everything; otherwise only
 * explicitly granted groups plus the parent groups of granted files (needed
 * for navigation), and the files inside granted groups plus granted files.
 */
export async function resolveDataScope(user: SessionUser): Promise<DataScope> {
  if (hasPermission(user, "groups.view")) return { groupIds: null, fileIds: null };
  const groupIds = new Set<string>();
  const fileIds = new Set<string>();
  for (const row of unifyDataPermissions(user.permissions)) {
    if (row.permission === "groups.viewScoped" && row.groupId) groupIds.add(row.groupId);
    if (row.permission === "groups.viewScoped" && row.fileId) fileIds.add(row.fileId);
  }
  // Expand only explicitly granted groups, before adding parents for navigation.
  if (groupIds.size > 0) {
    const inside = await prisma.file.findMany({
      where: { groupId: { in: [...groupIds] } },
      select: { id: true },
    });
    for (const file of inside) fileIds.add(file.id);
  }
  if (fileIds.size > 0) {
    const parents = await prisma.file.findMany({
      where: { id: { in: [...fileIds] } },
      select: { groupId: true },
    });
    for (const parent of parents) groupIds.add(parent.groupId);
  }
  return { groupIds: [...groupIds], fileIds: [...fileIds] };
}

/**
 * Viewing and searching always share the same grants.
 */
export async function resolveSearchScope(user: SessionUser): Promise<DataScope | null> {
  if (!hasPermission(user, "search.view")) return null;
  return resolveDataScope(user);
}

/** Pages: signed-out users go to login, unauthorized users go home (hidden). */
export async function requirePagePermission(key: string): Promise<SessionUser> {  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, key)) redirect("/");
  return user;
}

/** Server actions: null means "pretend it does not exist". */
export async function requireActionPermission(key: string): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || !hasPermission(user, key)) return null;
  return user;
}

export const ACTION_FORBIDDEN_MESSAGE = "غير موجود.";

function apiSessionExpired() {
  return NextResponse.json({ error: "انتهت الجلسة. يرجى تسجيل الدخول من جديد." }, { status: 401 });
}

export function apiNotFound() {
  return NextResponse.json({ error: "غير موجود." }, { status: 404 });
}

/** API routes: 401 when signed out, 404 when unauthorized (hidden). */
export async function requireApiPermission(
  key: string,
): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getSessionUser();
  if (!user) return apiSessionExpired();
  if (!hasPermission(user, key)) return apiNotFound();
  return { user };
}

/** True when the group is inside the user's browsable scope. */
export async function isGroupVisible(user: SessionUser, groupId: string): Promise<boolean> {
  const scope = await resolveDataScope(user);
  if (scope.groupIds === null) return true;
  return scope.groupIds.includes(groupId);
}

/** True when the file is inside the user's browsable scope. */
export async function isFileVisible(
  user: SessionUser,
  file: { id: string; groupId: string },
): Promise<boolean> {
  const scope = await resolveDataScope(user);
  if (scope.groupIds === null) return true;
  return (scope.fileIds ?? []).includes(file.id);
}
