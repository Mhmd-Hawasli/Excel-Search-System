import { describe, expect, it } from "vitest";
import {
  OWNER_GLOBAL_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSIONS,
  isPermissionKey,
  permissionScopeKind,
} from "./permissions";

describe("permission catalog", () => {
  it("has unique keys and non-empty Arabic labels", () => {
    const keys = PERMISSIONS.map((permission) => permission.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const permission of PERMISSIONS) {
      expect(permission.key).toMatch(/^[a-zA-Z.]+\.[a-zA-Z]+$/);
      expect(permission.label.trim().length).toBeGreaterThan(0);
    }
    for (const group of PERMISSION_GROUPS) {
      expect(group.label.trim().length).toBeGreaterThan(0);
      expect(group.permissions.length).toBeGreaterThan(0);
    }
  });
  it("declares scope only for group/file permissions", () => {
    expect(permissionScopeKind("groups.viewScoped")).toBe("group");
    expect(permissionScopeKind("files.viewScoped")).toBe("file");
    expect(permissionScopeKind("search.scoped")).toBe("groupOrFile");
    expect(permissionScopeKind("users.view")).toBeNull();
    expect(permissionScopeKind("search.view")).toBeNull();
    expect(permissionScopeKind("nope")).toBeNull();
  });
  it("validates known and unknown keys", () => {
    expect(isPermissionKey("backup.restore")).toBe(true);
    expect(isPermissionKey("admin")).toBe(false);
  });
  it("grants every global permission to the owner and no scoped rows", () => {
    const global = PERMISSIONS.filter((permission) => !permission.scoped).map(
      (permission) => permission.key,
    );
    expect([...OWNER_GLOBAL_PERMISSIONS].sort()).toEqual([...global].sort());
  });
});
