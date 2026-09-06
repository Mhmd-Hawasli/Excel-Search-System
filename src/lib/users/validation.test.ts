import { describe, expect, it, vi } from "vitest";
import {
  createUserSchema,
  permissionAssignmentSchema,
  replacePermissionsSchema,
  serializeUser,
} from "./validation";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const groupId = "2254b5b0-065d-4846-ab8a-d5f57f7655ab";
const fileId = "ae3a6cd4-7a84-4d76-9f48-025cde590f34";
const permissions = [
  { permission: "search.view", groupId: null, fileId: null },
  { permission: "groups.viewScoped", groupId, fileId: null },
  { permission: "files.viewScoped", groupId: null, fileId },
  { permission: "search.scoped", groupId, fileId: null },
  { permission: "search.scoped", groupId: null, fileId },
];

describe("user permission payload validation", () => {
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
    { permission: "groups.viewScoped", groupId: null, fileId },
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
