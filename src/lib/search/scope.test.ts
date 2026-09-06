import { describe, expect, it } from "vitest";
import { applySearchScope } from "./scope";

const ALL = { groupIds: null, fileIds: null } as const;
const SCOPED = { groupIds: ["g1"], fileIds: ["g1f1", "f9"] };
const EMPTY = { groupIds: [], fileIds: [] as string[] };

describe("applySearchScope", () => {
  it("passes requested filters through for unrestricted users", () => {
    expect(applySearchScope({ groupIds: ["g1"], fileIds: [] }, { ...ALL })).toEqual({
      groupIds: ["g1"],
      fileIds: [],
    });
    expect(applySearchScope({ groupIds: [], fileIds: [] }, { ...ALL })).toEqual({
      groupIds: [],
      fileIds: [],
    });
  });

  it("defaults to the effective scope when nothing is requested", () => {
    expect(applySearchScope({ groupIds: [], fileIds: [] }, SCOPED)).toEqual(SCOPED);
  });

  it("intersects requested filters with the scope", () => {
    expect(applySearchScope({ groupIds: ["g1", "g2"], fileIds: [] }, SCOPED)).toEqual({
      groupIds: ["g1"],
      fileIds: [],
    });
    expect(applySearchScope({ groupIds: [], fileIds: ["f9", "fx"] }, SCOPED)).toEqual({
      groupIds: [],
      fileIds: ["f9"],
    });
  });

  it("returns null for fully out-of-scope requests", () => {
    expect(applySearchScope({ groupIds: ["g2"], fileIds: [] }, SCOPED)).toBeNull();
    expect(applySearchScope({ groupIds: [], fileIds: ["fx"] }, SCOPED)).toBeNull();
  });

  it("returns null when the user can see nothing", () => {
    expect(applySearchScope({ groupIds: [], fileIds: [] }, EMPTY)).toBeNull();
    expect(applySearchScope({ groupIds: ["g1"], fileIds: [] }, EMPTY)).toBeNull();
  });
});
