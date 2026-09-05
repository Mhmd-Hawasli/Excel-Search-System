import { describe, expect, it } from "vitest";
import { parseSearchParameters } from "@/lib/search/request";

const firstGroup = "2254b5b0-065d-4846-ab8a-d5f57f7655ab";
const secondGroup = "d57df626-8e31-4a3d-b8b8-d01bb4648d4f";
const firstFile = "ae3a6cd4-7a84-4d76-9f48-025cde590f34";

describe("search group parameters", () => {
  it("accepts and deduplicates multiple selected groups", () => {
    const parameters = new URLSearchParams({ q: "أحمد", mode: "full" });
    parameters.append("groupId", firstGroup);
    parameters.append("groupId", secondGroup);
    parameters.append("groupId", firstGroup);

    const result = parseSearchParameters(parameters);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.groupIds).toEqual([firstGroup, secondGroup]);
  });

  it("uses an empty group list for all groups", () => {
    const result = parseSearchParameters(
      new URLSearchParams({ q: "أحمد", mode: "custom", field: "full_name" }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.groupIds).toEqual([]);
  });

  it("accepts selected files alongside complete groups", () => {
    const parameters = new URLSearchParams({ q: "أحمد", groupId: firstGroup });
    parameters.append("fileId", firstFile);

    const result = parseSearchParameters(parameters);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fileIds).toEqual([firstFile]);
  });

  it("rejects an invalid selected group", () => {
    const parameters = new URLSearchParams({ q: "أحمد", groupId: "not-a-uuid" });
    expect(parseSearchParameters(parameters).success).toBe(false);
  });
});

describe("search sorting parameters", () => {
  it("accepts a supported column and direction", () => {
    const result = parseSearchParameters(
      new URLSearchParams({
        q: "أحمد",
        sortBy: "full_name",
        sortDirection: "desc",
      }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortBy).toBe("full_name");
      expect(result.data.sortDirection).toBe("desc");
    }
  });

  it("uses ascending order by default", () => {
    const result = parseSearchParameters(new URLSearchParams({ q: "أحمد", sortBy: "source" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sortDirection).toBe("asc");
  });

  it("rejects unsupported columns and directions", () => {
    expect(
      parseSearchParameters(new URLSearchParams({ q: "أحمد", sortBy: "created_at" })).success,
    ).toBe(false);
    expect(
      parseSearchParameters(
        new URLSearchParams({ q: "أحمد", sortBy: "source", sortDirection: "sideways" }),
      ).success,
    ).toBe(false);
  });
});
