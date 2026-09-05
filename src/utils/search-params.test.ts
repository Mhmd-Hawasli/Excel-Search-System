import { describe, expect, it } from "vitest";
import { readSearchParam, singleSearchParam } from "@/utils/search-params";

describe("singleSearchParam", () => {
  it("returns the first value of repeated params", () => {
    expect(singleSearchParam(["a", "b"])).toBe("a");
  });

  it("passes single values through and normalizes missing ones", () => {
    expect(singleSearchParam("x")).toBe("x");
    expect(singleSearchParam(undefined)).toBeUndefined();
  });
});

describe("readSearchParam", () => {
  it("returns undefined for empty strings", () => {
    expect(readSearchParam({ q: "" }, "q")).toBeUndefined();
    expect(readSearchParam({}, "q")).toBeUndefined();
  });

  it("reads a non-empty value", () => {
    expect(readSearchParam({ q: "ahmad" }, "q")).toBe("ahmad");
  });
});
