import { unifyDataPermissions } from "@/lib/auth/permissions";

export type FilePermissionRow = {
  permission: string;
  groupId: string | null;
  fileId: string | null;
};
export type PermissionGroup = { id: string; name: string; files: { id: string; name: string }[] };

/** Resolve legacy all/group grants into the files displayed by the editor. */
export function selectedPermissionFiles(rows: FilePermissionRow[], groups: PermissionGroup[]): Set<string> {
  const normalized = unifyDataPermissions(rows);
  const all = normalized.some((row) => row.permission === "groups.view");
  const selectedGroups = new Set(normalized.filter((row) => row.permission === "groups.viewScoped" && row.groupId).map((row) => row.groupId));
  const selectedFiles = new Set(normalized.filter((row) => row.permission === "groups.viewScoped" && row.fileId).map((row) => row.fileId));
  return new Set(groups.flatMap((group) => group.files
    .filter((file) => all || selectedGroups.has(group.id) || selectedFiles.has(file.id))
    .map((file) => file.id)));
}

/** Group checkboxes are organizational; persist only explicit file grants. */
export function withPermissionFiles(rows: FilePermissionRow[], fileIds: Iterable<string>): FilePermissionRow[] {
  return [
    ...unifyDataPermissions(rows).filter((row) => !["groups.view", "groups.viewScoped"].includes(row.permission)),
    ...Array.from(new Set(fileIds), (fileId) => ({ permission: "groups.viewScoped", groupId: null, fileId })),
  ];
}
