import { describe, expect, it, vi } from "vitest";
import {
  createUserSchema,
  permissionAssignmentSchema,
  replacePermissionsSchema,
  serializeUser,
  resolveFileAssignments,
} from "./validation";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { file: { findMany } } }));

const groupId = "2254b5b0-065d-4846-ab8a-d5f57f7655ab";
const fileId = "ae3a6cd4-7a84-4d76-9f48-025cde590f34";
const permissions = [
  { permission: "users.view", groupId: null, fileId: null },
  { permission: "groups.viewScoped", groupId, fileId: null },
  { permission: "groups.viewScoped", groupId: null, fileId },
];

describe("user permission payload validation", () => {
  it("saves group shortcuts as file grants, deduplicating files already checked", async () => {
    findMany.mockResolvedValueOnce([{ id: fileId }]);
    expect(await resolveFileAssignments(permissions)).toEqual([
      { permission: "users.view", groupId: null, fileId: null },
      { permission: "groups.viewScoped", groupId: null, fileId },
    ]);
    expect(findMany).toHaveBeenLastCalledWith({ where: { groupId: { in: [groupId] } }, select: { id: true } });
  });

  it("saves all as current file IDs without retaining an unrestricted grant", async () => {
    findMany.mockResolvedValueOnce([{ id: fileId }]);
    expect(await resolveFileAssignments([{ permission: "groups.view", groupId: null, fileId: null }]))
      .toEqual([{ permission: "groups.viewScoped", groupId: null, fileId }]);
    expect(findMany).toHaveBeenLastCalledWith({ where: {}, select: { id: true } });
  });

  it("preserves a selected file independently of future files in its group", async () => {
    findMany.mockClear();
    const rows = [{ permission: "groups.viewScoped", groupId: null, fileId }];
    expect(await resolveFileAssignments(rows)).toEqual(rows);
    expect(findMany).not.toHaveBeenCalled();
  });
  it("accepts the create form's mixed global and scoped permissions with null IDs", () => {
    const result = createUserSchema.safeParse({
      username: "test-user",
      password: "test-password",
      isActive: true,
      permissions,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.permissions).toEqual(permissions);
  });

  it("accepts serialized permissions when saving an existing user's permissions", () => {
    const user = serializeUser({
      id: "test-user-id",
      username: "test-user",
      displayName: null,
      isActive: true,
      createdAt: new Date("2026-09-06T00:00:00Z"),
      permissions,
    });
    expect(replacePermissionsSchema.safeParse({ permissions: user.permissions }).success).toBe(true);
  });

  it("continues to accept omitted IDs and an empty permissions list", () => {
    expect(permissionAssignmentSchema.safeParse({ permission: "search.view" }).success).toBe(true);
    expect(permissionAssignmentSchema.safeParse({ permission: "search.scoped", groupId }).success).toBe(true);
    expect(replacePermissionsSchema.safeParse({ permissions: [] }).success).toBe(true);
  });

  it.each([
    { permission: "unknown", groupId: null, fileId: null },
    { permission: "search.view", groupId, fileId: null },
    { permission: "groups.viewScoped", groupId: null, fileId: null },
    { permission: "groups.viewScoped", groupId, fileId },
    { permission: "files.viewScoped", groupId, fileId: null },
    { permission: "files.viewScoped", groupId: null, fileId: null },
    { permission: "search.scoped", groupId: null, fileId: null },
    { permission: "search.scoped", groupId, fileId },
    { permission: "search.scoped", groupId: "invalid", fileId: null },
    { permission: "search.scoped", groupId: null, fileId: "" },
  ])("rejects invalid permission scopes: %j", (assignment) => {
    expect(permissionAssignmentSchema.safeParse(assignment).success).toBe(false);
  });
});
