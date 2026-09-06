import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchRecords } from "./query";

const { queryRaw, transaction } = vi.hoisted(() => ({ queryRaw: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: queryRaw, $transaction: transaction } }));

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([]);
  transaction.mockReset().mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
});

describe("search file authorization boundary", () => {
  it("restricts both the count and results to allowed files even when their parent group is requested", async () => {
    const groupId = "2254b5b0-065d-4846-ab8a-d5f57f7655ab";
    const fileId = "ae3a6cd4-7a84-4d76-9f48-025cde590f34";
    await searchRecords({
      query: "محمد", mode: "full", page: 1, pageSize: 25,
      groupIds: [groupId], allowedFileIds: [fileId],
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    for (const [query] of queryRaw.mock.calls) {
      expect(query.sql).toContain('AND f.id IN (?::uuid)');
      expect(query.values).toContain(fileId);
      expect(query.values).toContain(groupId);
    }
  });

  it("returns no results instead of running unrestricted SQL for an empty allowed-file list", async () => {
    const result = await searchRecords({
      query: "محمد", mode: "full", page: 1, pageSize: 25,
      groupIds: ["g1"], allowedFileIds: [],
    });
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
