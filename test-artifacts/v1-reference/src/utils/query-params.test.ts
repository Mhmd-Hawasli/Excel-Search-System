import { describe, expect, it } from "vitest";
import { buildQueryPath, buildQueryString, toUrlSearchParams } from "@/utils/query-params";

describe("toUrlSearchParams", () => {
  it("preserves repeated keys from typed search params", () => {
    const params = toUrlSearchParams({ groupId: ["a", "b"], q: "test", empty: undefined });
    expect(params.getAll("groupId")).toEqual(["a", "b"]);
    expect(params.get("q")).toBe("test");
    expect(params.has("empty")).toBe(false);
  });
});

describe("buildQueryString", () => {
  it("applies partial updates to an existing query", () => {
    const current = new URLSearchParams("q=ahmad&mode=custom&page=3");
    expect(buildQueryString(current, { mode: "full" })).toBe("?q=ahmad&mode=full");
  });

  it("removes keys set to null and keeps repeated values for arrays", () => {
    const current = new URLSearchParams("q=ahmad&groupId=a&groupId=b");
    const next = new URLSearchParams(buildQueryString(current, { groupId: ["c", "d"], q: null }));
    expect(next.getAll("groupId")).toEqual(["c", "d"]);
    expect(next.has("q")).toBe(false);
  });

  it("resets the page when any non-page param changes", () => {
    const current = new URLSearchParams("q=ahmad&page=7");
    expect(buildQueryString(current, { q: "sami" })).toBe("?q=sami");
  });

  it("keeps the page when page itself is updated", () => {
    const current = new URLSearchParams("q=ahmad&page=2");
    expect(buildQueryString(current, { page: 3 })).toBe("?q=ahmad&page=3");
  });

  it("returns an empty string when no params remain", () => {
    expect(buildQueryString(new URLSearchParams("q=x"), { q: null })).toBe("");
  });
});

describe("buildQueryPath", () => {
  it("joins the pathname with the updated query", () => {
    expect(buildQueryPath("/search", new URLSearchParams("q=a"), { sortBy: "full_name" })).toBe(
      "/search?q=a&sortBy=full_name",
    );
  });
});
