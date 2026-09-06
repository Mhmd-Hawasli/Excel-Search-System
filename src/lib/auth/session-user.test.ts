import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasPermission,
  isFileVisible,
  resolveDataScope,
  resolveSearchScope,
  type SessionUser,
} from "./session-user";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { file: { findMany } } }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const files = [
  { id: "f1", groupId: "g1" },
  { id: "f2", groupId: "g1" },
  { id: "f3", groupId: "g2" },
];
const user = (permissions: SessionUser["permissions"]): SessionUser => ({
  id: "u1", username: "test", displayName: null, permissions,
});

beforeEach(() => {
  findMany.mockReset();
  findMany.mockImplementation(async ({ where }) => files.filter((file) =>
    where.id ? where.id.in.includes(file.id) : where.groupId.in.includes(file.groupId),
  ));
});

describe("shared viewing and searching permissions", () => {
  it("grants viewing and searching all data with the single global option", async () => {
    const actor = user([{ permission: "groups.view", groupId: null, fileId: null }]);
    expect(hasPermission(actor, "search.view")).toBe(true);
    expect(await resolveSearchScope(actor)).toEqual({ groupIds: null, fileIds: null });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("grants every file in the selected group to both viewing and search", async () => {
    const actor = user([{ permission: "groups.viewScoped", groupId: "g1", fileId: null }]);
    const data = await resolveDataScope(actor);
    expect(data).toEqual({ groupIds: ["g1"], fileIds: ["f1", "f2"] });
    expect(await resolveSearchScope(actor)).toEqual(data);
    expect(await isFileVisible(actor, files[2])).toBe(false);
  });

  it.each(["groups.viewScoped", "files.viewScoped"])(
    "keeps a single-file grant isolated from siblings (%s)", async (permission) => {
      const actor = user([{ permission, groupId: null, fileId: "f1" }]);
      expect(hasPermission(actor, "search.view")).toBe(true);
      expect(await resolveDataScope(actor)).toEqual({ groupIds: ["g1"], fileIds: ["f1"] });
      expect(await resolveSearchScope(actor)).toEqual({ groupIds: ["g1"], fileIds: ["f1"] });
      expect(await isFileVisible(actor, files[0])).toBe(true);
      expect(await isFileVisible(actor, files[1])).toBe(false);
    },
  );

  it("combines a whole group and an individual file without extra search grants", async () => {
    const actor = user([
      { permission: "groups.viewScoped", groupId: "g2", fileId: null },
      { permission: "groups.viewScoped", groupId: null, fileId: "f1" },
    ]);
    expect(await resolveSearchScope(actor)).toEqual({ groupIds: ["g2", "g1"], fileIds: ["f1", "f3"] });
    expect(await isFileVisible(actor, files[1])).toBe(false);
  });

  it("uses existing viewing grants when retiring separate search restrictions", async () => {
    const actor = user([
      { permission: "groups.viewScoped", groupId: "g1", fileId: null },
      { permission: "search.view", groupId: null, fileId: null },
      { permission: "search.scoped", groupId: "g2", fileId: null },
    ]);
    expect(await resolveSearchScope(actor)).toEqual(await resolveDataScope(actor));
    expect(await isFileVisible(actor, files[2])).toBe(false);
  });

  it("does not create data access from an old search-only grant or no grants", async () => {
    for (const permissions of [[], [{ permission: "search.view", groupId: null, fileId: null }]]) {
      const actor = user(permissions);
      expect(hasPermission(actor, "search.view")).toBe(false);
      expect(await resolveSearchScope(actor)).toBeNull();
    }
  });
});
