import type { PermissionAssignment } from "@/types/model";

/**
 * Client-side permission helpers mirroring V1 lib/auth/session-user.ts.
 * Used only for hiding UI; the backend remains authoritative.
 */

function normalized(rows: PermissionAssignment[]): PermissionAssignment[] {
  const seen = new Set<string>();
  const result: PermissionAssignment[] = [];
  for (const row of rows) {
    if (row.permission === "search.view" || row.permission === "search.scoped") continue;
    const permission = row.permission === "files.viewScoped" ? "groups.viewScoped" : row.permission;
    const key = `${permission}|${row.groupId ?? ""}|${row.fileId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...row, permission });
  }
  return result;
}

/** Global (unscoped) grant check. Scoped rows never satisfy a global permission. */
export function hasPermission(rows: PermissionAssignment[], key: string): boolean {
  const perms = normalized(rows);
  if (key === "search.view") {
    return perms.some(
      (row) =>
        (row.permission === "groups.view" && !row.groupId && !row.fileId) ||
        (row.permission === "groups.viewScoped" && Boolean(row.groupId || row.fileId)),
    );
  }
  if (key === "groups.view" || key === "groups.manage") {
    return perms.some(
      (row) =>
        (row.permission === "groups.view" || row.permission === "groups.manage") &&
        !row.groupId &&
        !row.fileId,
    );
  }
  // Fine-grained group management mirrors the backend: legacy groups.view /
  // groups.manage grants keep full management power in the UI.
  if (key === "groups.create" || key === "groups.update") {
    return perms.some(
      (row) =>
        (row.permission === key ||
          row.permission === "groups.view" ||
          row.permission === "groups.manage") &&
        !row.groupId &&
        !row.fileId,
    );
  }
  return perms.some((row) => row.permission === key && !row.groupId && !row.fileId);
}

/**
 * Client approximation of V1's browsable-scope check for shell navigation only.
 * Exact scope is enforced server-side per request.
 */
export function canBrowseGroups(rows: PermissionAssignment[]): boolean {
  const perms = normalized(rows);
  return (
    perms.some((row) => row.permission === "groups.view" && !row.groupId && !row.fileId) ||
    perms.some(
      (row) => row.permission === "groups.viewScoped" && Boolean(row.groupId || row.fileId),
    )
  );
}
