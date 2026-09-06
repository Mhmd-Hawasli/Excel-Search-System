import type { DataScope } from "@/lib/auth/session-user";

/**
 * Intersects user-requested group/file filters with the effective search
 * scope. Returns null when nothing is searchable — either the user has no
 * data access at all or every requested filter is outside their scope (in
 * which case callers must render an empty result, never fall back to the
 * unrestricted archive).
 */
export function applySearchScope(
  requested: { groupIds: string[]; fileIds: string[] },
  scope: DataScope,
): { groupIds: string[]; fileIds: string[] } | null {
  if (scope.groupIds === null) return { groupIds: requested.groupIds, fileIds: requested.fileIds };
  const allowedGroups = new Set(scope.groupIds);
  const allowedFiles = new Set(scope.fileIds ?? []);
  const groupIds = requested.groupIds.length
    ? requested.groupIds.filter((id) => allowedGroups.has(id))
    : requested.fileIds.length
      ? []
      : [...allowedGroups];
  const fileIds = requested.fileIds.length
    ? requested.fileIds.filter((id) => allowedFiles.has(id))
    : requested.groupIds.length
      ? []
      : [...allowedFiles];
  if (groupIds.length === 0 && fileIds.length === 0) return null;
  return { groupIds, fileIds };
}
